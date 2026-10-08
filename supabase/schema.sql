-- ---------------------------------------------------------------------------
-- Revise — Postgres schema (Supabase).
--
-- Supabase is a *replica*, not the source of truth: IndexedDB on the device
-- holds the primary copy and drains an outbox into these tables. That shapes
-- the design in two ways.
--
-- 1. Every table stores the whole domain object in a `data` jsonb column and
--    lifts out only the columns the server needs to filter, index or secure
--    on. A new field in the TypeScript domain model needs no migration, which
--    matters when the client can be weeks out of date and still syncing.
-- 2. Conflict resolution is last-write-wins on `updated_at`, applied per row
--    by the client. The server bounds that timestamp (see touch_updated_at):
--    a device clock days in the future cannot push the pull cursor ahead of
--    legitimate rows, and a stale write can never replace a newer row.
--
-- Every table is protected by row-level security keyed on auth.uid(), so one
-- student can never read or write another's revision data.
-- ---------------------------------------------------------------------------

-- Shared trigger: the client sends updated_at, but two server-side bounds
-- keep one bad clock from corrupting sync for every device.
--
-- 1. Future clamp: any timestamp more than 5 minutes ahead of the database
--    clock is rewritten to now() + 5 minutes. Without this, a single row from
--    a device days in the future would advance every other device's pull
--    cursor past all legitimate rows beneath it, hiding them forever.
-- 2. Monotonic update: on UPDATE, a stale/duplicate device write (new <= old)
--    must never replace a newer row. Returning OLD makes the comparison
--    atomic inside the UPDATE used by Supabase upsert; no client-side race can
--    make an older answer, card state or review log win.
--
-- The trigger runs on INSERT as well as UPDATE so the first write is also
-- bounded. sync_writes carries no updated_at column and is excluded: it is an
-- append-only ledger keyed by idempotency UUID, never LWW-compared.
create or replace function public.touch_updated_at()
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
  if TG_OP = 'UPDATE' and new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

-- --- flashcards -------------------------------------------------------------
create table if not exists public.cards (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  -- Lifted out of `data` because the review queue filters on it constantly.
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists cards_user_due_idx on public.cards (user_id, due);
create index if not exists cards_user_topic_idx on public.cards (user_id, topic_id);
create index if not exists cards_user_updated_idx on public.cards (user_id, updated_at);

-- --- review history ---------------------------------------------------------
-- Append-only. Kept in full because FSRS parameter optimisation, if it is ever
-- added, needs the raw grade history and cannot reconstruct it from card state.
create table if not exists public.review_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists review_logs_user_updated_idx on public.review_logs (user_id, updated_at);

-- --- questions --------------------------------------------------------------
-- Holds AI-generated questions and questions extracted from uploaded papers.
-- The authored seed bank ships in the app bundle and is never synced.
create table if not exists public.questions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists questions_user_subject_idx on public.questions (user_id, subject_id);
create index if not exists questions_user_updated_idx on public.questions (user_id, updated_at);

-- --- marked attempts --------------------------------------------------------
create table if not exists public.attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists attempts_user_subject_idx on public.attempts (user_id, subject_id);
create index if not exists attempts_user_updated_idx on public.attempts (user_id, updated_at);

-- --- mistakes ---------------------------------------------------------------
create table if not exists public.mistakes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists mistakes_user_topic_idx on public.mistakes (user_id, topic_id);
create index if not exists mistakes_user_updated_idx on public.mistakes (user_id, updated_at);

-- --- uploaded papers --------------------------------------------------------
create table if not exists public.papers (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists papers_user_subject_idx on public.papers (user_id, subject_id);
create index if not exists papers_user_updated_idx on public.papers (user_id, updated_at);

-- --- planned sessions -------------------------------------------------------
create table if not exists public.planned_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists planned_sessions_user_date_idx on public.planned_sessions (user_id, date);
create index if not exists planned_sessions_user_updated_idx on public.planned_sessions (user_id, updated_at);

-- --- exam dates -------------------------------------------------------------
create table if not exists public.exam_dates (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists exam_dates_user_updated_idx on public.exam_dates (user_id, updated_at);

-- --- singleton rows ---------------------------------------------------------
-- Settings and streak are one row per user, so user_id is the primary key and
-- the client upserts on it directly.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  id uuid,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  id uuid,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Completed lessons + lesson streak: one row per user, so the client
-- upserts on user_id directly, exactly like settings and streaks.
create table if not exists public.lesson_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  id uuid,
  subject_id text,
  topic_id text,
  due date,
  date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- --- idempotency ledger -------------------------------------------------------
-- Best-effort delivery diagnostics. Stable entity ids and replay-safe merges
-- enforce retry correctness; this ledger is not transactional with those writes.
create table if not exists public.sync_writes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sync_writes_user_created_idx on public.sync_writes (user_id, created_at);

-- --- AI rate-limit quota ------------------------------------------------------
-- Shared limiter state for the /api/ai route so per-user quotas hold across
-- server instances. One row per authenticated user; the token-bucket
-- arithmetic runs atomically inside consume_ai_quota (row lock), so
-- concurrent requests cannot overspend the same bucket. Clients never touch
-- this table directly — RLS is enabled with no policies, and only the
-- SECURITY DEFINER function below reads and writes it.
create table if not exists public.ai_rate_quota (
  key text primary key,
  tokens double precision not null default 0,
  updated_at timestamptz not null default now(),
  day date not null default CURRENT_DATE,
  used_day integer not null default 0
);
alter table public.ai_rate_quota enable row level security;

-- Atomic quota consumption: per-minute token bucket (burst + sustained rate)
-- plus a UTC-day allowance, checked longest-window first. Returns one row:
-- (ok, remaining, retry_after_seconds, limited_by). Throws unless the key
-- matches the caller's auth.uid(), so one student can never spend another's
-- quota even though the function bypasses RLS.
create or replace function public.consume_ai_quota(
  p_key text,
  p_cost integer,
  p_rate_per_min double precision,
  p_burst integer,
  p_daily_limit integer
)
returns table(ok boolean, remaining integer, retry_after_seconds integer, limited_by text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_today date := CURRENT_DATE;
  v_row public.ai_rate_quota%ROWTYPE;
  v_tokens double precision;
  v_used_day integer;
begin
  if auth.uid() is null or p_key <> 'user:' || auth.uid()::text then
    raise exception 'ai quota key must match the authenticated user';
  end if;
  if p_cost is null or p_cost < 1 then
    p_cost := 1;
  end if;
  if p_burst is null or p_burst < 1 then
    p_burst := 1;
  end if;
  if p_rate_per_min is null or p_rate_per_min <= 0 then
    p_rate_per_min := p_burst::double precision;
  end if;
  -- Seed the row, then lock it. ON CONFLICT DO NOTHING makes two simultaneous
  -- first requests serialise on the primary key: the second waits for the first
  -- transaction to commit and then locks the committed row. A bare SELECT ...
  -- FOR UPDATE would report "not found" to both, and their final upserts would
  -- then overwrite each other and overspend the opening burst.
  insert into public.ai_rate_quota(key, tokens, updated_at, day, used_day)
    values (p_key, p_burst::double precision, v_now, v_today, 0)
    on conflict (key) do nothing;
  select * into v_row from public.ai_rate_quota where key = p_key for update;
  v_tokens := least(
    p_burst::double precision,
    v_row.tokens + extract(epoch from (v_now - v_row.updated_at)) * p_rate_per_min / 60.0
  );
  v_used_day := case when v_row.day < v_today then 0 else v_row.used_day end;
  if p_daily_limit is not null and v_used_day + p_cost > p_daily_limit then
    update public.ai_rate_quota
       set tokens = v_tokens, updated_at = v_now, day = v_today, used_day = v_used_day
     where key = p_key;
    return query select false, 0,
      greatest(1, ceil(extract(epoch from ((v_today + 1)::timestamptz - v_now))))::integer,
      'daily'::text;
    return;
  end if;
  if v_tokens < p_cost then
    update public.ai_rate_quota
       set tokens = v_tokens, updated_at = v_now, day = v_today, used_day = v_used_day
     where key = p_key;
    return query select false, 0,
      greatest(1, ceil((p_cost - v_tokens) / (p_rate_per_min / 60.0)))::integer,
      'minute'::text;
    return;
  end if;
  update public.ai_rate_quota
     set tokens = v_tokens - p_cost, updated_at = v_now, day = v_today,
         used_day = v_used_day + p_cost
   where key = p_key;
  return query select true, greatest(0, floor(v_tokens - p_cost))::integer, 0, null::text;
end;
$$;

-- Only the signed-in student who owns the row may spend it. Revoking the
-- implicit public execute grant keeps the bucket unreachable by anon traffic
-- and by any other RPC caller.
revoke all on function public.consume_ai_quota(text, integer, double precision, integer, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer, double precision, integer, integer) to authenticated;

-- --- row-level security -----------------------------------------------------
-- One policy per table, covering all four verbs. `with check` on insert and
-- update stops a client rewriting user_id to another account's id.
do $$
declare
  target text;
begin
  foreach target in array array[
    'cards', 'review_logs', 'questions', 'attempts', 'mistakes',
    'papers', 'planned_sessions', 'exam_dates', 'user_settings', 'streaks',
    'lesson_progress', 'sync_writes'
  ]
  loop
    execute format('alter table public.%I enable row level security', target);
    execute format('drop policy if exists %I on public.%I', target || '_owner', target);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      target || '_owner', target
    );
  end loop;
  -- LWW data tables only: sync_writes has no updated_at column (append-only
  -- ledger), and ai_rate_quota is written solely by its SECURITY DEFINER
  -- function. Attaching the touch trigger to either would error on write.
  foreach target in array array[
    'cards', 'review_logs', 'questions', 'attempts', 'mistakes',
    'papers', 'planned_sessions', 'exam_dates', 'user_settings', 'streaks',
    'lesson_progress'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_touch', target);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      target || '_touch', target
    );
    execute format('drop trigger if exists %I on public.%I', target || '_touch_insert', target);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.touch_updated_at()',
      target || '_touch_insert', target
    );
  end loop;
end;
$$;

-- Keyset pulls sort by (updated_at, id) within one owner.
create index if not exists cards_sync_keyset_idx on public.cards (user_id, updated_at, id);
create index if not exists review_logs_sync_keyset_idx on public.review_logs (user_id, updated_at, id);
create index if not exists questions_sync_keyset_idx on public.questions (user_id, updated_at, id);
create index if not exists attempts_sync_keyset_idx on public.attempts (user_id, updated_at, id);
create index if not exists mistakes_sync_keyset_idx on public.mistakes (user_id, updated_at, id);
create index if not exists papers_sync_keyset_idx on public.papers (user_id, updated_at, id);
create index if not exists planned_sessions_sync_keyset_idx on public.planned_sessions (user_id, updated_at, id);
create index if not exists exam_dates_sync_keyset_idx on public.exam_dates (user_id, updated_at, id);
create index if not exists user_settings_sync_keyset_idx on public.user_settings (user_id, updated_at, id);
create index if not exists streaks_sync_keyset_idx on public.streaks (user_id, updated_at, id);
create index if not exists lesson_progress_sync_keyset_idx on public.lesson_progress (user_id, updated_at, id);

-- --- Continuity protocol v2 --------------------------------------------------
-- Additive migration: legacy study tables keep their columns and conflict rules.
-- Each account's continuity writes share a transaction-wide advisory lock, so
-- sequence allocation follows commit order. No student clock orders this feed.
create sequence if not exists public.revise_change_seq;

create table if not exists public.learner_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gradePredictions','gradeActuals','paperOutcomes','interventionOutcomes')),
  data jsonb not null,
  lamport bigint not null check (lamport between 0 and 9007199254740991),
  device_id text not null check (length(device_id) > 0),
  deleted boolean not null default false,
  frozen_fingerprint text not null default '',
  change_seq bigint not null default nextval('public.revise_change_seq'),
  updated_at timestamptz not null default now()
);
create index if not exists learner_records_cursor_idx on public.learner_records(user_id, change_seq);

create table if not exists public.sync_tombstones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null check (table_name in ('cards','review_logs','questions','attempts','mistakes','papers','planned_sessions','exam_dates')),
  row_id uuid not null,
  local_id text check (local_id is null or length(local_id) > 0),
  change_seq bigint not null default nextval('public.revise_change_seq'),
  updated_at timestamptz not null default now(),
  unique(user_id, table_name, row_id)
);
alter table public.sync_tombstones alter column local_id drop not null;
create index if not exists sync_tombstones_cursor_idx on public.sync_tombstones(user_id, change_seq);

alter table public.learner_records enable row level security;
alter table public.sync_tombstones enable row level security;
drop policy if exists learner_records_owner on public.learner_records;
create policy learner_records_owner on public.learner_records for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists sync_tombstones_owner on public.sync_tombstones;
drop policy if exists sync_tombstones_read on public.sync_tombstones;
drop policy if exists sync_tombstones_insert on public.sync_tombstones;
create policy sync_tombstones_read on public.sync_tombstones for select to authenticated using (user_id = auth.uid());
create policy sync_tombstones_insert on public.sync_tombstones for insert to authenticated with check (user_id = auth.uid());

create or replace function public.order_continuity_change()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 72919));
  if TG_OP = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'Continuity ownership is immutable' using errcode = '42501'; end if;
    if TG_TABLE_NAME = 'sync_tombstones' then return old; end if;
    if new.kind <> old.kind then raise exception 'History kind is immutable' using errcode = '23514'; end if;
    if old.deleted then return old; end if;
    if not new.deleted then
      if (new.lamport, new.device_id collate "C") <= (old.lamport, old.device_id collate "C") then return old; end if;
      if new.frozen_fingerprint <> old.frozen_fingerprint then raise exception 'Frozen prediction changed' using errcode = '23514'; end if;
      if old.kind = 'gradePredictions' and new.data <> old.data then return old; end if;
    end if;
  end if;
  new.change_seq := nextval('public.revise_change_seq');
  new.updated_at := clock_timestamp();
  return new;
end; $$;
drop trigger if exists learner_records_order on public.learner_records;
create trigger learner_records_order before insert or update on public.learner_records for each row execute function public.order_continuity_change();
drop trigger if exists sync_tombstones_order on public.sync_tombstones;
create trigger sync_tombstones_order before insert or update on public.sync_tombstones for each row execute function public.order_continuity_change();

-- Old clients still upsert into legacy tables. Guard those writes as well as
-- the new client: a deleted UUID is terminal, however new its timestamp is.
create or replace function public.guard_replica_resurrection()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 72919));
  if exists (select 1 from public.sync_tombstones where user_id = new.user_id and table_name = TG_TABLE_NAME and row_id = new.id) then
    return null;
  end if;
  return new;
end; $$;

-- Direct hard deletes from older clients must also retain intent. Encrypted
-- payloads do not expose educational IDs: null local_id means wire suppression.
create or replace function public.record_replica_deletion()
returns trigger language plpgsql security invoker set search_path = public as $$
declare deleted_constraint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(old.user_id::text, 72919));
  begin
    insert into public.sync_tombstones(user_id, table_name, row_id, local_id)
      values(old.user_id, TG_TABLE_NAME, old.id, null)
      on conflict on constraint sync_tombstones_user_id_table_name_row_id_key do nothing;
  exception when foreign_key_violation then
    get stacked diagnostics deleted_constraint = CONSTRAINT_NAME;
    -- The auth.users ON DELETE CASCADE has already removed the parent.
    -- Account erasure must not attempt to retain a marker for a missing owner.
    if deleted_constraint <> 'sync_tombstones_user_id_fkey' then raise; end if;
  end;
  return old;
end; $$;

do $$ declare table_name text; begin
  foreach table_name in array array['cards','review_logs','questions','attempts','mistakes','papers','planned_sessions','exam_dates'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_delete_guard', table_name);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.guard_replica_resurrection()', table_name || '_delete_guard', table_name);
    execute format('drop trigger if exists %I on public.%I', table_name || '_retain_delete', table_name);
    execute format('create trigger %I before delete on public.%I for each row execute function public.record_replica_deletion()', table_name || '_retain_delete', table_name);
  end loop;
end; $$;

-- Security invoker: both the hard delete and marker insert exercise owner RLS.
-- The shared advisory lock closes the race with a concurrent old-client upsert.
create or replace function public.delete_replica_row(entity_name text, row_id uuid, local_id text, expected_owner uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare target_table text; owner uuid := auth.uid(); begin
  if owner is null or expected_owner is distinct from owner then raise exception 'Authentication/ownership mismatch' using errcode = '42501'; end if;
  target_table := case entity_name
    when 'cards' then 'cards' when 'reviewLogs' then 'review_logs' when 'questions' then 'questions'
    when 'attempts' then 'attempts' when 'mistakes' then 'mistakes' when 'papers' then 'papers'
    when 'plannedSessions' then 'planned_sessions' when 'examDates' then 'exam_dates' else null end;
  if target_table is null or local_id is null or length(local_id) = 0 then raise exception 'Invalid deletion entity or id' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 72919));
  insert into public.sync_tombstones(user_id, table_name, row_id, local_id)
    values(owner, target_table, row_id, local_id) on conflict on constraint sync_tombstones_user_id_table_name_row_id_key do nothing;
  execute format('delete from public.%I where id = $1 and user_id = $2', target_table) using row_id, owner;
end; $$;
revoke all on function public.delete_replica_row(text, uuid, text, uuid) from public;
grant execute on function public.delete_replica_row(text, uuid, text, uuid) to authenticated;
grant usage on sequence public.revise_change_seq to authenticated;
revoke delete on public.learner_records from authenticated;
revoke update, delete on public.sync_tombstones from authenticated;
grant select, insert, update on public.learner_records to authenticated;
grant select, insert on public.sync_tombstones to authenticated;

-- ===========================================================================
-- Included verbatim from supabase/migrations/20261007000100_privacy_ai_trust.sql
-- ===========================================================================
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

-- ---------------------------------------------------------------------------
-- Reviewer portal migration (additive, idempotent, safe to re-run).
--
-- Apply AFTER supabase/schema.sql and 20261007000100_privacy_ai_trust.sql.
-- The same statements are appended to supabase/schema.sql.
--
-- 1. public.reviewer_roles — who may review. Granted ONLY by the service role
--    (or the SQL editor) through grant_reviewer_role(); a signed-in user can
--    read their own row and nothing else, and can never insert or update it.
-- 2. public.is_active_reviewer() — SECURITY DEFINER role check used by RLS.
-- 3. public.review_audit_events — the runtime continuation of the committed,
--    hash-chained review audit log (src/content/reviews/wjec-review-audit-log.json).
--    Same event shape, same hash function (computed by the domain layer on the
--    server), same chain: the first runtime event links to the committed tail.
--    Insert-only for active reviewers; UPDATE/DELETE/TRUNCATE are revoked and
--    a trigger rejects them for every role, including the service role.
-- ---------------------------------------------------------------------------

-- --- 1. Reviewer roles -----------------------------------------------------------
create table if not exists public.reviewer_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- WJEC_ATTESTATION_ROLES in src/domain/trust-attestation.ts.
  role text not null check (role in ('teacher', 'examiner', 'subject-expert')),
  -- The pseudonymous reviewer id written into every audit event (e.g. 'teacher-jsmith').
  reviewer_label text not null unique check (reviewer_label ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  qualification text not null check (length(qualification) between 3 and 300),
  granted_by text not null check (length(granted_by) between 1 and 120),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.reviewer_roles enable row level security;
drop policy if exists reviewer_roles_self_read on public.reviewer_roles;
create policy reviewer_roles_self_read on public.reviewer_roles for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.reviewer_roles from anon, authenticated;

create or replace function public.is_active_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reviewer_roles
     where user_id = auth.uid() and revoked_at is null
  );
$$;
revoke all on function public.is_active_reviewer() from public, anon;
grant execute on function public.is_active_reviewer() to authenticated;

-- Grant or update a reviewer. Service role / SQL editor only: there is no path
-- by which a signed-in user can make themselves (or anyone) a reviewer.
create or replace function public.grant_reviewer_role(
  p_user_id uuid,
  p_reviewer_label text,
  p_role text,
  p_qualification text,
  p_granted_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reviewer_roles (user_id, role, reviewer_label, qualification, granted_by, granted_at, revoked_at)
  values (p_user_id, p_role, p_reviewer_label, p_qualification, p_granted_by, now(), null)
  on conflict (user_id) do update
    set role = excluded.role,
        reviewer_label = excluded.reviewer_label,
        qualification = excluded.qualification,
        granted_by = excluded.granted_by,
        granted_at = now(),
        revoked_at = null;
end;
$$;

create or replace function public.revoke_reviewer_role(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reviewer_roles set revoked_at = now() where user_id = p_user_id and revoked_at is null;
$$;

revoke all on function public.grant_reviewer_role(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_reviewer_role(uuid) from public, anon, authenticated;

-- --- 2. Runtime review audit log ---------------------------------------------------
create table if not exists public.review_audit_events (
  seq integer primary key check (seq > 0),
  previous_hash text not null unique,
  hash text not null unique check (hash ~ '^sha256:[0-9a-f]{64}$'),
  question_id text not null check (length(question_id) between 1 and 200),
  subject_id text not null check (length(subject_id) between 1 and 120),
  content_fingerprint text not null check (length(content_fingerprint) between 1 and 200),
  decision text not null check (decision in ('approve', 'reject', 'revise')),
  reviewer_id text not null,
  -- Deliberately NOT a foreign key: an attestation is audit history and must
  -- outlive the reviewer's account. The reviewer is identified publicly only
  -- by reviewer_id (a pseudonymous label); this uuid never leaves the server.
  reviewer_user_id uuid not null,
  -- The complete domain event (ReviewAuditEvent) exactly as hashed.
  event jsonb not null,
  recorded_at timestamptz not null default now()
);
create index if not exists review_audit_events_question_idx on public.review_audit_events (question_id, content_fingerprint);

create or replace function public.review_audit_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tail record;
  reviewer record;
begin
  if TG_OP <> 'INSERT' then
    raise exception 'review_audit_events is append-only' using errcode = '42501';
  end if;
  -- Serialise appends so two reviewers cannot fork the chain.
  perform pg_advisory_xact_lock(hashtext('public.review_audit_events'));
  select seq, hash into tail from public.review_audit_events order by seq desc limit 1;
  if found and (new.seq <> tail.seq + 1 or new.previous_hash <> tail.hash) then
    raise exception 'review audit chain moved on: expected seq % after %', tail.seq + 1, tail.hash using errcode = '40001';
  end if;
  -- The stored columns must mirror the hashed event exactly.
  if (new.event->>'seq')::integer is distinct from new.seq
     or new.event->>'hash' is distinct from new.hash
     or new.event->>'previousHash' is distinct from new.previous_hash
     or new.event->>'questionId' is distinct from new.question_id
     or new.event->>'subjectId' is distinct from new.subject_id
     or new.event->>'contentFingerprint' is distinct from new.content_fingerprint
     or new.event->>'decision' is distinct from new.decision
     or new.event->>'reviewerId' is distinct from new.reviewer_id then
    raise exception 'review audit event does not match its columns' using errcode = '22023';
  end if;
  -- A signed-in caller can only record as themselves, with the role and
  -- qualification the service role granted them.
  if auth.uid() is not null then
    select * into reviewer from public.reviewer_roles where user_id = auth.uid() and revoked_at is null;
    if not found
       or new.reviewer_user_id <> auth.uid()
       or new.reviewer_id <> reviewer.reviewer_label
       or new.event->>'reviewerRole' is distinct from reviewer.role
       or new.event->>'reviewerQualification' is distinct from reviewer.qualification then
      raise exception 'review decision does not match the caller''s reviewer grant' using errcode = '42501';
    end if;
  end if;
  new.recorded_at := now();
  return new;
end;
$$;

drop trigger if exists review_audit_events_append on public.review_audit_events;
create trigger review_audit_events_append before insert on public.review_audit_events
  for each row execute function public.review_audit_events_guard();
drop trigger if exists review_audit_events_immutable on public.review_audit_events;
create trigger review_audit_events_immutable before update or delete on public.review_audit_events
  for each row execute function public.review_audit_events_guard();

alter table public.review_audit_events enable row level security;
drop policy if exists review_audit_events_reviewer_read on public.review_audit_events;
create policy review_audit_events_reviewer_read on public.review_audit_events for select to authenticated using (public.is_active_reviewer());
drop policy if exists review_audit_events_reviewer_insert on public.review_audit_events;
create policy review_audit_events_reviewer_insert on public.review_audit_events for insert to authenticated with check (reviewer_user_id = auth.uid() and public.is_active_reviewer());
revoke update, delete, truncate on public.review_audit_events from anon, authenticated;
revoke all on public.review_audit_events from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.grant_reviewer_role(uuid, text, text, text, text) to service_role';
    execute 'grant execute on function public.revoke_reviewer_role(uuid) to service_role';
    execute 'revoke update, delete, truncate on public.review_audit_events from service_role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Batched sync push (additive, idempotent, safe to re-run).
--
-- Apply AFTER supabase/schema.sql. The same statements are appended to
-- supabase/schema.sql.
--
-- public.sync_push_batch(p_rows, p_idempotency_keys) upserts a drain's rows
-- for SEVERAL synced tables in ONE request and ONE transaction: a finished mock
-- paper (attempts, mistakes, cards, review logs, the paper row) is one round
-- trip instead of one request per entity, and either all of it lands or none.
--
-- It is SECURITY INVOKER on purpose: every row still passes the table's own
-- owner RLS policy and the touch_updated_at / clock-clamp triggers, exactly as
-- the per-table PostgREST upsert did. Conflict semantics match PostgREST's
-- merge-duplicates upsert: ON CONFLICT (primary key) DO UPDATE SET each column
-- the row supplied. Clients fall back to per-table upserts when this function
-- is not installed yet.
-- ---------------------------------------------------------------------------

create or replace function public.sync_push_batch(p_rows jsonb, p_idempotency_keys uuid[] default '{}')
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  tbl text;
  pk text;
  row_data jsonb;
  cols text[];
  col_list text;
  set_list text;
  n integer := 0;
begin
  if uid is null then
    raise exception 'sync_push_batch requires a signed-in user' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'sync batch too large (max 500 rows)' using errcode = '54000';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    tbl := item->>'table';
    if tbl is null or not (tbl = any (array[
      'learner_records', 'cards', 'review_logs', 'attempts', 'mistakes', 'questions',
      'papers', 'planned_sessions', 'exam_dates', 'user_settings', 'streaks', 'lesson_progress'
    ])) then
      raise exception 'table % is not a synced table', coalesce(tbl, '(null)') using errcode = '42501';
    end if;
    pk := case when tbl in ('user_settings', 'streaks', 'lesson_progress') then 'user_id' else 'id' end;
    row_data := item->'row';
    if row_data is null or jsonb_typeof(row_data) <> 'object' then
      raise exception 'sync row must be a JSON object' using errcode = '22023';
    end if;
    -- Owner check before RLS even sees it: a mixed-owner batch fails whole.
    if (row_data->>'user_id') is distinct from uid::text then
      raise exception 'sync row owner does not match the signed-in user' using errcode = '42501';
    end if;
    select array_agg(k order by k) into cols from jsonb_object_keys(row_data) as k;
    if not (pk = any (cols)) then
      raise exception 'sync row for % is missing its primary key', tbl using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(cols) as c
       where not exists (
         select 1 from information_schema.columns ic
          where ic.table_schema = 'public' and ic.table_name = tbl and ic.column_name = c
       )
    ) then
      raise exception 'sync row for % has an unknown column', tbl using errcode = '42703';
    end if;
    select string_agg(format('%I', c), ', ') into col_list from unnest(cols) as c;
    select string_agg(format('%I = excluded.%I', c, c), ', ') into set_list from unnest(cols) as c where c <> pk;
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (%I) do %s',
      tbl, col_list, col_list, tbl, pk,
      case when set_list is null then 'nothing' else 'update set ' || set_list end
    ) using row_data;
    n := n + 1;
  end loop;

  -- Delivered mutation keys commit in the same transaction as the rows.
  if p_idempotency_keys is not null and array_length(p_idempotency_keys, 1) > 0 then
    insert into public.sync_writes (id, user_id)
    select k, uid from unnest(p_idempotency_keys) as k
    on conflict (id) do nothing;
  end if;

  return n;
end;
$$;

revoke all on function public.sync_push_batch(jsonb, uuid[]) from public, anon;
grant execute on function public.sync_push_batch(jsonb, uuid[]) to authenticated;
