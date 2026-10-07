import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error Native ESM tooling is shared with the credentialed runner.
import { PRIVACY_FUNCTIONS, PRIVACY_TABLES, STAGING_CATALOG_SQL, validatePrivacyCatalog, validatePrivacyFunctions } from "../scripts/staging-contract.mjs";

// Executes the real schema (including the privacy migration) in PGlite, the
// same way tests/continuity-sql.test.ts does, and checks the consent, quota,
// account-deletion and retention SQL against actual PostgreSQL behaviour.

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
let db: PGlite;

async function as(id: string | null) {
  await db.exec("reset role;");
  if (id) await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
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
  const migration = readFileSync("supabase/migrations/20261007000100_privacy_ai_trust.sql", "utf8");
  await db.exec(migration); // and the standalone migration is idempotent on top
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("privacy SQL contract", () => {
  it("passes the release preflight for consent and quota structures", async () => {
    await as(null);
    const rows = await db.query(STAGING_CATALOG_SQL, [PRIVACY_TABLES]);
    expect(validatePrivacyCatalog(rows.rows)).toEqual([]);
    const functions = await db.query(
      "select proname as name, prosecdef as \"securityDefiner\" from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1::text[])",
      [PRIVACY_FUNCTIONS],
    );
    expect(validatePrivacyFunctions(functions.rows)).toEqual([]);
  });

  it("scopes AI consent rows to their owner", async () => {
    await as(A);
    await db.query("insert into ai_consent(user_id, enabled, consent_version) values ($1, true, 'v')", [A]);
    await as(B);
    expect((await db.query("select * from ai_consent")).rows).toHaveLength(0);
    await expect(db.query("insert into ai_consent(user_id, enabled, consent_version) values ($1, false, 'v')", [A])).rejects.toThrow(/row-level security|duplicate/);
    await expect(db.query("update ai_consent set enabled = false where user_id = $1", [A])).resolves.toBeDefined();
    await as(A);
    expect((await db.query<{ enabled: boolean }>("select enabled from ai_consent where user_id = $1", [A])).rows[0]!.enabled).toBe(true);
  });

  it("always applies a revocation, and never lets a stale opt-in undo it", async () => {
    await as(A);
    await db.query("update ai_consent set enabled = true, updated_at = '2099-01-01' where user_id = $1", [A]);
    // A device with a clock in the past revokes: it must still win.
    await db.query("update ai_consent set enabled = false, updated_at = '2000-01-01' where user_id = $1", [A]);
    expect((await db.query<{ enabled: boolean }>("select enabled from ai_consent where user_id = $1", [A])).rows[0]!.enabled).toBe(false);
    // A stale opt-in replayed afterwards is ignored.
    await db.query("update ai_consent set enabled = true, updated_at = '2001-01-01' where user_id = $1", [A]);
    expect((await db.query<{ enabled: boolean }>("select enabled from ai_consent where user_id = $1", [A])).rows[0]!.enabled).toBe(false);
  });

  it("gives every quota row an owning account and cascades it away with the account", async () => {
    const C = "cccccccc-3333-4333-8333-333333333333";
    await as(null);
    await db.query("insert into auth.users(id) values ($1)", [C]);
    await as(C);
    await db.query("select * from consume_ai_quota($1, 1, 10, 5, 100)", [`user:${C}`]);
    await db.query("insert into ai_consent(user_id, enabled, consent_version) values ($1, true, 'v')", [C]);
    await as(null);
    expect((await db.query<{ user_id: string }>("select user_id from ai_rate_quota where key = $1", [`user:${C}`])).rows[0]!.user_id).toBe(C);
    // Clients have no direct access to quota rows.
    await as(C);
    await expect(db.query("select * from ai_rate_quota")).rejects.toThrow(/permission denied/);
    await as(null);
    await db.query("delete from auth.users where id = $1", [C]);
    expect((await db.query("select * from ai_rate_quota where key = $1", [`user:${C}`])).rows).toHaveLength(0);
    expect((await db.query("select * from ai_consent where user_id = $1", [C])).rows).toHaveLength(0);
    expect((await db.query("select * from account_residual_rows($1)", [C])).rows).toEqual([]);
  });

  it("purges non-cascading rows before account deletion and reports residue honestly", async () => {
    await as(null);
    const before = (await db.query<{ scope: string }>("select * from account_residual_rows($1)", [A])).rows.map((r) => r.scope);
    expect(before).toEqual(expect.arrayContaining(["ai_consent", "auth.users"]));
    const purged = (await db.query<{ scope: string; removed: number }>("select * from purge_account_server_data($1)", [A])).rows;
    expect(purged.map((r) => r.scope).sort()).toEqual(["ai_consent", "ai_rate_quota"]);
    await db.query("delete from auth.users where id = $1", [A]);
    expect((await db.query("select * from account_residual_rows($1)", [A])).rows).toEqual([]);
  });

  it("purges only quota rows idle beyond the retention window", async () => {
    await as(null);
    await db.query("insert into ai_rate_quota(key, tokens, updated_at) values ($1, 1, now() - interval '3 days')", [`user:${B}`]);
    const D = "dddddddd-4444-4444-8444-444444444444";
    await db.query("insert into auth.users(id) values ($1)", [D]);
    await db.query("insert into ai_rate_quota(key, tokens, updated_at) values ($1, 1, now())", [`user:${D}`]);
    const result = (await db.query<{ scope: string; removed: number }>("select * from purge_expired_server_data()")).rows;
    expect(result[0]!.scope).toBe("ai_rate_quota");
    expect((await db.query("select * from ai_rate_quota where key = $1", [`user:${B}`])).rows).toHaveLength(0);
    expect((await db.query("select * from ai_rate_quota where key = $1", [`user:${D}`])).rows).toHaveLength(1);
  });

  it("refuses quota rows without an owning account", async () => {
    await as(null);
    await expect(db.query("insert into ai_rate_quota(key, tokens) values ('ip:203.0.113.9', 1)")).rejects.toThrow(/null value|not-null/);
    await expect(
      db.query("insert into ai_rate_quota(key, tokens) values ('user:eeeeeeee-5555-4555-8555-555555555555', 1)"),
    ).rejects.toThrow(/foreign key/);
  });

  it("does not let signed-in clients run the privileged functions", async () => {
    await as(B);
    await expect(db.query("select * from purge_expired_server_data()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from purge_account_server_data($1)", [B])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from account_residual_rows($1)", [B])).rejects.toThrow(/permission denied/);
    await as(null);
  });
});
