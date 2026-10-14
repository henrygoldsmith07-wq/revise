-- Live teacher classes. Apply after reviewer_portal. No service credentials in the client.
-- Learner history remains local-first; sharing is a separate, explicit metadata snapshot.
create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  -- Two cryptographic UUIDs: 244 random bits, generated only inside Postgres.
  join_code text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
create index if not exists teacher_classes_owner_idx on public.teacher_classes(user_id);

create table if not exists public.class_memberships (
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null check (alias ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{1,31}$'),
  age_band text not null check (age_band in ('13-17', '18+')),
  status text not null check (status in ('pending', 'active')),
  consented_at timestamptz not null default now(),
  authorized_at timestamptz,
  primary key (class_id, user_id),
  check (age_band = '18+' or status <> 'active' or authorized_at is not null)
);
create index if not exists class_memberships_user_idx on public.class_memberships(user_id);

create table if not exists public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  kind text not null check (kind in ('check', 'topic')),
  question_ids text[] not null default '{}',
  topic_id text,
  due_date date not null,
  created_at timestamptz not null default now(),
  check ((kind = 'check' and cardinality(question_ids) between 1 and 100 and topic_id is null)
      or (kind = 'topic' and cardinality(question_ids) = 0 and topic_id is not null))
);
create index if not exists class_assignments_class_idx on public.class_assignments(class_id);

create table if not exists public.class_evidence (
  class_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  question_id text not null check (question_id ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$'),
  topic_id text not null check (topic_id ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$'),
  awarded numeric not null check (awarded >= 0 and awarded <= max),
  max numeric not null check (max > 0 and max <= 1000),
  misconception text check (misconception in ('units', 'significant-figures', 'rearrangement', 'substitution-slips', 'graph-reading', 'method-skipped', 'misread-command', 'terminology', 'conceptual', 'other')),
  attempted_at timestamptz not null,
  primary key (class_id, user_id, attempt_id),
  foreign key (class_id, user_id) references public.class_memberships(class_id, user_id) on delete cascade
);
create index if not exists class_evidence_user_idx on public.class_evidence(user_id);

-- Persistent authenticated-user bucket. Invalid codes return false, not an exception:
-- raising would roll back the counter and make failed-code guessing unlimited.
create table if not exists public.class_join_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  tries integer not null default 0
);

create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_classes c
    join public.reviewer_roles r on r.user_id = c.user_id
    where c.id = p_class_id and c.user_id = auth.uid() and r.role = 'teacher' and r.revoked_at is null);
$$;
create or replace function public.is_active_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_memberships m
    join public.teacher_classes c on c.id = m.class_id
    join public.reviewer_roles r on r.user_id = c.user_id
    where m.class_id = p_class_id and m.user_id = auth.uid() and m.status = 'active'
      and r.role = 'teacher' and r.revoked_at is null);
$$;

alter table public.teacher_classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.class_assignments enable row level security;
alter table public.class_evidence enable row level security;
alter table public.class_join_limits enable row level security;
revoke all on public.teacher_classes, public.class_memberships, public.class_assignments, public.class_evidence, public.class_join_limits from public, anon, authenticated;
grant select on public.teacher_classes, public.class_memberships, public.class_assignments, public.class_evidence to authenticated;
drop policy if exists class_owner_read on public.teacher_classes;
create policy class_owner_read on public.teacher_classes for select to authenticated using (public.is_class_teacher(id));
drop policy if exists class_members_read on public.class_memberships;
create policy class_members_read on public.class_memberships for select to authenticated using (user_id = auth.uid() or public.is_class_teacher(class_id));
drop policy if exists class_assignments_read on public.class_assignments;
create policy class_assignments_read on public.class_assignments for select to authenticated using (public.is_class_teacher(class_id) or public.is_active_class_member(class_id));
drop policy if exists class_evidence_read on public.class_evidence;
create policy class_evidence_read on public.class_evidence for select to authenticated using (
  exists (select 1 from public.class_memberships m where m.class_id = class_evidence.class_id and m.user_id = class_evidence.user_id and m.status = 'active')
  and (public.is_class_teacher(class_id) or (user_id = auth.uid() and public.is_active_class_member(class_id))));

create or replace function public.create_teacher_class(p_name text)
returns setof public.teacher_classes language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reviewer_roles where user_id = auth.uid() and role = 'teacher' and revoked_at is null) then
    raise exception 'Active teacher grant required' using errcode = '42501';
  end if;
  return query insert into public.teacher_classes(user_id, name) values (auth.uid(), btrim(p_name)) returning *;
end;
$$;

create or replace function public.join_teacher_class(p_code text, p_alias text, p_age_band text, p_consent boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.teacher_classes; n integer;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  insert into public.class_join_limits(user_id, tries) values (auth.uid(), 1)
  on conflict (user_id) do update set
    tries = case when class_join_limits.window_start < now() - interval '15 minutes' then 1 else least(class_join_limits.tries + 1, 1000000) end,
    window_start = case when class_join_limits.window_start < now() - interval '15 minutes' then now() else class_join_limits.window_start end
  returning tries into n;
  if n > 8 or p_consent is distinct from true or p_age_band is null or p_age_band not in ('13-17', '18+')
    or p_alias is null or p_alias !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{1,31}$'
    or p_code is null or p_code !~ '^[a-f0-9]{64}$' then return false; end if;
  select cl.* into c from public.teacher_classes cl join public.reviewer_roles r on r.user_id = cl.user_id
    where cl.join_code = p_code and r.role = 'teacher' and r.revoked_at is null;
  if not found or c.user_id = auth.uid() then return false; end if;
  -- Replaying a join cannot reset consent or change a pending minor into an adult.
  insert into public.class_memberships(class_id, user_id, alias, age_band, status)
    values (c.id, auth.uid(), p_alias, p_age_band, case when p_age_band = '18+' then 'active' else 'pending' end)
    on conflict (class_id, user_id) do nothing;
  return true;
end;
$$;

-- Only the caller's membership receives a class name, never its code or peers.
create or replace function public.list_my_class_memberships()
returns table(class_id uuid, user_id uuid, alias text, age_band text, status text, consented_at timestamptz, authorized_at timestamptz, class_name text)
language sql stable security definer set search_path = '' as $$
  select m.class_id, m.user_id, m.alias, m.age_band, m.status, m.consented_at, m.authorized_at, c.name
    from public.class_memberships m join public.teacher_classes c on c.id = m.class_id
    where m.user_id = auth.uid();
$$;

-- Leaving is consent revocation: evidence is synchronously deleted by the FK cascade.
create or replace function public.leave_teacher_class(p_class_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.class_memberships where class_id = p_class_id and user_id = auth.uid();
$$;

create or replace function public.authorize_class_member(p_class_id uuid, p_student_id uuid, p_authorized boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception 'Class owner required' using errcode = '42501'; end if;
  -- Serialize with uploads/leave; withdrawing authorization removes shared snapshots.
  perform 1 from public.class_memberships where class_id = p_class_id and user_id = p_student_id for update;
  if p_authorized is distinct from true then
    delete from public.class_evidence where class_id = p_class_id and user_id = p_student_id;
  end if;
  update public.class_memberships set status = case when p_authorized is true then 'active' else 'pending' end,
    authorized_at = case when p_authorized is true then now() else null end
    where class_id = p_class_id and user_id = p_student_id;
end;
$$;

create or replace function public.set_class_assignment(p_class_id uuid, p_title text, p_kind text, p_question_ids text[], p_topic_id text, p_due_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception 'Class owner required' using errcode = '42501'; end if;
  if exists (select 1 from unnest(p_question_ids) q where q is null or q !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$')
    or (p_topic_id is not null and p_topic_id !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$') then
    raise exception 'Content identifiers required' using errcode = '22023';
  end if;
  insert into public.class_assignments(class_id, user_id, title, kind, question_ids, topic_id, due_date)
    values (p_class_id, auth.uid(), btrim(p_title), p_kind, p_question_ids, p_topic_id, p_due_date);
end;
$$;

create or replace function public.share_class_evidence(p_class_id uuid, p_evidence jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.class_memberships; e jsonb; attempted timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  -- Lock membership so consent revocation and uploads cannot race past one another.
  select * into m from public.class_memberships where class_id = p_class_id and user_id = auth.uid() for update;
  if not found or m.status <> 'active' or not public.is_active_class_member(p_class_id) then
    raise exception 'Active consenting membership required' using errcode = '42501';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 100 then
    raise exception 'At most 100 metadata snapshots per request' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p_evidence) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'Metadata object required'; end if;
    if exists (select 1 from jsonb_object_keys(e) k where k not in ('attemptId','studentId','questionId','topicId','awarded','max','misconception','attemptedAt'))
      or e->>'studentId' is distinct from auth.uid()::text then
      raise exception 'Only caller-owned metadata is accepted' using errcode = '22023';
    end if;
    attempted := (e->>'attemptedAt')::timestamptz;
    if attempted is null or attempted < greatest(m.consented_at, m.authorized_at) or attempted > now() then
      raise exception 'Attempt must be after consent and authorization, and not in the future' using errcode = '22023';
    end if;
    if not exists (select 1 from public.class_assignments a where a.class_id = p_class_id
      and ((a.kind = 'check' and e->>'questionId' = any(a.question_ids))
        or (a.kind = 'topic' and a.topic_id = e->>'topicId'))) then
      raise exception 'Attempt must match a published class assignment' using errcode = '22023';
    end if;
    insert into public.class_evidence(class_id, user_id, attempt_id, question_id, topic_id, awarded, max, misconception, attempted_at)
      values (p_class_id, auth.uid(), (e->>'attemptId')::uuid, e->>'questionId', e->>'topicId',
        (e->>'awarded')::numeric, (e->>'max')::numeric, e->>'misconception', attempted)
      on conflict (class_id, user_id, attempt_id) do nothing;
  end loop;
end;
$$;

revoke all on function public.is_class_teacher(uuid), public.is_active_class_member(uuid),
  public.create_teacher_class(text), public.join_teacher_class(text,text,text,boolean), public.list_my_class_memberships(),
  public.leave_teacher_class(uuid), public.authorize_class_member(uuid,uuid,boolean),
  public.set_class_assignment(uuid,text,text,text[],text,date), public.share_class_evidence(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.is_class_teacher(uuid), public.is_active_class_member(uuid),
  public.create_teacher_class(text), public.join_teacher_class(text,text,text,boolean), public.list_my_class_memberships(),
  public.leave_teacher_class(uuid), public.authorize_class_member(uuid,uuid,boolean),
  public.set_class_assignment(uuid,text,text,text[],text,date), public.share_class_evidence(uuid,jsonb) to authenticated;

-- Every table above includes user_id -> auth.users ON DELETE CASCADE. The existing
-- service-only account_residual_rows() discovers all of them without a new bypass.
-- Deleting a teacher also cascades their classes, memberships, assignments, evidence.
