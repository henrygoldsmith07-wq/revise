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

-- Shared trigger: the client sends updated_at, but a direct write (psql, the
-- dashboard) must never leave the column stale or sync would skip the row.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is null or new.updated_at <= old.updated_at then
    new.updated_at = greatest(now(), old.updated_at + interval '1 millisecond');
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

-- --- row-level security -----------------------------------------------------
-- One policy per table, covering all four verbs. `with check` on insert and
-- update stops a client rewriting user_id to another account's id.
do $$
declare
  target text;
begin
  foreach target in array array[
    'cards', 'review_logs', 'questions', 'attempts', 'mistakes',
    'papers', 'planned_sessions', 'exam_dates', 'user_settings', 'streaks'
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
