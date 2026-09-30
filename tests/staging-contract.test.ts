import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// The CI runner is native ESM; test its actual preflight and catalog checker.
// @ts-expect-error Native tooling module has no TypeScript declaration.
import { CONTINUITY_COLUMNS, DELETION_TABLES, validateStagingFunctions, REQUIRED_STAGING_SECRETS, STAGING_TABLES, SINGLETON_TABLES, stagingConfiguration, validateStagingCatalog } from "../scripts/staging-contract.mjs";

function catalog() {
  return (STAGING_TABLES as string[]).map((table) => ({
    table, rls: true, primaryKey: (SINGLETON_TABLES as string[]).includes(table) ? "user_id" : "id",
    canDelete: !["learner_records","sync_tombstones"].includes(table), canUpdate: table !== "sync_tombstones",
    columns: CONTINUITY_COLUMNS[table] ?? (table === "sync_writes" ? { id: "uuid", user_id: "uuid", created_at: "timestamp with time zone" }
      : { id: "uuid", user_id: "uuid", subject_id: "text", topic_id: "text", due: "date", date: "date", data: "jsonb", updated_at: "timestamp with time zone" }),
    policies: table === "sync_tombstones" ? [{name:"sync_tombstones_read",command:"SELECT",roles:["authenticated"],using:"(user_id = auth.uid())",check:""},{name:"sync_tombstones_insert",command:"INSERT",roles:["authenticated"],using:"",check:"(user_id = auth.uid())"}] : [{ name: `${table}_owner`, command: "ALL", roles: ["authenticated"], using: "(user_id = auth.uid())", check: "(user_id = auth.uid())" }],
    triggers: (CONTINUITY_COLUMNS[table] ? [{name:`${table}_order`, enabled:"O", function:"order_continuity_change",definition:"BEFORE INSERT OR UPDATE"}] : ["touch", "touch_insert"].map((suffix) => ({ name: `${table}_${suffix}`, enabled: "O", function: "touch_updated_at", definition: suffix === "touch" ? "BEFORE UPDATE" : "BEFORE INSERT" }))).concat((DELETION_TABLES as string[]).includes(table) ? [{name:`${table}_delete_guard`,enabled:"O",function:"guard_replica_resurrection",definition:"BEFORE INSERT OR UPDATE"},{name:`${table}_retain_delete`,enabled:"O",function:"record_replica_deletion",definition:"BEFORE DELETE"}] : []),
    indexes: [`CREATE INDEX ON ${table} ${CONTINUITY_COLUMNS[table] ? "(user_id, change_seq)" : "(user_id, updated_at, id)"}`],
  }));
}

describe("required staging infrastructure and schema diagnostics", () => {
  it("requires all seven secrets and independent users", () => {
    expect(() => stagingConfiguration({})).toThrow("[infrastructure] Missing GitHub secrets");
    const env = Object.fromEntries((REQUIRED_STAGING_SECRETS as string[]).map((key) => [key, "fixture"]));
    env.REVISE_STAGING_SUPABASE_URL = "https://staging.example.com";
    env.REVISE_STAGING_DATABASE_URL = "postgresql://staging.example.com/db";
    env.REVISE_STAGING_USER_A_EMAIL = "A@example.com";
    env.REVISE_STAGING_USER_B_EMAIL = "a@example.com";
    expect(() => stagingConfiguration(env)).toThrow("Two independent");
    env.REVISE_STAGING_USER_B_EMAIL = "b@example.com";
    expect(() => stagingConfiguration(env)).not.toThrow();
  });

  it("detects missing tables, column drift, RLS drift and inactive triggers", () => {
    const rows = catalog();
    expect(validateStagingCatalog(rows)).toEqual([]);
    expect(validateStagingCatalog(rows.slice(1))).toContain("cards: missing table");
    rows[0].rls = false;
    rows[0].columns.data = "text";
    rows[0].policies[0].check = "true";
    rows[0].triggers[0].enabled = "D";
    rows[0].indexes = [];
    expect(validateStagingCatalog(rows)).toEqual(expect.arrayContaining([
      "cards: RLS disabled", "cards: data must be jsonb", "cards: required owner policy missing or drifted",
      "cards: touch trigger missing or inactive", "cards: keyset index missing",
    ]));
    rows[1].policies.push({ ...rows[1].policies[0], name: "allow_all", using: "true" });
    expect(validateStagingCatalog(rows)).toContain("review_logs: unexpected policy (may widen access)");
  });

  it("keeps the staging workflow fail-closed and uploads diagnostics", () => {
    const workflow = readFileSync(".github/workflows/revise-staging.yml", "utf8");
    for (const key of REQUIRED_STAGING_SECRETS as string[]) expect(workflow).toContain(`secrets.${key}`);
    expect(workflow).toContain("npm run test:staging");
    expect(workflow).toContain("workflow_call:");
    expect(validateStagingFunctions([])).toHaveLength(4);
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("continue-on-error");
    const runner = readFileSync("scripts/run-staging-tests.mjs", "utf8");
    expect(runner).toContain('REVISE_STAGING_REQUIRED: "1"');
    expect(runner).toContain("validateStagingCatalog(rows)");
  });
});
