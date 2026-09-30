#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stagingConfiguration, validateStagingCatalog, STAGING_TABLES } from "./staging-contract.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, "artifacts"), { recursive: true });
let stage = "infrastructure";
try {
  stagingConfiguration(process.env);
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: process.env.REVISE_STAGING_DATABASE_URL, connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
  await db.connect();
  try {
    stage = "schema-drift";
    // Read only deployed catalogs; never use this connection to write fixtures
    // or bypass RLS. The live suite uses only the anonymous key + user JWTs.
    const { rows } = await db.query(`
      select c.relname as "table", c.relrowsecurity as rls,
        (select string_agg(a.attname, ',' order by k.n)
          from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,n)
          join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
          where i.indrelid=c.oid and i.indisprimary) as "primaryKey",
        (select jsonb_object_agg(column_name,data_type) from information_schema.columns
          where table_schema='public' and table_name=c.relname) as columns,
        (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check))
          from pg_policies where schemaname='public' and tablename=c.relname) as policies,
        (select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'function',p.proname,'definition',pg_get_triggerdef(t.oid)))
          from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
        (select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and tablename=c.relname) as indexes
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[])`, [STAGING_TABLES]);
    const errors = validateStagingCatalog(rows);
    if (errors.length) throw new Error(errors.join("\n"));
  } finally { await db.end(); }
  writeFileSync(path.join(root, "artifacts/staging-schema.json"), JSON.stringify({ status: "passed", tables: STAGING_TABLES }, null, 2));
} catch (error) {
  // Connection strings, passwords and server error details must never be logged.
  const message = stage === "infrastructure" ? "Missing/misconfigured staging infrastructure. Check all seven secrets, the TLS database connection and runner network access." : error.message;
  writeFileSync(path.join(root, "artifacts/staging-schema.json"), JSON.stringify({ status: "failed", category: stage, message }, null, 2));
  console.error(`[${stage}] ${message}`);
  process.exit(1);
}
const vitest = path.join(root, "node_modules/.bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const result = spawnSync(vitest, ["run", "tests/supabase-staging.test.ts", "--reporter=default", "--reporter=json", "--outputFile=artifacts/staging-tests.json"], {
  cwd: root, env: { ...process.env, REVISE_STAGING_REQUIRED: "1" }, stdio: "inherit",
});
process.exit(result.status ?? 1);
