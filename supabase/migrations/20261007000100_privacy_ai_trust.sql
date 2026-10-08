-- ---------------------------------------------------------------------------
-- Privacy / AI trust migration (additive, idempotent, safe to re-run).
--
-- Apply AFTER supabase/schema.sql has been applied (it relies on auth.users,
-- auth.uid() and public.ai_rate_quota already existing). The same statements
-- are appended to supabase/schema.sql, so re-running schema.sql on a fresh
-- project is equivalent; running both is harmless.
--
-- 1. public.ai_consent — the server's own record of each learner's explicit
--    AI opt-in. /api/ai reads it on every request; owner-only RLS.
-- 2. public.ai_rate_quota.user_id — a real foreign key to auth.users with
--    ON DELETE CASCADE, derived from the existing 'user:<uuid>' key, so quota
--    identifiers cannot survive account deletion. Orphans are removed.
-- 3. purge_account_server_data / account_residual_rows — service-role-only
--    helpers used by the authenticated account-deletion route.
-- 4. purge_expired_server_data — service-role-only retention purge, run daily
--    by the /api/maintenance/retention cron route.
-- ---------------------------------------------------------------------------

-- --- 1. AI consent ------------------------------------------------------------
create table if not exists public.ai_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  consent_version text not null check (length(consent_version) between 1 and 80),
  updated_at timestamptz not null default now()
);

-- Ordering rules for consent rows:
--   * a future device clock is clamped to now() + 5 minutes (as elsewhere);
--   * an opt-in older than the stored decision is ignored (a stale device
--     cannot re-enable AI after a newer revocation);
--   * a revocation ALWAYS applies, whatever the device clock says, and is
--     stamped just after the decision it replaces.
create or replace function public.ai_consent_order()
returns trigger
language plpgsql
as $$
declare
  max_allowed timestamptz := now() + interval '5 minutes';
begin
  if new.updated_at is null then
    new.updated_at := now();
  elsif new.updated_at > max_allowed then
    new.updated_at := max_allowed;
  end if;
  if TG_OP = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'AI consent ownership is immutable' using errcode = '42501';
    end if;
    if new.enabled then
      if new.updated_at <= old.updated_at then
        return old;
      end if;
    elsif new.updated_at <= old.updated_at then
      new.updated_at := old.updated_at + interval '1 millisecond';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_consent_order on public.ai_consent;
create trigger ai_consent_order before insert or update on public.ai_consent
  for each row execute function public.ai_consent_order();

alter table public.ai_consent enable row level security;
drop policy if exists ai_consent_owner on public.ai_consent;
create policy ai_consent_owner on public.ai_consent
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke all on public.ai_consent from anon;
grant select, insert, update, delete on public.ai_consent to authenticated;

-- --- 2. Quota identifiers are owned by a real account ---------------------------
alter table public.ai_rate_quota
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create or replace function public.ai_rate_quota_owner()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null
     and new.key ~ '^user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    new.user_id := substr(new.key, 6)::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_rate_quota_owner on public.ai_rate_quota;
create trigger ai_rate_quota_owner before insert or update on public.ai_rate_quota
  for each row execute function public.ai_rate_quota_owner();

-- Backfill existing rows whose account still exists, then remove every row
-- that has no owning account (identifiers left behind by deleted users).
update public.ai_rate_quota q
   set user_id = substr(q.key, 6)::uuid
 where q.user_id is null
   and q.key ~ '^user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and exists (select 1 from auth.users u where u.id = substr(q.key, 6)::uuid);
delete from public.ai_rate_quota where user_id is null;
alter table public.ai_rate_quota alter column user_id set not null;
create index if not exists ai_rate_quota_user_idx on public.ai_rate_quota (user_id);
create index if not exists ai_rate_quota_updated_idx on public.ai_rate_quota (updated_at);

-- --- 3. Account deletion helpers (service role only) -----------------------------
-- Rows without an auth.users cascade path. Deleting the auth user afterwards
-- cascades every other user-owned table (see schema.sql).
create or replace function public.purge_account_server_data(p_user_id uuid)
returns table(scope text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if p_user_id is null then
    raise exception 'user id required' using errcode = '22023';
  end if;
  delete from public.ai_rate_quota where user_id = p_user_id or key = 'user:' || p_user_id::text;
  get diagnostics n = row_count;
  scope := 'ai_rate_quota'; removed := n; return next;
  delete from public.ai_consent where user_id = p_user_id;
  get diagnostics n = row_count;
  scope := 'ai_consent'; removed := n; return next;
end;
$$;

-- Every public table with a user_id column is discovered at call time, so a
-- table added later is covered without editing this function. Returns only
-- the scopes that still hold rows for the account (empty = fully erased).
create or replace function public.account_residual_rows(p_user_id uuid)
returns table(scope text, remaining bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  n bigint;
begin
  for t in
    select c.table_name::text as name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'user_id'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where user_id = $1', t.name) into n using p_user_id;
    if n > 0 then
      scope := t.name; remaining := n; return next;
    end if;
  end loop;
  select count(*) into n from public.ai_rate_quota where key = 'user:' || p_user_id::text;
  if n > 0 then
    scope := 'ai_rate_quota:key'; remaining := n; return next;
  end if;
  select count(*) into n from auth.users where id = p_user_id;
  if n > 0 then
    scope := 'auth.users'; remaining := n; return next;
  end if;
end;
$$;

-- --- 4. Retention purge (service role only) --------------------------------------
-- A quota row untouched for two days holds no state that changes any future
-- decision: the per-minute bucket has long refilled to its burst and the daily
-- counter resets on the next UTC day, which is exactly what a freshly seeded
-- row gives. Deleting it loses nothing and stops an identifier lingering.
create or replace function public.purge_expired_server_data()
returns table(scope text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.ai_rate_quota where updated_at < now() - interval '2 days';
  get diagnostics n = row_count;
  scope := 'ai_rate_quota'; removed := n; return next;
end;
$$;

revoke all on function public.purge_account_server_data(uuid) from public, anon, authenticated;
revoke all on function public.account_residual_rows(uuid) from public, anon, authenticated;
revoke all on function public.purge_expired_server_data() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.purge_account_server_data(uuid) to service_role';
    execute 'grant execute on function public.account_residual_rows(uuid) to service_role';
    execute 'grant execute on function public.purge_expired_server_data() to service_role';
  end if;
end;
$$;
