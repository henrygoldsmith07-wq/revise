import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/content-fingerprint";
import { REVIEWED_WJEC_SUBJECT_IDS } from "@/domain/content-trust";
import { emptyAuditLog, eventHash, type ReviewAuditEvent } from "@/domain/review-workflow";
import { combineAuditLog, REVIEW_AUDIT_EVENT_COLUMNS, type RuntimeEventRow } from "@/lib/reviewer/runtime-ledger";
// @ts-expect-error plain .mjs helper without types
import { grantFailureHint } from "../scripts/lib/reviewer-grant.mjs";

// Executes the real schema (with the reviewer-portal and sync-batch
// migrations) in PGlite and checks reviewer roles, the append-only review
// audit chain and the batched sync RPC against actual PostgreSQL behaviour.

const TEACHER = "aaaaaaaa-1111-4111-8111-111111111111";
const STUDENT = "bbbbbbbb-2222-4222-8222-222222222222";
const TEACHER2 = "cccccccc-3333-4333-8333-333333333333";
const H = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;
const INTEGRITY_MIGRATION = "supabase/migrations/20261018000100_reviewer_audit_integrity.sql";
/** Real hashes of the rows the suite persists (seq -> hash). */
const chain: string[] = [];
const CHECKS = {
  question: true, marking: true, workedSolution: true,
  capabilityMapping: true, specificationMapping: true, examRealism: true,
};
let db: PGlite;

async function as(id: string | null) {
  await db.exec("reset role; reset request.jwt.claim.sub;");
  if (id) await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
}

/** An event hashed by the domain's own eventHash, as the portal route builds it. */
function event(seq: number, previousHash: string, reviewerId = "teacher-one", extra: Record<string, unknown> = {}) {
  const base = {
    seq, previousHash, questionId: "cnt:question:q1", subjectId: "wjec-alevel-physics",
    contentFingerprint: "wjec-review-v3:sha256:abc", decision: "approve", reviewerId,
    // Synthetic database fixtures only; these are not human content approvals.
    reviewerRole: "teacher", reviewerQualification: "PGCE Physics", reviewedAt: "2026-01-07T10:00:00.000Z",
    checks: { ...CHECKS }, comments: "", classification: {}, ...extra,
  };
  return { ...base, hash: eventHash(base as unknown as Omit<ReviewAuditEvent, "hash">) };
}

/** Inside a transaction: expect a refusal without aborting the rest of it. */
let inTransaction = false;
async function refuses(run: () => Promise<unknown>, error: RegExp | Record<string, unknown>) {
  const check = () => (error instanceof RegExp ? expect(run()).rejects.toThrow(error) : expect(run()).rejects.toMatchObject(error));
  if (!inTransaction) return check();
  await db.exec("savepoint refusal");
  try {
    await check();
  } finally {
    await db.exec("rollback to savepoint refusal");
  }
}

async function withRollback(run: () => Promise<void>) {
  await db.exec("begin");
  inTransaction = true;
  try {
    await run();
  } finally {
    inTransaction = false;
    await db.exec("rollback");
  }
}

async function insertEvent(e: ReturnType<typeof event>, userId: string, payload: unknown = e) {
  return db.query(
    `insert into review_audit_events (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [e.seq, e.previousHash, e.hash, e.questionId, e.subjectId, e.contentFingerprint, e.decision, e.reviewerId, userId, JSON.stringify(payload)],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role authenticated; create role anon; create role service_role bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    insert into auth.users values ('${TEACHER}'),('${STUDENT}'),('${TEACHER2}');`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema); // rerunnable
  await db.exec(readFileSync("supabase/migrations/20261007000200_reviewer_portal.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261007000300_sync_push_batch.sql", "utf8"));
  const validation = readFileSync("supabase/migrations/20261014000200_reviewer_validation.sql", "utf8");
  await db.exec(validation); // upgrades an existing portal guard
  await db.exec(validation); // rerunnable
  await db.exec(`grant select, insert on public.review_audit_events to service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    revoke update, delete, truncate on public.review_audit_events from authenticated;
    revoke insert, update, delete, truncate on public.reviewer_roles from authenticated;`);
  // Supabase grants table-level privileges by default; the integrity migration
  // must narrow them when applied on top (and stay rerunnable).
  const integrity = readFileSync(INTEGRITY_MIGRATION, "utf8");
  await db.exec(integrity);
  await db.exec(integrity);
  // Granting is an operator action (no auth.uid()).
  await db.query("select grant_reviewer_role($1, 'teacher-one', 'teacher', 'PGCE Physics', 'henry')", [TEACHER]);
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("reviewer roles", () => {
  it("lets a reviewer read only their own grant, and nobody self-grant", async () => {
    await as(TEACHER);
    expect((await db.query("select reviewer_label from reviewer_roles")).rows).toEqual([{ reviewer_label: "teacher-one" }]);
    expect((await db.query<{ is_active_reviewer: boolean }>("select is_active_reviewer()")).rows[0]!.is_active_reviewer).toBe(true);
    await as(STUDENT);
    expect((await db.query("select * from reviewer_roles")).rows).toHaveLength(0);
    expect((await db.query<{ is_active_reviewer: boolean }>("select is_active_reviewer()")).rows[0]!.is_active_reviewer).toBe(false);
    await expect(db.query("insert into reviewer_roles(user_id, role, reviewer_label, qualification, granted_by) values ($1, 'teacher', 'student-self', 'none', 'me')", [STUDENT])).rejects.toThrow();
    await expect(db.query("select grant_reviewer_role($1, 'student-self', 'teacher', 'none', 'me')", [STUDENT])).rejects.toThrow(/permission denied/);
    await as(TEACHER);
    await expect(db.query("update reviewer_roles set qualification = 'Head of Science' where user_id = $1", [TEACHER])).rejects.toThrow();
  });
});

describe("review audit events", () => {
  it("refuses a direct authenticated approval missing all six checks", async () => {
    await as(TEACHER);
    await db.exec("begin");
    try {
      const incomplete = event(1, "genesis");
      delete (incomplete as Record<string, unknown>).checks;
      await expect(insertEvent(incomplete, TEACHER)).rejects.toThrow(/checks/);
    } finally {
      await db.exec("rollback");
    }
  });

  it.each(Object.keys(CHECKS).flatMap((check) => [false, null, "true", 1, undefined].map((value) => [check, value] as const)))(
    "refuses direct approval with %s check set to %s", async (check, value) => {
      await as(TEACHER);
      await withRollback(async () => {
        const checks = { ...CHECKS, [check]: value };
        await expect(insertEvent(event(1, "genesis", "teacher-one", { checks }), TEACHER)).rejects.toThrow(/checks/);
      });
    },
  );

  it.each([null, [], "true", true].map((checks) => ({ checks })))("refuses a non-object checks payload: $checks", async ({ checks }) => {
    await as(TEACHER);
    await withRollback(async () => {
      await expect(insertEvent(event(1, "genesis", "teacher-one", { checks }), TEACHER)).rejects.toThrow(/checks/);
    });
  });

  it.each([null, [], "event", 42].map((payload) => ({ payload })))("refuses a non-object audit event: $payload", async ({ payload }) => {
    await as(TEACHER);
    await withRollback(async () => {
      await expect(insertEvent(event(1, "genesis"), TEACHER, payload)).rejects.toThrow(/event object/);
    });
  });

  it.each([
    ["reviewerRole", "student"], ["reviewerRole", undefined], ["reviewerRole", 123],
    ["reviewerQualification", " "], ["reviewerQualification", "\t\r\n"], ["reviewerQualification", null],
    ["reviewerQualification", undefined], ["reviewerQualification", { name: "PGCE" }],
    ["comments", undefined], ["comments", null], ["comments", ["approved"]],
    ["reviewerId", " "], ["questionId", " "], ["subjectId", " "], ["contentFingerprint", " "],
  ])("refuses invalid decision metadata %s=%s", async (field, value) => {
    await as(TEACHER);
    await withRollback(async () => {
      const invalid = event(1, "genesis", "teacher-one", { [field as string]: value });
      await expect(insertEvent(invalid, TEACHER)).rejects.toThrow(/review decision/);
    });
  });

  it.each([
    undefined, null, 123, "", "today", "infinity", "2026-01-07", "2026-01-07T10:00:00",
    "2026-02-30T10:00:00Z", "2026-13-07T10:00:00Z", "2026-01-07T24:00:00Z",
    "2026-01-07T10:00:60Z", "2026-01-07T10:00:00+24:00", "2026-01-07T10:00:00+00:60",
  ])("refuses missing or malformed review date %s", async (reviewedAt) => {
    await as(TEACHER);
    await withRollback(async () => {
      await expect(insertEvent(event(1, "genesis", "teacher-one", { reviewedAt }), TEACHER)).rejects.toThrow(/review date|reviewedAt/);
    });
  });

  it("refuses a review date beyond the domain clock-skew allowance", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      const reviewedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await expect(insertEvent(event(1, "genesis", "teacher-one", { reviewedAt }), TEACHER)).rejects.toThrow(/future/);
    });
  });

  it.each([null, [], "confirmed", { transferConfirmed: "true" }, { dataAnalysisConfirmed: 1 }, { transferConfirmed: null }, { invented: true }].map((classification) => ({ classification })))(
    "refuses malformed classification $classification", async ({ classification }) => {
      await as(TEACHER);
      await withRollback(async () => {
        await expect(insertEvent(event(1, "genesis", "teacher-one", { classification }), TEACHER)).rejects.toThrow(/classification/);
      });
    },
  );

  it.each(["reject", "revise"].flatMap((decision) => [" ", "\t\r\n"].map((comments) => ({ decision, comments }))))("requires a nonblank comment for $decision: $comments", async ({ decision, comments }) => {
    await as(TEACHER);
    await withRollback(async () => {
      await expect(insertEvent(event(1, "genesis", "teacher-one", { decision, comments }), TEACHER)).rejects.toThrow(/comment/);
    });
  });

  it.each(["reject", "revise"])("accepts a commented %s with false checks", async (decision) => {
    await as(TEACHER);
    await withRollback(async () => {
      const checks = Object.fromEntries(Object.keys(CHECKS).map((check) => [check, false]));
      await insertEvent(event(1, "genesis", "teacher-one", { decision, checks, comments: "Synthetic revision reason." }), TEACHER);
      expect((await db.query("select decision from review_audit_events")).rows).toEqual([{ decision }]);
    });
  });

  it.each([
    { reviewedAt: "2026-01-07T10:00:00+01:00", classification: undefined },
    { reviewedAt: "2026-01-07T10:00:00.123Z", classification: { transferConfirmed: false, dataAnalysisConfirmed: true } },
  ])("accepts full ISO dates and optional boolean classifications: %s", async (extra) => {
    await as(TEACHER);
    await withRollback(async () => {
      await insertEvent(event(1, "genesis", "teacher-one", extra), TEACHER);
      expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 1 }]);
    });
  });

  it("preserves the domain's five-minute clock-skew allowance", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      const reviewedAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await insertEvent(event(1, "genesis", "teacher-one", { reviewedAt }), TEACHER);
      expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 1 }]);
    });
  });

  it("preserves service-only granting and applies validation to operator inserts", async () => {
    await as(null);
    await db.exec("set role service_role");
    await withRollback(async () => {
      await db.query("select grant_reviewer_role($1, 'service-granted', 'examiner', 'Synthetic qualification', 'operator')", [STUDENT]);
      await db.query("select revoke_reviewer_role($1)", [STUDENT]);
      expect((await db.query("select has_table_privilege('service_role', 'review_audit_events', 'UPDATE, DELETE, TRUNCATE') as can_mutate")).rows).toEqual([{ can_mutate: false }]);
      await insertEvent(event(1, "genesis", "operator", { reviewerRole: "subject-expert" }), TEACHER);
      expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 1 }]);
      await expect(db.query("update review_audit_events set decision = 'reject' where seq = 1")).rejects.toThrow(/permission denied/);
    });
    await as(null);
    await db.exec("set role service_role");
    await withRollback(async () => {
      await expect(insertEvent(event(1, "genesis", "operator", { checks: {} }), TEACHER)).rejects.toThrow(/checks/);
    });
  });

  it("makes the first runtime event continue the committed log's tail (the anchor)", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      // An empty table used to accept any seq and previous_hash.
      await refuses(() => insertEvent(event(1, H(9)), TEACHER), /continue the committed audit log/);
      await refuses(() => insertEvent(event(5, "genesis"), TEACHER), /continue the committed audit log/);
    });
    // Reviewers can neither read nor move the anchor.
    await refuses(() => db.query("select * from review_audit_anchor"), /permission denied/);
    await refuses(() => db.query("select set_review_audit_anchor(3, $1)", [H(3)]), /permission denied/);
    await as(null);
    await db.exec("set role service_role");
    await withRollback(async () => {
      // A committed log with three CLI-recorded events: the operator records its tail.
      await db.query("select set_review_audit_anchor(3, $1)", [H(3)]);
      await refuses(() => db.query("select set_review_audit_anchor(3, 'genesis')"), /check constraint/);
      await as(TEACHER);
      await refuses(() => insertEvent(event(1, "genesis"), TEACHER), /expected seq 4 after/);
      await insertEvent(event(4, H(3)), TEACHER);
      expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 4 }]);
    });
    await as(null);
    expect((await db.query("select tail_seq, tail_hash from review_audit_anchor")).rows).toEqual([{ tail_seq: 0, tail_hash: "genesis" }]);
  });

  it("accepts a reviewer's own decision and links the chain", async () => {
    await as(TEACHER);
    const first = event(1, "genesis");
    await insertEvent(first, TEACHER);
    chain[1] = first.hash;
    expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 1 }]);
  });

  it("refuses non-reviewers, impersonation and forks", async () => {
    await as(STUDENT);
    await expect(insertEvent(event(2, chain[1]!, "teacher-one"), STUDENT)).rejects.toThrow(/row-level security|grant/);
    expect((await db.query("select seq from review_audit_events")).rows).toHaveLength(0);
    await as(TEACHER);
    // Recording as another reviewer label.
    await expect(insertEvent(event(2, chain[1]!, "teacher-two"), TEACHER)).rejects.toThrow(/reviewer grant/);
    // Inflated qualification.
    await expect(insertEvent(event(2, chain[1]!, "teacher-one", { reviewerQualification: "Chief examiner" }), TEACHER)).rejects.toThrow(/reviewer grant/);
    // A fork: same predecessor twice, or a gap.
    await expect(insertEvent(event(3, chain[1]!), TEACHER)).rejects.toThrow(/chain moved on/);
    await expect(insertEvent(event(2, "genesis"), TEACHER)).rejects.toThrow(/chain moved on|duplicate/);
    // Columns that disagree with the hashed event.
    const bad = event(2, chain[1]!);
    await expect(db.query(
      `insert into review_audit_events (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
       values (2, $1, $2, 'cnt:question:q1', 'wjec-alevel-physics', 'wjec-review-v3:sha256:abc', 'reject', 'teacher-one', $3, $4::jsonb)`,
      [chain[1], bad.hash, TEACHER, JSON.stringify(bad)],
    )).rejects.toThrow(/does not match its columns/);
  });

  it("is append-only for everyone, including the operator", async () => {
    await as(TEACHER);
    await expect(db.query("update review_audit_events set decision = 'reject' where seq = 1")).rejects.toThrow();
    await expect(db.query("delete from review_audit_events where seq = 1")).rejects.toThrow();
    await as(null);
    await expect(db.query("update review_audit_events set decision = 'reject' where seq = 1")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from review_audit_events where seq = 1")).rejects.toThrow(/append-only/);
    expect((await db.query("select decision from review_audit_events")).rows).toEqual([{ decision: "approve" }]);
  });

  it("stops a revoked reviewer immediately and keeps history after account deletion", async () => {
    await as(null);
    await db.query("select grant_reviewer_role($1, 'teacher-two', 'teacher', 'PGCE Chemistry', 'henry')", [TEACHER2]);
    await as(TEACHER2);
    const second = event(2, chain[1]!, "teacher-two", { reviewerQualification: "PGCE Chemistry" });
    await insertEvent(second, TEACHER2);
    chain[2] = second.hash;
    await as(null);
    await db.query("select revoke_reviewer_role($1)", [TEACHER2]);
    await as(TEACHER2);
    await expect(insertEvent(event(3, chain[2]!, "teacher-two", { reviewerQualification: "PGCE Chemistry" }), TEACHER2)).rejects.toThrow();
    expect((await db.query("select seq from review_audit_events")).rows).toHaveLength(0);
    await as(null);
    await db.query("delete from auth.users where id = $1", [TEACHER2]);
    expect((await db.query("select count(*)::int as n from review_audit_events")).rows).toEqual([{ n: 2 }]);
    expect((await db.query("select count(*)::int as n from reviewer_roles where user_id = $1", [TEACHER2])).rows).toEqual([{ n: 0 }]);
  });
});

describe("sync_push_batch", () => {
  const row = (id: string, user: string, extra: Record<string, unknown> = {}) => ({
    id, user_id: user, subject_id: "s", topic_id: "t", data: { id, n: 1 }, updated_at: "2026-01-07T10:00:00.000Z", ...extra,
  });
  const A1 = "11111111-aaaa-4aaa-8aaa-000000000001";
  const A2 = "11111111-aaaa-4aaa-8aaa-000000000002";
  const K1 = "22222222-bbbb-4bbb-8bbb-000000000001";

  it("upserts several tables in one call under the caller's RLS and records keys", async () => {
    await as(STUDENT);
    const rows = [
      { table: "attempts", row: row(A1, STUDENT) },
      { table: "attempts", row: row(A2, STUDENT) },
      { table: "streaks", row: { user_id: STUDENT, data: { current: 3 }, updated_at: "2026-01-07T10:00:00.000Z" } },
    ];
    const result = await db.query<{ sync_push_batch: number }>("select sync_push_batch($1::jsonb, $2::uuid[])", [JSON.stringify(rows), [K1]]);
    expect(result.rows[0]!.sync_push_batch).toBe(3);
    expect((await db.query("select id from attempts order by id")).rows).toHaveLength(2);
    expect((await db.query("select id from sync_writes")).rows).toEqual([{ id: K1 }]);
  });

  it("keeps last-write-wins conflict semantics, including the stale-write guard", async () => {
    await as(STUDENT);
    await db.query("select sync_push_batch($1::jsonb)", [JSON.stringify([{ table: "attempts", row: row(A1, STUDENT, { data: { n: 2 }, updated_at: "2026-01-07T11:00:00.000Z" }) }])]);
    expect((await db.query<{ n: number }>("select (data->>'n')::int as n from attempts where id = $1", [A1])).rows[0]!.n).toBe(2);
    await db.query("select sync_push_batch($1::jsonb)", [JSON.stringify([{ table: "attempts", row: row(A1, STUDENT, { data: { n: 0 }, updated_at: "2026-01-07T09:00:00.000Z" }) }])]);
    expect((await db.query<{ n: number }>("select (data->>'n')::int as n from attempts where id = $1", [A1])).rows[0]!.n).toBe(2);
  });

  it("is all-or-nothing: one foreign-owner row rejects the whole batch", async () => {
    await as(STUDENT);
    const A3 = "11111111-aaaa-4aaa-8aaa-000000000003";
    const rows = [{ table: "attempts", row: row(A3, STUDENT) }, { table: "attempts", row: row("11111111-aaaa-4aaa-8aaa-000000000004", TEACHER) }];
    await expect(db.query("select sync_push_batch($1::jsonb)", [JSON.stringify(rows)])).rejects.toThrow(/owner/);
    expect((await db.query("select id from attempts where id = $1", [A3])).rows).toHaveLength(0);
  });

  it("refuses non-synced tables, unknown columns and anonymous callers", async () => {
    await as(STUDENT);
    await expect(db.query("select sync_push_batch($1::jsonb)", [JSON.stringify([{ table: "reviewer_roles", row: { user_id: STUDENT } }])])).rejects.toThrow(/not a synced table/);
    await expect(db.query("select sync_push_batch($1::jsonb)", [JSON.stringify([{ table: "attempts", row: row(A2, STUDENT, { evil: 1 }) }])])).rejects.toThrow(/unknown column/);
    await as(null);
    await expect(db.query("select sync_push_batch('[]'::jsonb)")).rejects.toThrow(/signed-in/);
  });
});

describe("review audit integrity (database-side auditLogIssues)", () => {
  const Q2 = { questionId: "cnt:question:q2" };

  it("computes exactly the domain's canonical JSON and eventHash", async () => {
    await as(null);
    const awkward = [
      "plain", "quote\" back\\slash /", "nl\n tab\t cr\r bs\b ff\f", "\u0001\u001f\u007f",
      "é ü ß 中文 😀", "\u2028\u2029", "</script>", "\u00a0nbsp", "",
    ];
    for (const text of awkward) {
      for (const extra of [{ classification: { transferConfirmed: true } }, { classification: undefined }]) {
        const e = event(12345, H(7), "teacher-one", { ...extra, comments: text, reviewerQualification: text, contentFingerprint: `fp ${text}` });
        const { hash, ...rest } = e;
        const result = await db.query<{ canonical: string; hash: string }>(
          "select review_audit_canonical_json($1::jsonb - 'hash') as canonical, review_audit_event_hash($1::jsonb) as hash",
          [JSON.stringify(e)],
        );
        expect(result.rows[0]!.canonical).toBe(canonicalJson(rest));
        expect(result.rows[0]!.hash).toBe(hash);
      }
    }
    // Every stored row still verifies.
    const stored = await db.query<{ ok: boolean }>("select bool_and(hash = review_audit_event_hash(event)) as ok from review_audit_events");
    expect(stored.rows[0]!.ok).toBe(true);
    // Fails closed on what it cannot reproduce exactly.
    await refuses(() => db.query("select review_audit_event_hash('{\"seq\": 1.5}'::jsonb)"), /integers/);
    await refuses(() => db.query("select review_audit_event_hash('{\"sé\": 1}'::jsonb)"), /ASCII/);
  });

  it("refuses a forged or edited hash, and accepts the real one", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      const real = event(3, chain[2]!, "teacher-one", Q2);
      await refuses(() => insertEvent({ ...real, hash: H(3) }, TEACHER), /hash does not match its content/);
      await refuses(() => insertEvent(real, TEACHER, { ...real, reviewedAt: "2026-01-08T10:00:00.000Z" }), /hash does not match its content/);
      await insertEvent(real, TEACHER);
      expect((await db.query("select seq from review_audit_events where seq = 3")).rows).toEqual([{ seq: 3 }]);
    });
  });

  it("refuses fields that are not part of a review audit event", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one", { ...Q2, note: "x" }), TEACHER), /not part of a review audit event/);
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one", { ...Q2, checks: { ...CHECKS, bonus: true } }), TEACHER), /checks/);
    });
  });

  it.each([
    ["subjectId", "wjec-alevel-history", /review-gated/],
    ["questionId", "\u00a0", /blank/],
    ["contentFingerprint", "\ufeff\u3000", /blank/],
  ])("refuses %s=%j, which the domain would reject", async (field, value, error) => {
    await as(TEACHER);
    await withRollback(async () => {
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one", { ...Q2, [field]: value }), TEACHER), error);
    });
  });

  it("refuses a revision request whose comment is only JavaScript whitespace", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one", { ...Q2, decision: "revise", comments: "\u00a0\u2007" }), TEACHER), /comment/);
    });
  });

  it("mirrors REVIEWED_WJEC_SUBJECT_IDS", () => {
    const sql = readFileSync(INTEGRITY_MIGRATION, "utf8");
    const list = /reviewed_subjects constant text\[\] := array\[([^\]]*)\]/.exec(sql)?.[1] ?? "";
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...REVIEWED_WJEC_SUBJECT_IDS].sort());
  });

  it("refuses a second approval of the same content by the same reviewer, until a block", async () => {
    await as(TEACHER);
    await withRollback(async () => {
      // teacher-one approved q1 at seq 1.
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one"), TEACHER), { code: "23505" });
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one"), TEACHER), /already approved this exact content/);
    });
    await withRollback(async () => {
      // A revision request resets the chain, as in auditLogIssues.
      const revise = event(3, chain[2]!, "teacher-one", { decision: "revise", comments: "Synthetic revision reason." });
      await insertEvent(revise, TEACHER);
      await insertEvent(event(4, revise.hash, "teacher-one"), TEACHER);
      expect((await db.query("select count(*)::int as n from review_audit_events")).rows).toEqual([{ n: 4 }]);
    });
  });

  it("counts a relabelled account as the same reviewer", async () => {
    await as(null);
    await withRollback(async () => {
      // Only the database owner can relabel now (grant_reviewer_role refuses).
      await db.query("update reviewer_roles set reviewer_label = 'teacher-one-again' where user_id = $1", [TEACHER]);
      await as(TEACHER);
      await refuses(() => insertEvent(event(3, chain[2]!, "teacher-one-again"), TEACHER), /already approved this exact content/);
    });
    await as(null);
    await db.exec("set role service_role");
    await withRollback(async () => {
      await refuses(() => insertEvent(event(3, chain[2]!, "operator"), TEACHER), /already approved this exact content/);
    });
  });

  it("never changes an existing grant's pseudonym", async () => {
    await as(null);
    // The maintainer CLI turns the database's refusal into the fix.
    const refusal = await db.query("select grant_reviewer_role($1, 'teacher-fresh', 'teacher', 'PGCE Physics', 'henry')", [TEACHER]).catch((error: Error) => error);
    expect(grantFailureHint((refusal as Error).message)).toMatch(/re-run with --label teacher-one/);
    await withRollback(async () => {
      await refuses(() => db.query("select grant_reviewer_role($1, 'teacher-fresh', 'teacher', 'PGCE Physics', 'henry')", [TEACHER]), /pseudonym cannot change/);
      await db.query("select revoke_reviewer_role($1)", [TEACHER]);
      await refuses(() => db.query("select grant_reviewer_role($1, 'teacher-fresh', 'teacher', 'PGCE Physics', 'henry')", [TEACHER]), /pseudonym cannot change/);
      // Re-granting under the same pseudonym still works (and may update the role).
      await db.query("select grant_reviewer_role($1, 'teacher-one', 'examiner', 'PGCE Physics; examiner', 'henry')", [TEACHER]);
      expect((await db.query("select reviewer_label, role, revoked_at from reviewer_roles where user_id = $1", [TEACHER])).rows)
        .toEqual([{ reviewer_label: "teacher-one", role: "examiner", revoked_at: null }]);
    });
  });

  it("does not let reviewers read reviewer_user_id, and keeps the portal's read", async () => {
    await as(TEACHER);
    await refuses(() => db.query("select reviewer_user_id from review_audit_events"), /permission denied/);
    await refuses(() => db.query("select * from review_audit_events"), /permission denied/);
    const rows = await db.query<RuntimeEventRow>(`select ${REVIEW_AUDIT_EVENT_COLUMNS.join(", ")} from review_audit_events order by seq`);
    expect(rows.rows.map((r) => r.seq)).toEqual([1, 2]);
    // What the database accepted is a chain the domain verifies end to end.
    expect(combineAuditLog(emptyAuditLog(), rows.rows).issues).toEqual([]);
    // PostgREST's no-body insert (supabase-js .insert() without .select())
    // returns a constant, so it needs no SELECT on reviewer_user_id.
    await withRollback(async () => {
      const e = event(3, chain[2]!, "teacher-one", Q2);
      const result = await db.query(
        `with pgrst_source as (
           insert into public.review_audit_events (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
           select seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event
             from json_populate_recordset(null::public.review_audit_events, $1::json)
           returning 1)
         select count(*)::int as n from pgrst_source`,
        [JSON.stringify([{ seq: 3, previous_hash: e.previousHash, hash: e.hash, question_id: e.questionId, subject_id: e.subjectId, content_fingerprint: e.contentFingerprint, decision: e.decision, reviewer_id: e.reviewerId, reviewer_user_id: TEACHER, event: e }])],
      );
      expect(result.rows).toEqual([{ n: 1 }]);
      await refuses(() => db.query("insert into public.review_audit_events (seq) values (99) returning reviewer_user_id"), /permission denied/);
    });
  });

  it("freezes the anchor once the runtime log has events", async () => {
    await as(null);
    await db.exec("set role service_role");
    await refuses(() => db.query("select set_review_audit_anchor(3, $1)", [H(3)]), /can no longer move/);
  });
});
