#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stagingConfiguration, stagingFailureMessage, STAGING_CATALOG_SQL, validateStagingCatalog, validateStagingFunctions, STAGING_TABLES, PRIVACY_TABLES, PRIVACY_FUNCTIONS, validatePrivacyCatalog, validatePrivacyFunctions } from "./staging-contract.mjs";

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
    const { rows } = await db.query(STAGING_CATALOG_SQL, [STAGING_TABLES]);
    const errors = validateStagingCatalog(rows);
    const functions = await db.query("select proname as name, prosecdef as \"securityDefiner\", pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1::text[])", [["order_continuity_change","guard_replica_resurrection","record_replica_deletion","delete_replica_row"]]);
    errors.push(...validateStagingFunctions(functions.rows));
    // Consent and quota structures: RLS, owner policy / no client policy, owner key.
    const privacy = await db.query(STAGING_CATALOG_SQL, [PRIVACY_TABLES]);
    errors.push(...validatePrivacyCatalog(privacy.rows));
    const privacyFunctions = await db.query("select proname as name, prosecdef as \"securityDefiner\" from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1::text[])", [PRIVACY_FUNCTIONS]);
    errors.push(...validatePrivacyFunctions(privacyFunctions.rows));
    if (errors.length) throw new Error(errors.join("\n"));
  } finally { await db.end(); }
  writeFileSync(path.join(root, "artifacts/staging-schema.json"), JSON.stringify({ status: "passed", tables: [...STAGING_TABLES, ...PRIVACY_TABLES] }, null, 2));
} catch (error) {
  // Connection strings, passwords and server error details must never be logged.
  const message = stagingFailureMessage(stage, error);
  writeFileSync(path.join(root, "artifacts/staging-schema.json"), JSON.stringify({ status: "failed", category: stage, message }, null, 2));
  console.error(`[${stage}] ${message}`);
  // Surface the reason on the run page, not only in the raw log.
  console.log(`::error title=Staging ${stage}::${message.replace(/[\r\n]+/g, " | ")}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Staging sync and RLS: ${stage} failure\n\n${message.split("\n").map((line) => `- ${line}`).join("\n")}\n\nThis job verifies deployed RLS with two real staging users; it cannot pass without a dedicated staging project.\n`);
  }
  process.exit(1);
}
const vitest = path.join(root, "node_modules/.bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const result = spawnSync(vitest, ["run", "tests/supabase-staging.test.ts", "--reporter=default", "--reporter=json", "--outputFile=artifacts/staging-tests.json"], {
  cwd: root, env: { ...process.env, REVISE_STAGING_REQUIRED: "1" }, stdio: "inherit",
});
process.exit(result.status ?? 1);
