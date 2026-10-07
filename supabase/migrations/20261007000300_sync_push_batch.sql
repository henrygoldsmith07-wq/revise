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
