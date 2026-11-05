import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Executes the real schema and the Plus migration in PGlite, the way
// tests/privacy-sql.test.ts does, and checks the subscription rules against
// actual PostgreSQL: a learner reads only their own row and can write none,
// has_plus() matches src/domain/plus.ts, and the webhook's write ignores an
// event older than the one already stored.

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const C = "dddddddd-4444-4444-8444-444444444444";
let db: PGlite;

async function as(id: string | null) {
  await db.exec("reset role;");
  if (id) await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
}

async function apply(
  user: string,
  status: string,
  eventAt: string,
  periodEnd: string | null = "2999-01-01T00:00:00Z",
  subscription = "sub_1",
): Promise<boolean> {
  await as(null);
  const result = await db.query<{ applied: boolean }>(
    "select public.apply_plus_subscription_event($1, 'cus_1', $5, $2, 'price_m', $3, false, $4) as applied",
    [user, status, periodEnd, eventAt, subscription],
  );
  return result.rows[0]!.applied;
}

async function storedSubscription(user: string): Promise<string | null> {
  await as(null);
  const result = await db.query<{ id: string }>("select stripe_subscription_id as id from public.subscriptions where user_id = $1", [user]);
  return result.rows[0]?.id ?? null;
}

async function hasPlus(user: string): Promise<boolean> {
  await as(user);
  const result = await db.query<{ plus: boolean }>("select public.has_plus() as plus");
  return result.rows[0]!.plus;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${A}'),('${B}');`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema); // additive migration remains rerunnable
  await db.exec(readFileSync("supabase/migrations/20261030000100_plus_subscriptions.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261105000100_plus_subscription_precedence.sql", "utf8"));
  await db.exec(`insert into auth.users values ('${C}')`);
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("Plus subscriptions SQL", () => {
  it("grants Plus only for a granting status and an unexpired period", async () => {
    expect(await hasPlus(A)).toBe(false);
    expect(await apply(A, "active", "2026-10-01T00:00:00Z")).toBe(true);
    expect(await hasPlus(A)).toBe(true);
    expect(await hasPlus(B)).toBe(false);
    expect(await apply(A, "past_due", "2026-10-02T00:00:00Z")).toBe(true);
    expect(await hasPlus(A)).toBe(true);
    expect(await apply(A, "active", "2026-10-03T00:00:00Z", "2020-01-01T00:00:00Z")).toBe(true);
    expect(await hasPlus(A)).toBe(false);
    expect(await apply(A, "canceled", "2026-10-04T00:00:00Z")).toBe(true);
    expect(await hasPlus(A)).toBe(false);
  });

  it("ignores an event older than the stored one, so a late event cannot undo a cancellation", async () => {
    expect(await apply(B, "canceled", "2026-10-10T00:00:00Z")).toBe(true);
    expect(await apply(B, "active", "2026-10-09T00:00:00Z")).toBe(false);
    expect(await hasPlus(B)).toBe(false);
    expect(await apply(B, "active", "2026-10-11T00:00:00Z")).toBe(true);
    expect(await hasPlus(B)).toBe(true);
  });

  it("keeps following a live subscription when an older one of the same account ends later", async () => {
    // An abandoned checkout leaves sub_old incomplete; a second checkout pays.
    expect(await apply(C, "incomplete", "2026-11-01T00:00:00Z", null, "sub_old")).toBe(true);
    expect(await apply(C, "active", "2026-11-01T00:05:00Z", undefined, "sub_new")).toBe(true);
    // A day later Stripe expires the abandoned one: newer, but it must not
    // take Plus from the learner still paying for sub_new.
    expect(await apply(C, "incomplete_expired", "2026-11-02T00:00:00Z", null, "sub_old")).toBe(false);
    expect(await storedSubscription(C)).toBe("sub_new");
    expect(await hasPlus(C)).toBe(true);
    // The live one's own later events still apply, cancellation included.
    expect(await apply(C, "canceled", "2026-11-03T00:00:00Z", undefined, "sub_new")).toBe(true);
    expect(await hasPlus(C)).toBe(false);
  });

  it("lets a live subscription replace an ended one whatever order Stripe delivers them in", async () => {
    await as(null);
    await db.exec(`delete from public.subscriptions where user_id = '${C}'`);
    // The expiry of sub_old is delivered first, the older activation of sub_new second.
    expect(await apply(C, "incomplete_expired", "2026-11-02T00:00:00Z", null, "sub_old")).toBe(true);
    expect(await apply(C, "active", "2026-11-01T00:05:00Z", undefined, "sub_new")).toBe(true);
    expect(await hasPlus(C)).toBe(true);
    // Between two subscriptions that both grant, the newer event still wins.
    expect(await apply(C, "active", "2026-11-04T00:00:00Z", undefined, "sub_third")).toBe(true);
    expect(await storedSubscription(C)).toBe("sub_third");
    expect(await apply(C, "active", "2026-11-03T00:00:00Z", undefined, "sub_new")).toBe(false);
  });

  it("refuses an event for an account that does not exist", async () => {
    expect(await apply("cccccccc-3333-4333-8333-333333333333", "active", "2026-10-01T00:00:00Z")).toBe(false);
  });

  it("lets a learner read only their own row", async () => {
    await as(A);
    const own = await db.query<{ user_id: string }>("select user_id from public.subscriptions");
    expect(own.rows.map((row) => row.user_id)).toEqual([A]);
  });

  it("lets no learner write a subscription, directly or through the webhook function", async () => {
    await as(A);
    await expect(db.exec(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, event_created_at) values ('${A}', 'c', 's', 'active', now())`)).rejects.toThrow();
    await expect(db.exec(`update public.subscriptions set status = 'active' where user_id = '${A}'`)).rejects.toThrow();
    await expect(db.query(`select public.apply_plus_subscription_event('${A}', 'c', 's', 'active', null, null, false, now())`)).rejects.toThrow();
  });

  it("removes the row with the account", async () => {
    await as(null);
    await db.exec(`delete from auth.users where id = '${B}'`);
    const left = await db.query("select 1 from public.subscriptions where user_id = $1", [B]);
    expect(left.rows).toEqual([]);
  });
});
