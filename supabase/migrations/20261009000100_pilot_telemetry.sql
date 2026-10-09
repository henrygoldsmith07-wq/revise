-- ---------------------------------------------------------------------------
-- Pilot telemetry + marking disputes (additive, idempotent, safe to re-run).
--
-- Apply AFTER supabase/schema.sql has been applied. The same statements are
-- appended to supabase/schema.sql, so re-running schema.sql on a fresh
-- project is equivalent; running both is harmless.
--
-- 1. public.product_events — opt-in, anonymous pilot telemetry. One row per
--    outcome event (diagnostic completion, recommendation start, recovered
--    marks, delayed-proof completion, time from first loss to proof, proof
--    blocked by supply). Insert-only for signed-in learners; NO select/update/
--    delete policy exists, so clients cannot read anyone's events. Columns are
--    a closed allow-list: event name, counts, coarse UTC day (server-stamped).
--    No free text, no raw answers, no device data. user_id carries
--    ON DELETE CASCADE, and account_residual_rows() discovers the table by its
--    user_id column, so account deletion verification covers it automatically.
-- 2. public.marking_disputes — a learner's explicitly shared disputed marks.
--    Local records stay on device (markingFlags store); a row lands here only
--    when the learner taps "share with the Revise team" on one dispute.
--    Insert-only, same read-nobody grants. A dispute never changes a mark,
--    question trust or proof; it is routed to a human.
-- ---------------------------------------------------------------------------

-- --- 1. Pilot telemetry events ------------------------------------------------
create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Rotating pseudonym minted on device (rotated daily); joins a learner's
  -- events within a rotation window without ever carrying the account id.
  anon_id text not null check (anon_id ~ '^[0-9a-fA-F-]{8,64}$'),
  event text not null check (event in (
    'diagnostic.completed',
    'recommendation.started',
    'marks.recovered',
    'proof.completed',
    'first-loss-to-proof',
    'proof.blocked'
  )),
  -- Curriculum subject id only (e.g. 'wjec-alevel-physics'); never free text.
  subject_id text check (subject_id is null or (length(subject_id) between 1 and 120)),
  count_value integer check (count_value is null or (count_value >= 0 and count_value <= 1000000)),
  minutes_value integer check (minutes_value is null or (minutes_value >= 0 and minutes_value <= 100000)),
  -- Coarse timestamp, stamped by the server: UTC day only, never an instant.
  day date not null default ((now() at time zone 'utc')::date)
);
create index if not exists product_events_day_idx on public.product_events (day, event);

alter table public.product_events enable row level security;
drop policy if exists product_events_insert on public.product_events;
create policy product_events_insert on public.product_events
  for insert to authenticated
  with check (user_id = auth.uid());
-- No select/update/delete policy: clients can write their own rows and read
-- nothing. Service role (pilot aggregation) bypasses RLS.
revoke select, update, delete, truncate on public.product_events from anon, authenticated;

-- --- 2. Shared marking disputes -----------------------------------------------
create table if not exists public.marking_disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  anon_id text not null check (anon_id ~ '^[0-9a-fA-F-]{8,64}$'),
  attempt_id text not null check (length(attempt_id) between 1 and 200),
  question_id text not null check (length(question_id) between 1 and 200),
  part_id text not null check (length(part_id) between 1 and 200),
  subject_id text not null check (length(subject_id) between 1 and 120),
  reason text not null check (reason in ('wrong-mark', 'unclear-question', 'wrong-scheme', 'other')),
  -- The learner's own note, capped server-side; the only free text in either
  -- table, and only what the learner typed for this dispute.
  note text not null default '' check (length(note) <= 500),
  awarded integer check (awarded is null or (awarded >= 0 and awarded <= 30)),
  max_marks integer not null check (max_marks >= 0 and max_marks <= 30),
  marked_by text not null check (marked_by in ('ai', 'rubric', 'self')),
  day date not null default ((now() at time zone 'utc')::date)
);
create index if not exists marking_disputes_day_idx on public.marking_disputes (day);

alter table public.marking_disputes enable row level security;
drop policy if exists marking_disputes_insert on public.marking_disputes;
create policy marking_disputes_insert on public.marking_disputes
  for insert to authenticated
  with check (user_id = auth.uid());
revoke select, update, delete, truncate on public.marking_disputes from anon, authenticated;
