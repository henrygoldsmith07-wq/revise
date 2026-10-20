-- ---------------------------------------------------------------------------
-- Reviewer audit-log integrity (additive, idempotent, safe to re-run).
-- Apply after 20261014000200_reviewer_validation.sql; appended to schema.sql too.
--
-- An active reviewer can INSERT into public.review_audit_events directly over
-- PostgREST, bypassing the portal route. Before this migration the guard
-- trigger checked shape, grant binding and seq/previous_hash continuity, but
-- not the things src/domain/review-workflow.ts auditLogIssues rejects. One such
-- row made combineAuditLog report issues, so every reviewer's decisions and
-- export requests failed, and (UPDATE/DELETE being revoked even from the
-- service role) only the database owner could recover. The guard now refuses
-- every row auditLogIssues would flag:
--
-- 1. The database recomputes `hash`. review_audit_canonical_json() reproduces
--    canonicalJson() in src/domain/content-fingerprint.ts (keys sorted by code
--    unit, undefined dropped, JSON.stringify string escaping, which matches
--    PostgreSQL's jsonb string escaping), and review_audit_event_hash() is
--    'sha256:' || hex(sha256(utf8(canonical(event minus hash)))), exactly
--    eventHash(). It fails closed on anything it cannot reproduce exactly:
--    object keys outside [A-Za-z0-9_] and non-integer numbers raise. The event
--    may carry only the ReviewAuditEvent fields, so nothing else is hashed.
--    Built-in sha256() (PostgreSQL 11+) is used, so no pgcrypto is needed.
-- 2. public.review_audit_anchor holds the committed log's tail. The first row
--    of an empty runtime table must continue it (seq = tail_seq + 1,
--    previous_hash = tail_hash); before, an empty table accepted any seq and
--    previous_hash. Seeded with the committed log's current tail (0, genesis).
--    Only the service role may move it, through set_review_audit_anchor(),
--    and only while the runtime table is still empty.
-- 3. No second approval of the same question + content fingerprint by the
--    same reviewer without a reject/revise between, keyed on BOTH the
--    pseudonymous reviewer_id (exactly auditLogIssues' rule) and the
--    reviewer_user_id (so a relabelled account is still the same reviewer).
-- 4. Subject must be review-gated (REVIEWED_WJEC_SUBJECT_IDS), and "nonblank"
--    uses the JavaScript String.prototype.trim whitespace set, so the database
--    is never more permissive than decisionRecordProblems.
-- 5. grant_reviewer_role() refuses to change an existing grant's pseudonym:
--    independence is counted by it, so a re-grant under a new label would
--    otherwise count the same person as a second reviewer.
-- 6. reviewer_user_id is no longer readable by reviewers: column-level SELECT
--    for authenticated covers every column except it. The portal reads only
--    seq, previous_hash, hash and event (REVIEW_AUDIT_EVENT_COLUMNS).
--
-- Existing append-only triggers, chain serialisation, event/column identity
-- checks, grant binding, decision validation and service-role grants stay.
-- ---------------------------------------------------------------------------

-- --- 1. Canonical JSON and the event hash --------------------------------------
create or replace function public.review_audit_canonical_json(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  out text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      if exists (select 1 from jsonb_object_keys(p_value) as k(key) where k.key !~ '^[A-Za-z0-9_]+$') then
        raise exception 'review audit event keys must be plain ASCII identifiers' using errcode = '22023';
      end if;
      select '{' || coalesce(string_agg(to_jsonb(e.key)::text || ':' || public.review_audit_canonical_json(e.value), ',' order by e.key collate "C"), '') || '}'
        into out from jsonb_each(p_value) as e(key, value);
    when 'array' then
      select '[' || coalesce(string_agg(public.review_audit_canonical_json(e.value), ',' order by e.ord), '') || ']'
        into out from jsonb_array_elements(p_value) with ordinality as e(value, ord);
    when 'string' then
      out := p_value::text;
    when 'boolean' then
      out := p_value::text;
    when 'number' then
      out := p_value::text;
      -- JSON.stringify and numeric output agree on safe integers only.
      if out !~ '^(0|-?[1-9][0-9]{0,14})$' then
        raise exception 'review audit event numbers must be integers' using errcode = '22023';
      end if;
    else
      out := 'null';
  end case;
  return out;
end;
$$;

create or replace function public.review_audit_event_hash(p_event jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select 'sha256:' || encode(sha256(convert_to(public.review_audit_canonical_json(p_event - 'hash'), 'UTF8')), 'hex');
$$;

revoke all on function public.review_audit_canonical_json(jsonb) from public, anon, authenticated;
revoke all on function public.review_audit_event_hash(jsonb) from public, anon, authenticated;

-- --- 2. Anchor: the committed log's tail ----------------------------------------
create table if not exists public.review_audit_anchor (
  id boolean primary key default true check (id),
  tail_seq integer not null check (tail_seq >= 0),
  tail_hash text not null check (tail_hash = 'genesis' or tail_hash ~ '^sha256:[0-9a-f]{64}$'),
  set_at timestamptz not null default now(),
  check ((tail_seq = 0) = (tail_hash = 'genesis'))
);
-- src/content/reviews/wjec-review-audit-log.json has no events when this ships.
insert into public.review_audit_anchor (id, tail_seq, tail_hash) values (true, 0, 'genesis')
  on conflict (id) do nothing;
alter table public.review_audit_anchor enable row level security;
revoke all on public.review_audit_anchor from public, anon, authenticated;

-- Service role only, and only before the first runtime event: once the runtime
-- table has a row, the chain continues from its own tail and the anchor is moot.
create or replace function public.set_review_audit_anchor(p_tail_seq integer, p_tail_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.review_audit_events'));
  if exists (select 1 from public.review_audit_events) then
    raise exception 'the runtime review audit log already has events; its anchor can no longer move' using errcode = '55000';
  end if;
  insert into public.review_audit_anchor (id, tail_seq, tail_hash, set_at) values (true, p_tail_seq, p_tail_hash, now())
    on conflict (id) do update set tail_seq = excluded.tail_seq, tail_hash = excluded.tail_hash, set_at = now();
end;
$$;
revoke all on function public.set_review_audit_anchor(integer, text) from public, anon, authenticated;

-- --- 3. Reviewer pseudonyms are permanent per account ------------------------------
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
declare
  existing_label text;
begin
  select reviewer_label into existing_label from public.reviewer_roles where user_id = p_user_id for update;
  if found and existing_label is distinct from p_reviewer_label then
    raise exception 'reviewer pseudonym cannot change: this account is already reviewer %, and independent approvals are counted by pseudonym', existing_label
      using errcode = '22023';
  end if;
  insert into public.reviewer_roles (user_id, role, reviewer_label, qualification, granted_by, granted_at, revoked_at)
  values (p_user_id, p_role, p_reviewer_label, p_qualification, p_granted_by, now(), null)
  on conflict (user_id) do update
    set role = excluded.role,
        qualification = excluded.qualification,
        granted_by = excluded.granted_by,
        granted_at = now(),
        revoked_at = null;
end;
$$;
revoke all on function public.grant_reviewer_role(uuid, text, text, text, text) from public, anon, authenticated;

-- --- 4. The append guard ------------------------------------------------------------
create or replace function public.review_audit_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tail record;
  anchor record;
  reviewer record;
  field text;
  check_name text;
  reviewed_at timestamptz;
  required_checks constant text[] := array[
    'question', 'marking', 'workedSolution',
    'capabilityMapping', 'specificationMapping', 'examRealism'
  ];
  -- ReviewAuditEvent; classification is optional.
  event_fields constant text[] := array[
    'seq', 'previousHash', 'hash', 'questionId', 'subjectId', 'contentFingerprint',
    'decision', 'reviewerId', 'reviewerRole', 'reviewerQualification',
    'reviewedAt', 'checks', 'comments', 'classification'
  ];
  -- REVIEWED_WJEC_SUBJECT_IDS in src/domain/content-trust.ts.
  reviewed_subjects constant text[] := array[
    'wjec-alevel-physics', 'wjec-alevel-maths', 'wjec-alevel-biology', 'wjec-alevel-chemistry'
  ];
  -- A character String.prototype.trim() keeps: the domain's nonBlank().
  visible constant text := '[^\u0009-\u000d    -     　﻿]';
begin
  if TG_OP <> 'INSERT' then
    raise exception 'review_audit_events is append-only' using errcode = '42501';
  end if;
  -- Direct authenticated inserts bypass portal validation. Validate the
  -- decision here too, without altering the payload that the domain hashed.
  if jsonb_typeof(new.event) is distinct from 'object'
     or jsonb_typeof(new.event->'seq') is distinct from 'number' then
    raise exception 'review decision must be an event object with a numeric seq' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(new.event) as k(key) where k.key <> all (event_fields)) then
    raise exception 'review decision has a field that is not part of a review audit event' using errcode = '22023';
  end if;
  foreach field in array array[
    'previousHash', 'hash', 'questionId', 'subjectId', 'contentFingerprint',
    'decision', 'reviewerId', 'reviewerRole', 'reviewerQualification',
    'reviewedAt', 'comments'
  ] loop
    if jsonb_typeof(new.event->field) is distinct from 'string' then
      raise exception 'review decision % must be a string', field using errcode = '22023';
    end if;
  end loop;
  foreach field in array array[
    'questionId', 'subjectId', 'contentFingerprint', 'reviewerId', 'reviewerQualification'
  ] loop
    if new.event->>field !~ visible then
      raise exception 'review decision % must not be blank', field using errcode = '22023';
    end if;
  end loop;
  if new.event->>'subjectId' <> all (reviewed_subjects) then
    raise exception 'review decision subjectId is not a review-gated subject' using errcode = '22023';
  end if;
  if new.event->>'decision' not in ('approve', 'reject', 'revise')
     or new.event->>'reviewerRole' not in ('teacher', 'examiner', 'subject-expert') then
    raise exception 'review decision or reviewer role is unknown' using errcode = '22023';
  end if;
  if jsonb_typeof(new.event->'checks') is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(new.event->'checks') as k(key) where k.key <> all (required_checks)) then
    raise exception 'review decision needs all six boolean checks' using errcode = '22023';
  end if;
  foreach check_name in array required_checks loop
    if jsonb_typeof(new.event->'checks'->check_name) is distinct from 'boolean' then
      raise exception 'review decision needs all six boolean checks' using errcode = '22023';
    end if;
    if new.event->>'decision' = 'approve' and new.event->'checks'->check_name is distinct from 'true'::jsonb then
      raise exception 'an approval needs all six checks ticked' using errcode = '22023';
    end if;
  end loop;
  if new.event->>'decision' in ('reject', 'revise') and new.event->>'comments' !~ visible then
    raise exception 'a rejection or revision request needs a comment' using errcode = '22023';
  end if;
  if new.event ? 'classification' then
    if jsonb_typeof(new.event->'classification') is distinct from 'object' then
      raise exception 'review classification must be an object of optional booleans' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(new.event->'classification') as c(key, value)
       where c.key not in ('transferConfirmed', 'dataAnalysisConfirmed')
          or jsonb_typeof(c.value) is distinct from 'boolean'
    ) then
      raise exception 'review classification must be an object of optional booleans' using errcode = '22023';
    end if;
  end if;
  -- Accept full ISO instants only: PostgreSQL otherwise accepts relative dates,
  -- date-only values and infinity. Cast rejects impossible calendar dates.
  if new.event->>'reviewedAt' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
    raise exception 'review date is missing, malformed or in the future' using errcode = '22023';
  end if;
  begin
    reviewed_at := (new.event->>'reviewedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'review date is missing, malformed or in the future' using errcode = '22023';
  end;
  -- Match validAttestationInstant's five-minute allowance for clock drift.
  if reviewed_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'review date is missing, malformed or in the future' using errcode = '22023';
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
  -- The hash must be the domain's eventHash of the event itself.
  if public.review_audit_event_hash(new.event) is distinct from new.hash then
    raise exception 'review audit event hash does not match its content' using errcode = '22023';
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
  -- Serialise appends so two reviewers cannot fork the chain.
  perform pg_advisory_xact_lock(hashtext('public.review_audit_events'));
  select seq, hash into tail from public.review_audit_events order by seq desc limit 1;
  if found then
    if new.seq <> tail.seq + 1 or new.previous_hash <> tail.hash then
      raise exception 'review audit chain moved on: expected seq % after %', tail.seq + 1, tail.hash using errcode = '40001';
    end if;
  else
    -- The first runtime event continues the committed log's tail.
    select tail_seq, tail_hash into anchor from public.review_audit_anchor where id;
    if not found then
      raise exception 'review audit anchor is missing; the committed log tail must be recorded first' using errcode = '55000';
    end if;
    if new.seq <> anchor.tail_seq + 1 or new.previous_hash <> anchor.tail_hash then
      raise exception 'the first runtime review event must continue the committed audit log: expected seq % after %', anchor.tail_seq + 1, anchor.tail_hash
        using errcode = '55000';
    end if;
  end if;
  -- auditLogIssues: a reviewer cannot approve the same exact content twice
  -- without a reject/revise between. Keyed on the pseudonym (the domain rule)
  -- and on the account (so a relabelled account is still the same reviewer).
  if new.decision = 'approve' and exists (
    select 1 from public.review_audit_events a
     where a.question_id = new.question_id
       and a.content_fingerprint = new.content_fingerprint
       and a.decision = 'approve'
       and (a.reviewer_id = new.reviewer_id or a.reviewer_user_id = new.reviewer_user_id)
       and not exists (
         select 1 from public.review_audit_events b
          where b.question_id = a.question_id
            and b.content_fingerprint = a.content_fingerprint
            and b.decision <> 'approve'
            and b.seq > a.seq
       )
  ) then
    raise exception 'this reviewer already approved this exact content; a different reviewer must confirm it' using errcode = '23505';
  end if;
  new.recorded_at := now();
  return new;
end;
$$;

-- --- 5. reviewer_user_id stays on the server ------------------------------------------
revoke select on public.review_audit_events from authenticated;
grant select (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, event, recorded_at)
  on public.review_audit_events to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.grant_reviewer_role(uuid, text, text, text, text) to service_role';
    execute 'grant execute on function public.set_review_audit_anchor(integer, text) to service_role';
    execute 'revoke all on public.review_audit_anchor from service_role';
    execute 'grant select on public.review_audit_anchor to service_role';
    execute 'revoke update, delete, truncate on public.review_audit_events from service_role';
  end if;
end;
$$;
