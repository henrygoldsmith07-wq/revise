import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "@/domain/content-trust";
import { emptyAuditLog, type ReviewAuditLog } from "@/domain/review-workflow";
import { combineAuditLog, prepareDecision, reviewDecisionRequestSchema, type ReviewerGrant, type RuntimeEventInsert, type RuntimeEventRow } from "@/lib/reviewer/runtime-ledger";
import { approvalThroughputReport, loadRuntimeRowsFromPostgres, type PostgresQuery } from "@/lib/reviewer/review-throughput";
import { NOW, PROMPTS, SUBJECT, wq } from "./helpers-review";

// Approval throughput must see reviewer-portal approvals in
// public.review_audit_events without a `wjec:review:pull` first. Measurement
// only: one approval still leaves a question "checked", two independent
// approvals verify it, exactly as the review rules say.

const q1 = wq("q1", "algebra", PROMPTS[0]!);
const bank = [q1];
const at = NOW.getTime();
const committedLog: ReviewAuditLog = emptyAuditLog();
const committedLedger = { formatVersion: 1, entries: [] };
const allChecks = Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c) => [c, true])) as Record<(typeof REQUIRED_HUMAN_CHECKS)[number], boolean>;
const TEACHER_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
const TEACHER_TWO = "cccccccc-3333-4333-8333-333333333333";
const grant = (userId: string, label: string): ReviewerGrant => ({ userId, reviewerLabel: label, role: "teacher", qualification: "PGCE Mathematics" });

/** An approval exactly as the portal route builds it, continuing whatever is already stored. */
function nextApproval(stored: readonly RuntimeEventRow[], reviewer: ReviewerGrant): RuntimeEventInsert {
  const request = reviewDecisionRequestSchema.parse({ questionId: q1.id, contentFingerprint: physicsContentFingerprint(q1), decision: "approve", checks: allChecks, comments: "" });
  const prepared = prepareDecision(combineAuditLog(committedLog, stored), request, bank, reviewer, at);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.problems));
  return prepared.row;
}

async function insertRow(query: PostgresQuery, relation: string, row: RuntimeEventInsert) {
  await query(
    `insert into ${relation} (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [row.seq, row.previous_hash, row.hash, row.question_id, row.subject_id, row.content_fingerprint, row.decision, row.reviewer_id, row.reviewer_user_id, JSON.stringify(row.event)],
  );
}

const reportFor = (rows: readonly RuntimeEventRow[] | null) => approvalThroughputReport({
  questions: bank, subjectIds: [SUBJECT], nowMs: at, committedAuditLog: committedLog, committedLedger, rows,
});

/** The scenario both Postgres suites run: no event, one approval, two independent approvals. */
async function liftScenario(query: PostgresQuery, relation: string) {
  const offline = reportFor(null);
  expect(offline.source).toEqual({ kind: "committed", reason: "runtime-not-configured" });
  const baseline = offline.bySubject[SUBJECT]!;

  // No runtime event: throughput stays at the committed figure.
  const empty = reportFor(await loadRuntimeRowsFromPostgres(query, relation));
  expect(empty.source).toEqual({ kind: "runtime", runtimeEvents: 0 });
  expect(empty.bySubject[SUBJECT]).toEqual(baseline);
  expect(baseline).toEqual({ approved7d: 0, approved30d: 0 });

  // One approval: the question is only "checked"; the rule is unchanged.
  await insertRow(query, relation, nextApproval(await loadRuntimeRowsFromPostgres(query, relation), grant(TEACHER_ONE, "teacher-one")));
  const one = reportFor(await loadRuntimeRowsFromPostgres(query, relation));
  expect(one.source).toEqual({ kind: "runtime", runtimeEvents: 1 });
  expect(one.bySubject[SUBJECT]).toEqual(baseline);

  // A second, independent approval verifies it, and throughput lifts without any pull.
  await insertRow(query, relation, nextApproval(await loadRuntimeRowsFromPostgres(query, relation), grant(TEACHER_TWO, "teacher-two")));
  const rows = await loadRuntimeRowsFromPostgres(query, relation);
  const two = reportFor(rows);
  expect(two.source).toEqual({ kind: "runtime", runtimeEvents: 2 });
  expect(two.bySubject[SUBJECT]).toEqual({ approved7d: baseline.approved7d + 1, approved30d: baseline.approved30d + 1 });
  // The committed ledger alone still cannot see it: that was the blind spot.
  expect(reportFor(null).bySubject[SUBJECT]).toEqual(baseline);
  return rows;
}

describe("approval throughput source", () => {
  it("fails closed to the committed ledger when the runtime chain does not verify", () => {
    const first = nextApproval([], grant(TEACHER_ONE, "teacher-one"));
    const tampered: RuntimeEventRow = { seq: first.seq, previous_hash: first.previous_hash, hash: first.hash, event: { ...(first.event as object), decision: "reject" } };
    const report = reportFor([tampered]);
    expect(report.source.kind).toBe("committed");
    expect(report.source.kind === "committed" && report.source.reason).toBe("runtime-chain-failed");
    expect(report.bySubject[SUBJECT]).toEqual(reportFor(null).bySubject[SUBJECT]);
  });

  it("refuses a relation name that is not a plain identifier", async () => {
    await expect(loadRuntimeRowsFromPostgres(async () => ({ rows: [] }), "review_audit_events; drop table x")).rejects.toThrow(/invalid relation/);
  });
});

// Real PostgreSQL semantics (PGlite) with the real schema, reviewer migration
// and append trigger, so the inserted events pass the same guard as the portal's.
describe("approval throughput from review_audit_events (PGlite, real schema)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema auth; create role authenticated; create role anon;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth, public to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${TEACHER_ONE}'),('${TEACHER_TWO}');`);
    await db.exec(readFileSync("supabase/schema.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261007000200_reviewer_portal.sql", "utf8"));
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("lifts throughput when an approval chain lands, and stays at the committed figure without one", async () => {
    const query: PostgresQuery = (sql, params) => db.query(sql, params);
    await liftScenario(query, "public.review_audit_events");
  }, 30_000);
});

// A configured dev/staging database, gated like the other real-Postgres
// suites. Read-only against public.review_audit_events (schema drift shows up
// here); the lift runs on a session-temporary copy, so no real audit event is
// ever written and nothing needs cleaning up.
const liveUrl = process.env.TEST_DATABASE_URL;
const live = liveUrl ? describe : describe.skip;

live("approval throughput from review_audit_events (TEST_DATABASE_URL)", () => {
  type PgClient = { connect(): Promise<void>; query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; end(): Promise<void> };
  let client: PgClient;
  beforeAll(async () => {
    const moduleName = "pg";
    const pg = (await import(/* @vite-ignore */ moduleName)) as { default: { Client: new (config: { connectionString: string }) => PgClient } };
    client = new pg.default.Client({ connectionString: liveUrl! });
    await client.connect();
  }, 30_000);
  afterAll(async () => { await client?.end(); });

  it("reads the deployed table with the shared query", async () => {
    const rows = await loadRuntimeRowsFromPostgres((sql, params) => client.query(sql, params));
    expect(Array.isArray(rows)).toBe(true);
  }, 30_000);

  it("lifts throughput when an approval chain lands, and stays at the committed figure without one", async () => {
    await client.query("create temp table review_audit_events (like public.review_audit_events including defaults)");
    try {
      await liftScenario((sql, params) => client.query(sql, params), "pg_temp.review_audit_events");
    } finally {
      await client.query("drop table if exists pg_temp.review_audit_events");
    }
  }, 30_000);
});
