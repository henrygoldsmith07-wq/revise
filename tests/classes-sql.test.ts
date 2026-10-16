import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Execute the full shipped schema, then rerun the standalone migration twice.
// No broad test-only table grants: the RPC grants and RLS are the real contract.
const TEACHER = "aaaaaaaa-1111-4111-8111-111111111111";
const OTHER_TEACHER = "bbbbbbbb-2222-4222-8222-222222222222";
const EXAMINER = "cccccccc-3333-4333-8333-333333333333";
const REVOKED_TEACHER = "dddddddd-4444-4444-8444-444444444444";
const MINOR = "eeeeeeee-5555-4555-8555-555555555555";
const ADULT = "ffffffff-6666-4666-8666-666666666666";
const PEER = "11111111-7777-4777-8777-777777777777";
const OUTSIDER = "22222222-8888-4888-8888-888888888888";
const USERS = [TEACHER, OTHER_TEACHER, EXAMINER, REVOKED_TEACHER, MINOR, ADULT, PEER, OUTSIDER];
const CLASS_TABLES = ["teacher_classes", "class_memberships", "class_assignments", "class_evidence", "class_join_limits"];

type TeacherClass = { id: string; user_id: string; name: string; join_code: string };
type Membership = { class_id: string; user_id: string; alias: string; age_band: string; status: string; consented_at: Date; authorized_at: Date | null };
let db: PGlite;
let ownClass: TeacherClass;
let otherClass: TeacherClass;

async function as(id: string | null) {
  await db.exec("reset role; reset request.jwt.claim.sub;");
  if (id) {
    await db.exec("set role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  }
}

async function createClass(owner: string, name: string) {
  await as(owner);
  return (await db.query<TeacherClass>("select * from create_teacher_class($1)", [name])).rows[0]!;
}

async function join(id: string, ageBand = "18+", target = ownClass) {
  await as(id);
  return (await db.query<{ joined: boolean }>(
    "select join_teacher_class($1, $2, $3, true) as joined", [target.join_code, "Learner One", ageBand],
  )).rows[0]!.joined;
}

async function timestamp(offset = "0 seconds") {
  return (await db.query<{ at: string }>("select (now() + $1::interval)::text as at", [offset])).rows[0]!.at;
}

async function evidence(studentId = ADULT, overrides: Record<string, unknown> = {}) {
  return {
    attemptId: crypto.randomUUID(), studentId, questionId: "cnt:physics:check-1", topicId: "physics/units",
    awarded: 2, max: 3, misconception: "units", attemptedAt: await timestamp(), ...overrides,
  };
}

function share(payload: unknown, target = ownClass) {
  return db.query("select share_class_evidence($1, $2::jsonb)", [target.id, JSON.stringify(payload)]);
}

async function assignment(target = ownClass) {
  return db.query("select set_class_assignment($1, 'Units check', 'check', $2::text[], null, '2026-11-01')", [target.id, ["cnt:physics:check-1"]]);
}

async function residual(id: string) {
  await as(null);
  await db.exec("set role service_role;");
  return (await db.query<{ scope: string; remaining: number }>("select * from account_residual_rows($1)", [id])).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role authenticated; create role anon; create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant usage on schema public to anon, service_role;
    grant execute on function auth.uid() to authenticated;`);
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  // A standalone migration must not hide a missing addition to schema.sql.
  const shipped = await db.query<{ name: string }>(
    "select tablename as name from pg_tables where schemaname = 'public' and tablename = any($1::text[])", [CLASS_TABLES],
  );
  expect(shipped.rows.map((row) => row.name).sort()).toEqual([...CLASS_TABLES].sort());
  const migration = readFileSync("supabase/migrations/20261014000100_teacher_classes.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
}, 30000);

beforeEach(async () => {
  await as(null);
  // All fixtures have owning-account cascades; no test depends on a previous one.
  await db.exec("delete from auth.users;");
  for (const id of USERS) await db.query("insert into auth.users(id) values ($1)", [id]);
  for (const [id, label, role] of [
    [TEACHER, "class-teacher", "teacher"], [OTHER_TEACHER, "other-teacher", "teacher"],
    [EXAMINER, "class-examiner", "examiner"], [REVOKED_TEACHER, "revoked-teacher", "teacher"],
  ]) {
    await db.query("select grant_reviewer_role($1, $2, $3, 'PGCE Physics', 'test-operator')", [id, label, role]);
  }
  await db.query("select revoke_reviewer_role($1)", [REVOKED_TEACHER]);
  ownClass = await createClass(TEACHER, "Physics One");
  otherClass = await createClass(OTHER_TEACHER, "Physics Two");
  await as(TEACHER);
  await assignment();
  await as(OTHER_TEACHER);
  await assignment(otherClass);
});

afterAll(async () => { await db?.close(); });

describe("actual PostgreSQL teacher classes contract", () => {
  it("creates classes only for active teachers, with server-generated confidential codes", async () => {
    const created = await createClass(TEACHER, "  New class  ");
    expect(created).toMatchObject({ user_id: TEACHER, name: "New class" });
    expect(created.join_code).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set([created.join_code, ownClass.join_code, otherClass.join_code]).size).toBe(3);
    for (const id of [EXAMINER, REVOKED_TEACHER, ADULT]) {
      await as(id);
      await expect(db.query("select * from create_teacher_class('Not permitted')")).rejects.toThrow(/Active teacher grant required/);
    }
    await as(TEACHER);
    await expect(db.query("select * from create_teacher_class('   ')")).rejects.toThrow(/check constraint/);
    await as(null);
    await db.exec("set role anon;");
    await expect(db.query("select * from create_teacher_class('Anonymous')")).rejects.toThrow(/permission denied/);
    await expect(db.query("select join_teacher_class($1, 'Learner One', '18+', true)", [ownClass.join_code])).rejects.toThrow(/permission denied/);
  });

  it("does not let learners browse classes or codes, or let another teacher read a foreign class", async () => {
    expect(await join(ADULT)).toBe(true);
    await as(ADULT);
    expect((await db.query("select * from teacher_classes")).rows).toEqual([]);
    expect((await db.query("select join_code from teacher_classes where id = $1", [ownClass.id])).rows).toEqual([]);
    const memberships = (await db.query<Record<string, unknown>>("select * from list_my_class_memberships()")).rows;
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ class_id: ownClass.id, user_id: ADULT, class_name: "Physics One" });
    expect(Object.keys(memberships[0]!).sort()).toEqual(["age_band", "alias", "authorized_at", "class_id", "class_name", "consented_at", "status", "user_id"]);
    expect(JSON.stringify(memberships)).not.toContain(ownClass.join_code);
    await as(OTHER_TEACHER);
    expect((await db.query("select id, join_code from teacher_classes")).rows).toEqual([{ id: otherClass.id, join_code: otherClass.join_code }]);
    expect((await db.query("select * from class_memberships where class_id = $1", [ownClass.id])).rows).toEqual([]);
    await as(OUTSIDER);
    expect((await db.query("select * from teacher_classes")).rows).toEqual([]);
    expect((await db.query("select * from list_my_class_memberships()")).rows).toEqual([]);
  });

  it("joins only the caller, makes minors pending and adults active, and cannot replay a minor into adult consent", async () => {
    expect(await join(MINOR, "13-17")).toBe(true);
    const original = (await db.query<Membership>("select * from class_memberships")).rows[0]!;
    expect(original).toMatchObject({ class_id: ownClass.id, user_id: MINOR, age_band: "13-17", status: "pending", authorized_at: null });
    expect(await join(MINOR, "18+")).toBe(true);
    expect((await db.query<Membership>("select * from class_memberships")).rows).toEqual([original]);
    expect(await join(ADULT)).toBe(true);
    expect((await db.query<Membership>("select * from class_memberships")).rows).toEqual([
      expect.objectContaining({ user_id: ADULT, age_band: "18+", status: "active", authorized_at: null }),
    ]);
    expect(await join(TEACHER)).toBe(false);
    await as(null);
    expect((await db.query("select user_id from class_memberships order by user_id")).rows).toEqual([{ user_id: MINOR }, { user_id: ADULT }]);
  });

  it("denies absent consent, under-13 or missing ages, PII aliases and invalid codes without creating membership", async () => {
    await as(ADULT);
    const invalid: unknown[][] = [
      [ownClass.join_code, "Learner One", "18+", false],
      [ownClass.join_code, "Learner One", "18+", null],
      [ownClass.join_code, "Learner One", "under-13", true],
      [ownClass.join_code, "Learner One", null, true],
      [ownClass.join_code, "learner@example.com", "18+", true],
      ["invalid-code", "Learner One", "18+", true],
      ["0".repeat(64), "Learner One", "18+", true],
    ];
    for (const args of invalid) {
      expect((await db.query<{ joined: boolean }>("select join_teacher_class($1, $2, $3, $4) as joined", args)).rows).toEqual([{ joined: false }]);
    }
    expect((await db.query("select * from class_memberships")).rows).toEqual([]);
    // The valid eighth request demonstrates that none of the denials created a row.
    expect(await join(ADULT)).toBe(true);
  });

  it("persists invalid guesses, refuses the ninth request even with a valid code, and only resets an expired bucket", async () => {
    for (let n = 1; n <= 8; n++) {
      await as(ADULT);
      expect((await db.query<{ joined: boolean }>("select join_teacher_class($1, 'Learner One', '18+', true) as joined", ["0".repeat(64)])).rows).toEqual([{ joined: false }]);
      await as(null);
      expect((await db.query("select tries from class_join_limits where user_id = $1", [ADULT])).rows).toEqual([{ tries: n }]);
    }
    expect(await join(ADULT)).toBe(false);
    await expect(db.query("select * from class_join_limits")).rejects.toThrow(/permission denied/);
    await expect(db.query("update class_join_limits set tries = 0 where user_id = $1", [ADULT])).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from class_join_limits where user_id = $1", [ADULT])).rejects.toThrow(/permission denied/);
    await as(null);
    expect((await db.query("select tries from class_join_limits where user_id = $1", [ADULT])).rows).toEqual([{ tries: 9 }]);
    expect((await db.query("select * from class_memberships where user_id = $1", [ADULT])).rows).toEqual([]);
    await db.query("update class_join_limits set window_start = now() - interval '16 minutes' where user_id = $1", [ADULT]);
    expect(await join(ADULT)).toBe(true);
    await as(null);
    expect((await db.query("select tries from class_join_limits where user_id = $1", [ADULT])).rows).toEqual([{ tries: 1 }]);
  });

  it("exposes only the caller's roster row, while the owning teacher can see their class roster", async () => {
    expect(await join(ADULT)).toBe(true);
    expect(await join(PEER)).toBe(true);
    expect(await join(MINOR, "13-17")).toBe(true);
    await as(ADULT);
    expect((await db.query("select user_id from class_memberships")).rows).toEqual([{ user_id: ADULT }]);
    expect((await db.query("select * from class_memberships where user_id = $1", [PEER])).rows).toEqual([]);
    expect((await db.query("select user_id from list_my_class_memberships()")).rows).toEqual([{ user_id: ADULT }]);
    await as(TEACHER);
    expect((await db.query("select user_id from class_memberships order by user_id")).rows).toEqual([{ user_id: PEER }, { user_id: MINOR }, { user_id: ADULT }]);
    await as(OTHER_TEACHER);
    expect((await db.query("select * from class_memberships")).rows).toEqual([]);
  });

  it("permits assignments only on a teacher's own class and rejects raw or PII content identifiers", async () => {
    await as(TEACHER);
    await db.query("select set_class_assignment($1, 'Revise units', 'topic', '{}'::text[], 'physics/units', '2026-11-02')", [ownClass.id]);
    expect((await db.query("select user_id, kind from class_assignments order by kind")).rows).toEqual([{ user_id: TEACHER, kind: "check" }, { user_id: TEACHER, kind: "topic" }]);
    for (const id of [OTHER_TEACHER, EXAMINER, REVOKED_TEACHER, ADULT]) {
      await as(id);
      await expect(assignment()).rejects.toThrow(/Class owner required/);
    }
    await as(TEACHER);
    await expect(assignment(otherClass)).rejects.toThrow(/Class owner required/);
    for (const ids of [["raw answer text"], ["learner@example.com"], [null]]) {
      await expect(db.query("select set_class_assignment($1, 'Bad identifier', 'check', $2::text[], null, '2026-11-01')", [ownClass.id, ids])).rejects.toThrow(/Content identifiers required/);
    }
    await expect(db.query("select set_class_assignment($1, 'Bad identifier', 'topic', '{}'::text[], 'learner@example.com', '2026-11-01')", [ownClass.id])).rejects.toThrow(/Content identifiers required/);
    await expect(db.query("select set_class_assignment($1, 'Empty check', 'check', '{}'::text[], null, '2026-11-01')", [ownClass.id])).rejects.toThrow(/check constraint/);
    await as(OTHER_TEACHER);
    expect((await db.query("select * from class_assignments where class_id = $1", [ownClass.id])).rows).toEqual([]);
  });

  it("hides assignments and even existing metadata from pending members until owner authorization", async () => {
    expect(await join(MINOR, "13-17")).toBe(true);
    await expect(share([await evidence(MINOR)])).rejects.toThrow(/Active consenting membership required/);
    await as(TEACHER);
    // Seed a snapshot as operator to exercise read RLS independently of upload RLS.
    await as(null);
    await db.query(`insert into class_evidence(class_id, user_id, attempt_id, question_id, topic_id, awarded, max, attempted_at)
      values ($1, $2, $3, 'cnt:physics:check-1', 'physics/units', 2, 3, now())`, [ownClass.id, MINOR, crypto.randomUUID()]);
    await as(MINOR);
    expect((await db.query("select * from class_assignments")).rows).toEqual([]);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await expect(db.query("select authorize_class_member($1, $2, true)", [ownClass.id, MINOR])).rejects.toThrow(/Class owner required/);
    await as(OTHER_TEACHER);
    await expect(db.query("select authorize_class_member($1, $2, true)", [ownClass.id, MINOR])).rejects.toThrow(/Class owner required/);
    await as(TEACHER);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await db.query("select authorize_class_member($1, $2, true)", [ownClass.id, MINOR]);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
    await as(MINOR);
    expect((await db.query("select * from class_assignments")).rows).toHaveLength(1);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
    expect((await db.query<Membership>("select * from class_memberships")).rows[0]).toMatchObject({ status: "active", authorized_at: expect.any(Date) });
    await share([await evidence(MINOR)]);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(2);
  });

  it("accepts only caller-owned post-consent metadata and denies raw answers, PII keys, foreign students and invalid timestamps", async () => {
    expect(await join(ADULT)).toBe(true);
    const valid = await evidence();
    const preConsent = (await db.query<{ at: string }>("select (consented_at - interval '1 second')::text as at from class_memberships where class_id = $1", [ownClass.id])).rows[0]!.at;
    const invalid = [
      { ...valid, rawAnswer: "private written answer" }, { ...valid, answer: "private written answer" },
      { ...valid, email: "learner@example.com" }, { ...valid, name: "Learner Name" },
      { ...valid, studentId: PEER }, { ...valid, attemptedAt: preConsent },
      { ...valid, attemptedAt: await timestamp("1 day") }, { ...valid, attemptedAt: null },
    ];
    for (const snapshot of invalid) {
      await expect(share([snapshot])).rejects.toThrow(/Only caller-owned metadata|Attempt must be after consent/);
    }
    await as(null);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await as(ADULT);
    await share([valid]);
    const stored = (await db.query<Record<string, unknown>>("select * from class_evidence")).rows;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ class_id: ownClass.id, user_id: ADULT, attempt_id: valid.attemptId, question_id: valid.questionId, topic_id: valid.topicId });
    expect(Object.keys(stored[0]!).sort()).toEqual(["attempt_id", "attempted_at", "awarded", "class_id", "max", "misconception", "question_id", "topic_id", "user_id"]);
    await as(TEACHER);
    expect((await db.query("select * from class_evidence")).rows).toEqual(stored);
    await expect(share([await evidence(TEACHER)])).rejects.toThrow(/Active consenting membership required/);
  });

  it("shares only attempts matching a published assignment in the target class, for checks or topics", async () => {
    expect(await join(ADULT)).toBe(true);
    // A topic appearing in a check's metadata is not itself a topic assignment.
    await expect(share([await evidence(ADULT, { questionId: "cnt:unassigned" })])).rejects.toThrow(/published class assignment/);
    await as(TEACHER);
    const unassignedClass = await createClass(TEACHER, "No assignment yet");
    expect(await join(ADULT, "18+", unassignedClass)).toBe(true);
    // The same question is assigned in ownClass, but not in this class.
    await expect(share([await evidence()], unassignedClass)).rejects.toThrow(/published class assignment/);
    await as(TEACHER);
    await db.query("select set_class_assignment($1, 'Topic practice', 'topic', '{}'::text[], 'physics/graphs', '2026-11-01')", [unassignedClass.id]);
    await as(ADULT);
    await expect(share([await evidence(ADULT, { questionId: "cnt:topic-practice", topicId: "physics/units" })], unassignedClass)).rejects.toThrow(/published class assignment/);
    await share([await evidence(ADULT, { questionId: "cnt:topic-practice", topicId: "physics/graphs" })], unassignedClass);
    expect((await db.query("select class_id, topic_id from class_evidence")).rows).toEqual([{ class_id: unassignedClass.id, topic_id: "physics/graphs" }]);
  });

  it("rejects minor attempts made after joining but before teacher authorization", async () => {
    expect(await join(MINOR, "13-17")).toBe(true);
    // Model time between consent and authorization without depending on sleeps.
    await as(null);
    await db.query("update class_memberships set consented_at = now() - interval '1 hour' where user_id = $1", [MINOR]);
    await as(MINOR);
    const beforeAuthorization = await evidence(MINOR, { attemptedAt: await timestamp("-30 minutes") });
    await as(TEACHER);
    await db.query("select authorize_class_member($1, $2, true)", [ownClass.id, MINOR]);
    await as(MINOR);
    await expect(share([beforeAuthorization])).rejects.toThrow(/after consent and authorization/);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await share([await evidence(MINOR)]);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
  });

  it("rejects malformed, excessive and out-of-bounds metadata atomically", async () => {
    expect(await join(ADULT)).toBe(true);
    const valid = await evidence();
    for (const payload of [null, {}, Array.from({ length: 101 }, () => valid)]) {
      await expect(share(payload)).rejects.toThrow(/At most 100 metadata snapshots/);
    }
    await expect(share(["raw answer"])).rejects.toThrow(/Metadata object required/);
    for (const snapshot of [
      { ...valid, questionId: "learner@example.com" }, { ...valid, topicId: "private answer text" },
      { ...valid, awarded: -1 }, { ...valid, awarded: 4 }, { ...valid, max: 0 }, { ...valid, max: 1001 },
      { ...valid, misconception: "raw answer text" }, { ...valid, attemptId: null },
    ]) {
      // The valid first item must roll back when any later item is invalid.
      await expect(share([valid, { ...snapshot, attemptId: snapshot.attemptId === null ? null : crypto.randomUUID() }])).rejects.toThrow(/check constraint|null value|published class assignment/);
      expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    }
    await share(Array.from({ length: 100 }, () => valid));
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
  });

  it("deduplicates retries without mutating an already-shared snapshot", async () => {
    expect(await join(ADULT)).toBe(true);
    const original = await evidence();
    await share([original, original]);
    const stored = (await db.query("select * from class_evidence")).rows;
    expect(stored).toHaveLength(1);
    await share([{ ...original, awarded: 0, topicId: "changed/topic", misconception: "other", attemptedAt: await timestamp() }]);
    expect((await db.query("select * from class_evidence")).rows).toEqual(stored);
    await expect(db.query("update class_evidence set awarded = 0 where user_id = $1", [ADULT])).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from class_evidence where user_id = $1", [ADULT])).rejects.toThrow(/permission denied/);
  });

  it("denies cross-user evidence reads and writes, and cannot leave or authorize another learner", async () => {
    expect(await join(ADULT)).toBe(true);
    await share([await evidence()]);
    expect(await join(PEER)).toBe(true);
    await share([await evidence(PEER)]);
    expect((await db.query("select user_id from class_evidence")).rows).toEqual([{ user_id: PEER }]);
    expect((await db.query("select * from class_evidence where user_id = $1", [ADULT])).rows).toEqual([]);
    await expect(share([await evidence(ADULT)])).rejects.toThrow(/Only caller-owned metadata/);
    await expect(share([await evidence(PEER)], otherClass)).rejects.toThrow(/Active consenting membership required/);
    await expect(db.query("select authorize_class_member($1, $2, true)", [ownClass.id, ADULT])).rejects.toThrow(/Class owner required/);
    // There is no target student parameter: leaving can remove only PEER.
    await db.query("select leave_teacher_class($1)", [ownClass.id]);
    await as(ADULT);
    expect((await db.query("select user_id from class_memberships")).rows).toEqual([{ user_id: ADULT }]);
    expect((await db.query("select user_id from class_evidence")).rows).toEqual([{ user_id: ADULT }]);
    await as(OTHER_TEACHER);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await as(OUTSIDER);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await expect(share([await evidence(OUTSIDER)])).rejects.toThrow(/Active consenting membership required/);
  });

  it("requires RPCs for all writes, so learners and teachers cannot forge membership, ownership or snapshots", async () => {
    expect(await join(ADULT)).toBe(true);
    for (const id of [ADULT, TEACHER]) {
      await as(id);
      await expect(db.query("insert into teacher_classes(user_id, name, join_code) values ($1, 'Forged', $2)", [id, "0".repeat(64)])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into class_memberships(class_id, user_id, alias, age_band, status) values ($1, $2, 'Forged', '18+', 'active')", [ownClass.id, PEER])).rejects.toThrow(/permission denied/);
      await expect(db.query("update class_memberships set status = 'active', age_band = '18+' where user_id = $1", [MINOR])).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from class_memberships where user_id = $1", [ADULT])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into class_assignments(class_id, user_id, title, kind, question_ids, due_date) values ($1, $2, 'Forged', 'check', '{q1}', '2026-11-01')", [ownClass.id, OTHER_TEACHER])).rejects.toThrow(/permission denied/);
      await expect(db.query(`insert into class_evidence(class_id, user_id, attempt_id, question_id, topic_id, awarded, max, attempted_at)
        values ($1, $2, $3, 'q1', 'topic', 1, 1, now())`, [ownClass.id, PEER, crypto.randomUUID()])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into class_join_limits(user_id, tries) values ($1, 0)", [id])).rejects.toThrow(/permission denied/);
    }
  });

  it("leaving immediately deletes evidence, and a rejoin cannot reshare attempts from before the new consent", async () => {
    expect(await join(ADULT)).toBe(true);
    // Model a membership established an hour ago without relying on wall-clock sleeps.
    await as(null);
    await db.query("update class_memberships set consented_at = now() - interval '1 hour' where user_id = $1", [ADULT]);
    await as(ADULT);
    const oldConsent = (await db.query<Membership>("select * from class_memberships")).rows[0]!.consented_at;
    const oldAttempt = await evidence(ADULT, { attemptedAt: await timestamp("-30 minutes") });
    await share([oldAttempt]);
    await db.query("select leave_teacher_class($1)", [ownClass.id]);
    expect((await db.query("select * from list_my_class_memberships()")).rows).toEqual([]);
    await as(TEACHER);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await as(null);
    expect((await db.query("select * from class_evidence where user_id = $1", [ADULT])).rows).toEqual([]);
    expect(await join(ADULT)).toBe(true);
    const newConsent = (await db.query<Membership>("select * from class_memberships")).rows[0]!.consented_at;
    expect(newConsent.getTime()).toBeGreaterThan(oldConsent.getTime());
    await expect(share([oldAttempt])).rejects.toThrow(/Attempt must be after consent/);
    await share([await evidence()]);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
  });

  it("withdrawing authorization immediately deletes evidence and prevents reads and further uploads", async () => {
    expect(await join(MINOR, "13-17")).toBe(true);
    await as(TEACHER);
    await db.query("select authorize_class_member($1, $2, true)", [ownClass.id, MINOR]);
    await as(MINOR);
    await share([await evidence(MINOR)]);
    await as(TEACHER);
    expect((await db.query("select * from class_evidence")).rows).toHaveLength(1);
    await db.query("select authorize_class_member($1, $2, false)", [ownClass.id, MINOR]);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await as(null);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await as(MINOR);
    expect((await db.query<Membership>("select * from class_memberships")).rows[0]).toMatchObject({ status: "pending", authorized_at: null });
    expect((await db.query("select * from class_assignments")).rows).toEqual([]);
    await expect(share([await evidence(MINOR)])).rejects.toThrow(/Active consenting membership required/);
  });

  it("revoking the teacher grant immediately stops class reads, joins, assignments and uploads", async () => {
    expect(await join(ADULT)).toBe(true);
    await share([await evidence()]);
    await as(null);
    await db.query("select revoke_reviewer_role($1)", [TEACHER]);
    await as(ADULT);
    expect((await db.query("select * from class_assignments")).rows).toEqual([]);
    expect((await db.query("select * from class_evidence")).rows).toEqual([]);
    await expect(share([await evidence()])).rejects.toThrow(/Active consenting membership required/);
    // Retain the learner's consent-management view so they can still leave.
    expect((await db.query("select * from list_my_class_memberships()")).rows).toHaveLength(1);
    expect(await join(OUTSIDER)).toBe(false);
    await as(TEACHER);
    for (const table of ["teacher_classes", "class_memberships", "class_assignments", "class_evidence"]) {
      expect((await db.query(`select * from ${table}`)).rows).toEqual([]);
    }
    await expect(assignment()).rejects.toThrow(/Class owner required/);
    await expect(db.query("select authorize_class_member($1, $2, true)", [ownClass.id, ADULT])).rejects.toThrow(/Class owner required/);
    await as(OTHER_TEACHER);
    expect((await db.query("select id from teacher_classes")).rows).toEqual([{ id: otherClass.id }]);
  });

  it("discovers learner class residuals and cascades account deletion without deleting classmates or assignments", async () => {
    expect(await join(ADULT)).toBe(true);
    await share([await evidence()]);
    expect(await join(PEER)).toBe(true);
    await share([await evidence(PEER)]);
    expect((await residual(ADULT)).map((row) => row.scope)).toEqual(expect.arrayContaining(["class_memberships", "class_evidence", "class_join_limits", "auth.users"]));
    await as(ADULT);
    await expect(db.query("select * from account_residual_rows($1)", [ADULT])).rejects.toThrow(/permission denied/);
    await as(null);
    await db.query("delete from auth.users where id = $1", [ADULT]);
    for (const table of CLASS_TABLES) {
      expect((await db.query(`select * from ${table} where user_id = $1`, [ADULT])).rows).toEqual([]);
    }
    expect((await db.query("select user_id from class_evidence")).rows).toEqual([{ user_id: PEER }]);
    expect((await db.query("select user_id from class_memberships")).rows).toEqual([{ user_id: PEER }]);
    expect((await db.query("select * from class_assignments where class_id = $1", [ownClass.id])).rows).toHaveLength(1);
    expect((await db.query("select * from teacher_classes where id = $1", [ownClass.id])).rows).toHaveLength(1);
    expect(await residual(ADULT)).toEqual([]);
  });

  it("discovers all teacher-owned class residuals and cascades teacher deletion through learner snapshots", async () => {
    expect(await join(ADULT)).toBe(true);
    await share([await evidence()]);
    expect(await join(MINOR, "13-17")).toBe(true);
    expect(await join(TEACHER, "18+", otherClass)).toBe(true);
    await share([await evidence(TEACHER)], otherClass);
    expect((await residual(TEACHER)).map((row) => row.scope)).toEqual(expect.arrayContaining([...CLASS_TABLES, "reviewer_roles", "auth.users"]));
    await as(null);
    await db.query("delete from auth.users where id = $1", [TEACHER]);
    for (const table of CLASS_TABLES) {
      expect((await db.query(`select * from ${table} where user_id = $1`, [TEACHER])).rows).toEqual([]);
    }
    for (const table of ["class_memberships", "class_assignments", "class_evidence"]) {
      expect((await db.query(`select * from ${table} where class_id = $1`, [ownClass.id])).rows).toEqual([]);
    }
    expect((await db.query("select * from teacher_classes where id = $1", [ownClass.id])).rows).toEqual([]);
    expect((await db.query("select * from teacher_classes where id = $1", [otherClass.id])).rows).toHaveLength(1);
    expect((await db.query("select * from class_assignments where class_id = $1", [otherClass.id])).rows).toHaveLength(1);
    expect((await db.query("select id from auth.users where id = any($1::uuid[]) order by id", [[ADULT, MINOR]])).rows).toEqual([{ id: MINOR }, { id: ADULT }]);
    expect(await residual(TEACHER)).toEqual([]);
    await as(ADULT);
    expect((await db.query("select * from list_my_class_memberships()")).rows).toEqual([]);
  });
});
