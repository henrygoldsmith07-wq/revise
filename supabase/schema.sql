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
