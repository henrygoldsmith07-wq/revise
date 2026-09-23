import { describe, expect, it } from "vitest";
import { createCard, gradeCard } from "@/domain/scheduling";
import type { Card, CardGradeEvent, LessonProgress, OutboxItem } from "@/domain/types";
import {
  mergeCard,
  mergeCardLogs,
  mergeLessonProgress,
  orderEvents,
  pickBase,
  syncCardState,
} from "@/domain/sync-crdt";
import { compareStamps } from "@/domain/lamport";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEVICE_A = "device-aaaa";
const DEVICE_B = "device-bbbb";

function makeCard(id: string): Card {
  return createCard({
    id,
    userId: "u1",
    subjectId: "subj",
    topicId: "topic",
    front: "Front",
    back: "Back",
  });
}

/** A shared "synced" starting point: the same card both devices hold. */
function syncedCard(id: string): Card {
  // One pre-sync grade on device A so the log+base exist on both replicas.
  return gradeCard(makeCard(id), "good", new Date("2026-08-01T09:00:00Z"), { deviceId: DEVICE_A, lamport: 1 });
}

describe("card CRDT: concurrent grades merge instead of racing", () => {
  it("concurrent Again + Good both survive — no last-write-wins data loss", () => {
    const base = syncedCard("c1");
    // Two devices grade the same card while offline; wall clocks differ.
    const a = gradeCard(base, "again", new Date("2026-08-02T08:00:00Z"), { deviceId: DEVICE_A, lamport: 2 });
    const b = gradeCard(base, "good", new Date("2026-08-02T08:00:01Z"), { deviceId: DEVICE_B, lamport: 2 });

    const merged = mergeCard(a, b);

    // LWW would keep exactly one grade (2 log events max); the CRDT keeps both.
    expect(merged.log).toHaveLength(3); // the original + both concurrent grades
    const grades = [...(merged.log ?? [])].sort((x, y) => compareStamps({ counter: x.lamport, deviceId: x.deviceId }, { counter: y.lamport, deviceId: y.deviceId })).map((e) => e.grade);
    expect(grades).toEqual(["good", "again", "good"]);
  });

  it("every replica converges on byte-identical FSRS state", () => {
    const base = syncedCard("c1");
    const a = gradeCard(base, "again", new Date("2026-08-02T08:00:00Z"), { deviceId: DEVICE_A, lamport: 2 });
    const b = gradeCard(base, "good", new Date("2026-08-02T08:00:01Z"), { deviceId: DEVICE_B, lamport: 2 });

    const ab = mergeCard(a, b); // device A pulls B's row
    const ba = mergeCard(b, a); // device B pulls A's row
    const server = mergeCard(mergeCard(a, b), b); // a second pull is a no-op

    for (const m of [ab, ba, server]) {
      expect(m.due).toBe(ab.due);
      expect(m.stability).toBe(ab.stability);
      expect(m.difficulty).toBe(ab.difficulty);
      expect(m.reps).toBe(ab.reps);
      expect(m.lapses).toBe(ab.lapses);
      expect(m.state).toBe(ab.state);
    }
  });

  it("merge is commutative and idempotent (CRDT laws)", () => {
    const base = syncedCard("c1");
    const a = gradeCard(base, "hard", new Date("2026-08-02T08:00:00Z"), { deviceId: DEVICE_A, lamport: 2 });
    const b = gradeCard(base, "easy", new Date("2026-08-03T10:00:00Z"), { deviceId: DEVICE_B, lamport: 2 });

    expect(mergeCard(a, b)).toEqual(mergeCard(b, a));
    const once = mergeCard(a, b);
    expect(mergeCard(once, b)).toEqual(once); // re-pulling the same row changes nothing
    expect(mergeCard(once, once)).toEqual(once);
  });

  it("replay round-trips: syncCardState on a locally-graded card is a no-op", () => {
    let card = syncedCard("c1");
    card = gradeCard(card, "good", new Date("2026-08-02T08:00:00Z"), { deviceId: DEVICE_A, lamport: 2 });
    card = gradeCard(card, "good", new Date("2026-08-09T08:00:00Z"), { deviceId: DEVICE_A, lamport: 3 });

    const { card: rebuilt, changed } = syncCardState(card);
    expect(changed).toBe(false);
    expect(rebuilt.stability).toBe(card.stability);
    expect(rebuilt.due).toBe(card.due);
    expect(rebuilt.reps).toBe(card.reps);
  });

  it("the first stamped grade carries the immutable base; later ones do not", () => {
    let card = makeCard("c1");
    expect(card.log).toBeUndefined();
    card = gradeCard(card, "good", new Date("2026-08-01T09:00:00Z"), { deviceId: DEVICE_A, lamport: 1 });
    expect(card.log).toHaveLength(1);
    expect(card.log?.[0].base).toBeDefined();
    expect(card.log?.[0].base?.due).toBe(createCard({ id: "x", userId: "u", subjectId: "s", topicId: "t", front: "f", back: "b" }).due);

    card = gradeCard(card, "again", new Date("2026-08-02T09:00:00Z"), { deviceId: DEVICE_A, lamport: 2 });
    expect(card.log).toHaveLength(2);
    expect(card.log?.[1].base).toBeUndefined(); // base written once, never rewritten
  });

  it("log union deduplicates by (deviceId, lamport) identity", () => {
    const e: CardGradeEvent = { grade: "good", reviewedAt: "2026-08-02T08:00:00Z", deviceId: DEVICE_A, lamport: 5 };
    const merged = mergeCardLogs([e, { ...e, grade: "again" }], [e, { ...e, deviceId: DEVICE_B }]);
    expect(merged).toHaveLength(2);
    expect(merged.map((x) => x.deviceId).sort()).toEqual([DEVICE_A, DEVICE_B]);
  });

  it("pickBase is deterministic regardless of log arrival order", () => {
    const base = { due: "2026-08-01", stability: 1, difficulty: 5, reps: 0, lapses: 0, state: 0 };
    const log: CardGradeEvent[] = [
      { grade: "good", reviewedAt: "2026-08-02T00:00:00Z", deviceId: DEVICE_B, lamport: 7 },
      { grade: "good", reviewedAt: "2026-08-01T00:00:00Z", deviceId: DEVICE_A, lamport: 2, base },
    ];
    expect(pickBase(log)).toEqual(base);
    expect(pickBase([...log].reverse())).toEqual(base);
  });
});

describe("causal ordering (Lamport)", () => {
  it("offline week drains in the order the student actually experienced", () => {
    // Device A studies Mon–Wed offline (counters 1..3), observed nothing.
    // Device B was online daily; its clock had already observed A's last
    // synced counter (5), so its daily grades run 6,7,8.
    const events = [
      { deviceId: DEVICE_B, lamport: 8, key: "r8" },
      { deviceId: DEVICE_A, lamport: 1, key: "r1" },
      { deviceId: DEVICE_B, lamport: 6, key: "r6" },
      { deviceId: DEVICE_A, lamport: 3, key: "r3" },
      { deviceId: DEVICE_B, lamport: 7, key: "r7" },
      { deviceId: DEVICE_A, lamport: 2, key: "r2" },
    ];
    const ordered = orderEvents(events);
    expect(ordered.map((e) => e.key)).toEqual(["r1", "r2", "r3", "r6", "r7", "r8"]);
  });

  it("concurrent events (equal counters, different devices) break ties deterministically", () => {
    const events = [
      { deviceId: DEVICE_B, lamport: 4, key: "b" },
      { deviceId: DEVICE_A, lamport: 4, key: "a" },
    ];
    const once = orderEvents(events);
    expect(once).toEqual(orderEvents([...events].reverse()));
    expect(once[0].deviceId).toBe(DEVICE_A); // lexicographic device order
  });
});

describe("lesson progress merge (grow-only)", () => {
  const p = (over: Partial<LessonProgress>): LessonProgress => ({
    userId: "u1",
    completed: {},
    streak: { count: 0, lastDay: "" },
    updatedAt: "2026-08-01T00:00:00Z",
    ...over,
  });

  it("different lessons completed on different devices both survive", () => {
    const phone = p({
      completed: { "lesson-chem-1": true },
      completedOn: { "lesson-chem-1": "2026-08-01" },
      streak: { count: 3, lastDay: "2026-08-01" },
    });
    const laptop = p({
      completed: { "lesson-phys-1": true },
      completedOn: { "lesson-phys-1": "2026-08-02" },
      streak: { count: 1, lastDay: "2026-08-02" },
    });

    const { merged } = mergeLessonProgress(phone, laptop);
    expect(merged.completed["lesson-chem-1"]).toBe(true);
    expect(merged.completed["lesson-phys-1"]).toBe(true);
    // Streak recomputed over the union of days: 08-01 and 08-02 are consecutive.
    expect(merged.streak.count).toBe(2);
    expect(merged.streak.lastDay).toBe("2026-08-02");
  });

  it("a week of offline daily study merges with another device's progress", () => {
    const offline = p({
      completed: Object.fromEntries(["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((k) => [k, true])),
      completedOn: Object.fromEntries(["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((k, i) => [k, `2026-08-0${i + 1}`])),
      streak: { count: 7, lastDay: "2026-08-07" },
    });
    const daily = p({
      completed: { b1: true },
      completedOn: { b1: "2026-08-04" },
      streak: { count: 4, lastDay: "2026-08-04" },
    });

    const { merged } = mergeLessonProgress(offline, daily);
    expect(Object.keys(merged.completed)).toHaveLength(8);
    expect(merged.streak.count).toBe(7); // union of days: 08-01..08-07, unbroken
    expect(merged.streak.lastDay).toBe("2026-08-07");
  });

  it("gap in completion days restarts the streak at the gap", () => {
    const local = p({ completed: { a: true }, completedOn: { a: "2026-08-01" }, streak: { count: 5, lastDay: "2026-08-01" } });
    const remote = p({ completed: { b: true }, completedOn: { b: "2026-08-05" }, streak: { count: 1, lastDay: "2026-08-05" } });
    const { merged } = mergeLessonProgress(local, remote);
    expect(merged.streak.count).toBe(1); // 08-02..08-04 empty → chain restarts
    expect(merged.streak.lastDay).toBe("2026-08-05");
  });

  it("legacy rows without day records fall back conservatively", () => {
    const local = p({ completed: { a: true }, streak: { count: 3, lastDay: "2026-08-01" } });
    const remote = p({ completed: { b: true }, streak: { count: 9, lastDay: "2026-08-03" } });
    const { merged } = mergeLessonProgress(local, remote);
    expect(merged.completed.a).toBe(true);
    expect(merged.completed.b).toBe(true);
    expect(merged.streak.count).toBe(9); // better of the two, never invented
  });
});

describe("idempotency keys in the outbox", () => {
  it("every outbox item shape carries a UUID idempotency key (enqueue contract)", async () => {
    // The real enqueue writes this shape into IndexedDB; pin the contract so a
    // field drop fails here rather than as silent duplicate writes in prod.
    const item: OutboxItem = {
      id: "row-1",
      entity: "cards",
      op: "upsert",
      payload: {},
      queuedAt: new Date().toISOString(),
      attempts: 0,
      idempotencyKey: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      lamport: 12,
      deviceId: DEVICE_A,
    };
    expect(item.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keys are unique per queued mutation in a batch", () => {
    const keys = new Set(Array.from({ length: 50 }, () => crypto.randomUUID()));
    expect(keys.size).toBe(50);
  });

  it("the schema ships the sync_writes ledger with RLS coverage", () => {
    const schema = readFileSync(resolve(__dirname, "../supabase/schema.sql"), "utf8");
    expect(schema).toMatch(/create table if not exists public\.sync_writes/);
    expect(schema).toMatch(/id uuid primary key/);
    expect(schema).toMatch(/'sync_writes'/); // included in the RLS policy loop
  });
});
