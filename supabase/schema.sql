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
--    by the client. The server only has to accept the upsert.
--
-- Every table is protected by row-level security keyed on auth.uid(), so one
-- student can never read or write another's revision data.
-- ---------------------------------------------------------------------------

-- Shared trigger: the client sends updated_at, but a stale/duplicate device
-- write must never replace a newer row. Returning OLD makes the comparison
-- atomic inside the UPDATE used by Supabase upsert; no client-side race can
-- make an older answer, card state or review log win.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is null or new.updated_at <= old.updated_at then
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
-- The outbox retries on flaky networks, and a request that times out may have
-- actually committed. Without a ledger, a retried push upserts the same review
-- twice: FSRS sees a phantom extra grade, accuracy metrics double-count, and a
-- "sync_writes" row is the server-side dedup guard.
--
-- Every queued mutation carries a UUID idempotency key. The client claims the
-- key on first delivery; a replayed request hits `on conflict do nothing` and
-- is acknowledged as already-applied instead of writing a second time.
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
    execute format('drop trigger if exists %I on public.%I', target || '_touch', target);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      target || '_touch', target
    );
  end loop;
end;
$$;
