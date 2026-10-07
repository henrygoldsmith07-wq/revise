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
