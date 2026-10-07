import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Executes the real schema (with the reviewer-portal and sync-batch
// migrations) in PGlite and checks reviewer roles, the append-only review
// audit chain and the batched sync RPC against actual PostgreSQL behaviour.

const TEACHER = "aaaaaaaa-1111-4111-8111-111111111111";
const STUDENT = "bbbbbbbb-2222-4222-8222-222222222222";
const TEACHER2 = "cccccccc-3333-4333-8333-333333333333";
const H = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;
let db: PGlite;

async function as(id: string | null) {
  await db.exec("reset role; reset request.jwt.claim.sub;");
  if (id) await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
}

function event(seq: number, previousHash: string, hash: string, reviewerId = "teacher-one", extra: Record<string, unknown> = {}) {
  return {
    seq, previousHash, hash, questionId: "cnt:question:q1", subjectId: "wjec-alevel-physics",
    contentFingerprint: "wjec-review-v3:sha256:abc", decision: "approve", reviewerId,
    reviewerRole: "teacher", reviewerQualification: "PGCE Physics", ...extra,
  };
}

async function insertEvent(e: ReturnType<typeof event>, userId: string) {
  return db.query(
    `insert into review_audit_events (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [e.seq, e.previousHash, e.hash, e.questionId, e.subjectId, e.contentFingerprint, e.decision, e.reviewerId, userId, JSON.stringify(e)],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${TEACHER}'),('${STUDENT}'),('${TEACHER2}');`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema); // rerunnable
  await db.exec(readFileSync("supabase/migrations/20261007000200_reviewer_portal.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261007000300_sync_push_batch.sql", "utf8"));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
    revoke update, delete, truncate on public.review_audit_events from authenticated;
    revoke insert, update, delete, truncate on public.reviewer_roles from authenticated;`);
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
  it("accepts a reviewer's own decision and links the chain", async () => {
    await as(TEACHER);
    await insertEvent(event(1, "genesis", H(1)), TEACHER);
    expect((await db.query("select seq from review_audit_events")).rows).toEqual([{ seq: 1 }]);
  });

  it("refuses non-reviewers, impersonation and forks", async () => {
    await as(STUDENT);
    await expect(insertEvent(event(2, H(1), H(2), "teacher-one"), STUDENT)).rejects.toThrow(/row-level security|grant/);
    expect((await db.query("select * from review_audit_events")).rows).toHaveLength(0);
    await as(TEACHER);
    // Recording as another reviewer label.
    await expect(insertEvent(event(2, H(1), H(2), "teacher-two"), TEACHER)).rejects.toThrow(/reviewer grant/);
    // Inflated qualification.
    await expect(insertEvent(event(2, H(1), H(2), "teacher-one", { reviewerQualification: "Chief examiner" }), TEACHER)).rejects.toThrow(/reviewer grant/);
    // A fork: same predecessor twice, or a gap.
    await expect(insertEvent(event(3, H(1), H(3)), TEACHER)).rejects.toThrow(/chain moved on/);
    await expect(insertEvent(event(2, "genesis", H(3)), TEACHER)).rejects.toThrow(/chain moved on|duplicate/);
    // Columns that disagree with the hashed event.
    const bad = event(2, H(1), H(2));
    await expect(db.query(
      `insert into review_audit_events (seq, previous_hash, hash, question_id, subject_id, content_fingerprint, decision, reviewer_id, reviewer_user_id, event)
       values (2, $1, $2, 'cnt:question:q1', 'wjec-alevel-physics', 'wjec-review-v3:sha256:abc', 'reject', 'teacher-one', $3, $4::jsonb)`,
      [H(1), H(2), TEACHER, JSON.stringify(bad)],
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
    await insertEvent(event(2, H(1), H(2), "teacher-two", { reviewerQualification: "PGCE Chemistry" }), TEACHER2);
    await as(null);
    await db.query("select revoke_reviewer_role($1)", [TEACHER2]);
    await as(TEACHER2);
    await expect(insertEvent(event(3, H(2), H(3), "teacher-two", { reviewerQualification: "PGCE Chemistry" }), TEACHER2)).rejects.toThrow();
    expect((await db.query("select * from review_audit_events")).rows).toHaveLength(0);
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
