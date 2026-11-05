-- ---------------------------------------------------------------------------
-- Plus: which subscription the one-row-per-account table follows
-- (additive, idempotent, safe to re-run).
--
-- Apply after 20261030000100_plus_subscriptions.sql.
--
-- The table keeps one row per account, but an account can hold more than one
-- Stripe subscription over time: an abandoned `incomplete` checkout followed
-- by a paid one, or an `unpaid`/`paused` subscription followed by a fresh
-- checkout (checkout only refuses while Plus is granted). Until this
-- migration any newer event replaced the row, whichever subscription it was
-- for, so the old subscription expiring or being cancelled a day later
-- overwrote the live one: the learner lost Plus while still paying for it.
--
-- Now:
--   * the same subscription: the newer event wins, as before;
--   * a different subscription: one that grants Plus replaces one that does
--     not, whatever the event times (Stripe does not order deliveries), and
--     one that does not grant never replaces one that does;
--   * otherwise (both grant, or neither): the newer event wins.
-- "Grants" is has_plus()'s rule: a granting status and an unexpired period.
-- ---------------------------------------------------------------------------

create or replace function public.plus_row_grants(p_status text, p_current_period_end timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status in ('active', 'trialing', 'past_due')
    and (p_current_period_end is null or p_current_period_end > now());
$$;
revoke all on function public.plus_row_grants(text, timestamptz) from public, anon, authenticated;

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
  where case
    when s.stripe_subscription_id = excluded.stripe_subscription_id
      then s.event_created_at <= excluded.event_created_at
    when public.plus_row_grants(excluded.status, excluded.current_period_end)
      <> public.plus_row_grants(s.status, s.current_period_end)
      then public.plus_row_grants(excluded.status, excluded.current_period_end)
    else s.event_created_at <= excluded.event_created_at
  end
  returning true into applied;
  return coalesce(applied, false);
end;
$$;
revoke all on function public.apply_plus_subscription_event(uuid, text, text, text, text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_plus_subscription_event(uuid, text, text, text, text, timestamptz, boolean, timestamptz) to service_role';
  end if;
end;
$$;
