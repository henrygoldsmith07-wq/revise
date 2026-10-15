-- ---------------------------------------------------------------------------
-- Reviewer decision validation (additive, idempotent, safe to re-run).
-- Apply after 20261007000200_reviewer_portal.sql; appended to schema.sql too.
-- No new table, store or schema version. Existing append-only triggers, chain
-- serialisation, event/column identity checks and service-role grants stay intact.
-- Content-aware checks and cryptographic hashing remain in the domain layer.
-- ---------------------------------------------------------------------------

create or replace function public.review_audit_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tail record;
  reviewer record;
  field text;
  check_name text;
  reviewed_at timestamptz;
  required_checks constant text[] := array[
    'question', 'marking', 'workedSolution',
    'capabilityMapping', 'specificationMapping', 'examRealism'
  ];
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
    if new.event->>field !~ '[^[:space:]]' then
      raise exception 'review decision % must not be blank', field using errcode = '22023';
    end if;
  end loop;
  if new.event->>'decision' not in ('approve', 'reject', 'revise')
     or new.event->>'reviewerRole' not in ('teacher', 'examiner', 'subject-expert') then
    raise exception 'review decision or reviewer role is unknown' using errcode = '22023';
  end if;
  if jsonb_typeof(new.event->'checks') is distinct from 'object' then
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
  if new.event->>'decision' in ('reject', 'revise') and new.event->>'comments' !~ '[^[:space:]]' then
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
