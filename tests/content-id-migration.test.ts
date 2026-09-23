import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { CONTENT_ID_MIGRATION_VERSION, LEGACY_CONTENT_PREFIXES, migrateContentIds, remapContentIdString, remapContentIds } from "@/data/content-ids";
import { clearAll, getDb } from "@/data/db";
import { loadSnapshot } from "@/data/repository";
import type { Attempt, Card, Mistake, Question, ReviewLog } from "@/domain/types";

// The cnt: content-id namespace exists because operator tooling once purged
// "seed-*" rows and took the whole question bank with it — bank ids and
// fixture ids were indistinguishable. These specs pin the three things that
// make the namespace safe: producers mint cnt: ids, a one-time migration
// rewrites every persisted legacy id (including references and keys), and
// student prose is never rewritten.

const USER = "test-user";

beforeEach(async () => {
  await clearAll();
});

describe("remapContentIdString", () => {
  it("rewrites each legacy prefix to its namespaced form", () => {
    expect(remapContentIdString("seed-q:photosynthesis-mcq")).toBe("cnt:question:photosynthesis-mcq");
    expect(remapContentIdString("seed-misconception:limiting-factors")).toBe("cnt:misconception:limiting-factors");
    expect(remapContentIdString("seed:wjec-alevel-biology.cells:recall:0")).toBe("cnt:card:wjec-alevel-biology.cells:recall:0");
  });

  it("uses longest-prefix matching, so seed-q: is never mangled by seed:", () => {
    // The `seed:` alternative must not win over `seed-q:`.
    expect(remapContentIdString("seed-q:x:1")).toBe("cnt:question:x:1");
    expect(remapContentIdString("prefix seed-q:a and seed:b and seed-misconception:c")).toBe(
      "prefix cnt:question:a and cnt:card:b and cnt:misconception:c",
    );
  });

  it("leaves already-namespaced ids, plain prose, and non-id text untouched", () => {
    expect(remapContentIdString("cnt:question:photosynthesis-mcq")).toBe("cnt:question:photosynthesis-mcq");
    expect(remapContentIdString("Seed dispersal by wind and water")).toBe("Seed dispersal by wind and water");
    expect(remapContentIdString("no ids here")).toBe("no ids here");
    // Operator-owned naming without the colon separator is not an id.
    expect(remapContentIdString("seed-q-fixture-not-an-id")).toBe("seed-q-fixture-not-an-id");
  });

  it("is idempotent — remapping twice equals remapping once", () => {
    const once = remapContentIdString("seed-q:dev-1mark:a and seed:topic:kind:0");
    expect(remapContentIdString(once)).toBe(once);
  });
});

describe("remapContentIds", () => {
  it("rewrites ids in string values, object keys, and nested payloads", () => {
    const attempt = {
      id: "att-1",
      questionId: "seed-q:dev-1mark",
      answers: { "seed-q:dev-1mark:a": "6.626e-34 J s" },
      marked: [{ partId: "seed-q:dev-1mark:a", awarded: 1, max: 1, creditedPoints: [] }],
      // Student prose mentioning seeds must survive verbatim.
      answersProseCheck: "The seed dispersal mechanism requires wind",
    } as unknown as Attempt;

    const { value, changes } = remapContentIds(attempt) as { value: Attempt; changes: number };
    expect(value.questionId).toBe("cnt:question:dev-1mark");
    expect(Object.keys(value.answers)[0]).toBe("cnt:question:dev-1mark:a");
    expect(value.marked[0].partId).toBe("cnt:question:dev-1mark:a");
    expect((value as unknown as { answersProseCheck: string }).answersProseCheck).toBe(
      "The seed dispersal mechanism requires wind",
    );
    expect(changes).toBeGreaterThanOrEqual(3);
  });

  it("treats the answers map as keys-only: prose values stay, part-id keys remap", () => {
    const answers = { "seed-q:dev-1mark:a": "seeds germinate in spring" };
    const { value } = remapContentIds({ answers }) as { value: { answers: Record<string, string> } };
    expect(Object.keys(value.answers)[0]).toBe("cnt:question:dev-1mark:a");
    expect(Object.values(value.answers)[0]).toBe("seeds germinate in spring");
  });

  it("returns zero changes and the same content for already-namespaced rows", () => {
    const row = { id: "cnt:question:x", questionId: "cnt:question:x", parts: [{ partId: "cnt:question:x:a" }] };
    const { value, changes } = remapContentIds(row);
    expect(changes).toBe(0);
    expect(value).toEqual(row);
  });
});

describe("migrateContentIds (end-to-end on IndexedDB)", () => {
  it("remaps every legacy row and reference across the stores that hold them", async () => {
    const db = await getDb();
    // A pre-namespace device: bank rows and user history under legacy ids.
    const legacyQuestion = { id: "seed-q:legacy-1", subjectId: "wjec-alevel-biology", topicIds: ["wjec-alevel-biology.cells"], parts: [], totalMarks: 3 } as unknown as Question;
    const legacyCard = { id: "seed:wjec-alevel-biology.cells:recall:0", userId: USER, topicId: "wjec-alevel-biology.cells", due: "2026-01-01", stability: 1, difficulty: 5, reps: 0, lapses: 0, state: 0, lastReviewedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as unknown as Card;
    const legacyLog = { id: "log-1", userId: USER, cardId: "seed:wjec-alevel-biology.cells:recall:0", topicId: "wjec-alevel-biology.cells", grade: "good", elapsedMs: 4000, reviewedAt: "2026-01-01" } as unknown as ReviewLog;
    const legacyAttempt = { id: "att-1", userId: USER, questionId: "seed-q:legacy-1", subjectId: "wjec-alevel-biology", topicIds: ["wjec-alevel-biology.cells"], answers: { "seed-q:legacy-1:a": "answer" }, marked: [{ partId: "seed-q:legacy-1:a", awarded: 1, max: 3, creditedPoints: [], missedPoints: [], comment: "" }], createdAt: "2026-01-01", mode: "practice" } as unknown as Attempt;
    const legacyMistake = { id: "mis-1", userId: USER, topicId: "wjec-alevel-biology.cells", questionId: "seed-q:legacy-1", attemptId: "att-1", marksLost: 2, description: "seed coat confusion", category: "recall", resolved: false, createdAt: "2026-01-01" } as unknown as Mistake;
    const legacyOutbox = { id: "ob-1", entity: "attempts" as const, op: "upsert" as const, payload: { id: "att-1", questionId: "seed-q:legacy-1" }, queuedAt: "2026-01-01", attempts: 0, idempotencyKey: "idem-1" };
    const legacyCache = { key: "seed-q:legacy-1:a:deadbeef", scope: "seed-q:legacy-1:a", embedding: null, marked: { partId: "seed-q:legacy-1:a", awarded: 1, max: 1, creditedPoints: [], missedPoints: [], comment: "" }, confidence: 0.9, markedBy: "ai" as const, createdAt: "2026-01-01" };

    await db.put("questions", legacyQuestion);
    await db.put("cards", legacyCard);
    await db.put("reviewLogs", legacyLog);
    await db.put("attempts", legacyAttempt);
    await db.put("mistakes", legacyMistake);
    await db.put("outbox", legacyOutbox);
    await db.put("aiCache", legacyCache);

    const report = await migrateContentIds();
    expect(report.migrated).toBe(true);
    expect(report.rowsRewritten).toBeGreaterThanOrEqual(7);
    expect(report.idsRemapped).toBeGreaterThanOrEqual(10);

    // Primary keys rewritten, legacy keys gone.
    expect(await db.get("questions", "cnt:question:legacy-1")).toBeTruthy();
    expect(await db.get("questions", "seed-q:legacy-1")).toBeUndefined();
    expect(await db.get("cards", "cnt:card:wjec-alevel-biology.cells:recall:0")).toBeTruthy();
    expect(await db.get("cards", "seed:wjec-alevel-biology.cells:recall:0")).toBeUndefined();

    // References rewritten everywhere they pointed at content.
    expect((await db.get("reviewLogs", "log-1"))?.cardId).toBe("cnt:card:wjec-alevel-biology.cells:recall:0");
    const attempt = (await db.get("attempts", "att-1")) as Attempt;
    expect(attempt.questionId).toBe("cnt:question:legacy-1");
    expect(Object.keys(attempt.answers)[0]).toBe("cnt:question:legacy-1:a");
    const mistake = (await db.get("mistakes", "mis-1")) as Mistake;
    expect(mistake.questionId).toBe("cnt:question:legacy-1");
    // Student prose inside the mistake survives.
    expect(mistake.description).toBe("seed coat confusion");
    const outbox = (await db.get("outbox", "ob-1")) as { payload: { questionId: string } };
    expect(outbox.payload.questionId).toBe("cnt:question:legacy-1");
    const cache = (await db.get("aiCache", "cnt:question:legacy-1:a:deadbeef")) as { scope: string; marked: { partId: string } };
    expect(cache.scope).toBe("cnt:question:legacy-1:a");
    expect(cache.marked.partId).toBe("cnt:question:legacy-1:a");
    expect(await db.get("aiCache", "seed-q:legacy-1:a:deadbeef")).toBeUndefined();
  });

  it("is idempotent: a second run reports no migration and rewrites nothing", async () => {
    const first = await migrateContentIds();
    expect(first.migrated).toBe(true);
    const second = await migrateContentIds();
    expect(second).toEqual({ migrated: false, rowsRewritten: 0, idsRemapped: 0 });
  });

  it("runs inside loadSnapshot before seeding, so a fresh snapshot has no legacy ids", async () => {
    const snapshot = await loadSnapshot(USER);
    const legacyIds = [
      ...snapshot.questions.map((q) => q.id),
      ...snapshot.cards.map((c) => c.id),
    ].filter((id) => LEGACY_CONTENT_PREFIXES.some((p) => id.startsWith(p)));
    expect(legacyIds).toEqual([]);
    expect(snapshot.questions[0].id.startsWith("cnt:question:")).toBe(true);
    expect(snapshot.cards[0].id.startsWith("cnt:card:")).toBe(true);
  });
});

describe("producers mint namespaced ids", () => {
  it("the migration version and legacy prefix table stay in sync", () => {
    expect(CONTENT_ID_MIGRATION_VERSION).toBeGreaterThanOrEqual(1);
    expect(LEGACY_CONTENT_PREFIXES).toEqual(["seed-q:", "seed-misconception:", "seed:"]);
  });
});
