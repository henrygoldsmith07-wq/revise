-- ---------------------------------------------------------------------------
-- Revise Plus subscriptions (additive, idempotent, safe to re-run).
--
-- Apply after 20261018000100_reviewer_audit_integrity.sql.
--
-- One row per account, written only by the Stripe webhook through the
-- service-role function below; a learner can read their own row and nothing
-- else, and cannot write it at all. user_id cascades from auth.users, and
-- account_residual_rows() discovers the table by its user_id column, so
-- account deletion verification covers it automatically. The deletion route
-- cancels the Stripe subscription first, so nobody is charged for an account
-- that no longer exists.
--
-- Stripe can deliver events out of order and more than once. Each write
-- carries the event's own creation time and only replaces a row written from
-- an older event, so a late "created" can never undo a "deleted".
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  event_created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke select on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Whether the calling account has Plus. Mirrors hasPlus() in src/domain/plus.ts:
-- a granting status (past_due keeps access while Stripe retries the card) and a
-- period that has not ended.
create or replace function public.has_plus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and status in ('active', 'trialing', 'past_due')
      and (current_period_end is null or current_period_end > now())
  );
$$;
revoke all on function public.has_plus() from public, anon;
grant execute on function public.has_plus() to authenticated;

-- The webhook's only write. Returns true when the event was applied, false
-- when a newer event had already been stored.
create or replace function public.apply_plus_subscription_event(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  applied boolean;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;
  insert into public.subscriptions as s (
    user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
    current_period_end, cancel_at_period_end, event_created_at, updated_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_status, p_price_id,
    p_current_period_end, coalesce(p_cancel_at_period_end, false), p_event_created_at, now()
  )
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    price_id = excluded.price_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    event_created_at = excluded.event_created_at,
    updated_at = now()
  where s.event_created_at <= excluded.event_created_at
  returning true into applied;
  return coalesce(applied, false);
end;
$$;
revoke all on function public.apply_plus_subscription_event(uuid, text, text, text, text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_plus_subscription_event(uuid, text, text, text, text, timestamptz, boolean, timestamptz) to service_role';
    execute 'grant select on public.subscriptions to service_role';
  end if;
end;
$$;
