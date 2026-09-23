import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, DB_NAME, DB_VERSION, deleteLocalDatabase, getDb, resetDbConnection } from "@/data/db";
import {
  PERSISTED_MIGRATIONS,
  PERSISTED_SCHEMA_VERSION,
  PERSISTED_STORES,
  validatePersistedStores,
} from "@/data/persistence-schema";
import { loadSnapshot, repairSnapshotForRecovery } from "@/data/repository";
import { StorageRecoveryError } from "@/data/storage-recovery";
import { readReviseUserMeta, writeReviseUserMeta } from "@/data/storage-namespace";

const USER = "compatibility-fixture-user";

const validFixture: Partial<Record<(typeof PERSISTED_STORES)[number], unknown[]>> = {
  cards: [
    {
      id: "fixture-card",
      userId: USER,
      subjectId: "biology",
      topicId: "cells",
      front: "What is a cell?",
      back: "The basic unit of life.",
      due: "2026-09-04",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
      stability: 0,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      state: "new",
      tags: [],
    },
  ],
  reviewLogs: [
    {
      id: "fixture-review",
      userId: USER,
      cardId: "fixture-card",
      topicId: "cells",
      grade: "good",
      reviewedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  questions: [
    {
      id: "fixture-question",
      subjectId: "biology",
      topicIds: ["cells"],
      parts: [],
      totalMarks: 1,
      createdAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  attempts: [
    {
      id: "fixture-attempt",
      userId: USER,
      questionId: "fixture-question",
      subjectId: "biology",
      createdAt: "2026-09-04T00:00:00.000Z",
      awarded: 1,
      max: 1,
    },
  ],
  mistakes: [
    {
      id: "fixture-mistake",
      userId: USER,
      subjectId: "biology",
      topicId: "cells",
      createdAt: "2026-09-04T00:00:00.000Z",
      marksLost: 1,
      resolved: false,
    },
  ],
  papers: [
    {
      id: "fixture-paper",
      userId: USER,
      subjectId: "biology",
      title: "Fixture paper",
      createdAt: "2026-09-04T00:00:00.000Z",
      status: "draft",
      questionIds: ["fixture-question"],
      totalMarks: 1,
    },
  ],
  plannedSessions: [
    {
      id: "fixture-session",
      userId: USER,
      date: "2026-09-04",
      subjectId: "biology",
      activity: "flashcards",
      status: "pending",
      minutes: 25,
    },
  ],
  examDates: [
    { id: "fixture-exam", userId: USER, subjectId: "biology", date: "2026-11-01", label: "Biology" },
  ],
  settings: [
    {
      userId: USER,
      displayName: "Fixture",
      subjectIds: ["biology"],
      availability: [],
      targetGrades: {},
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  streak: [{ userId: USER, current: 0, longest: 0, achievements: [] }],
  outbox: [
    { id: "fixture-outbox", entity: "cards", op: "upsert", queuedAt: "2026-09-04T00:00:00.000Z", attempts: 0, ownerId: USER },
  ],
  meta: [{ key: "schemaMigration" }],
};

beforeEach(async () => {
  await clearAll();
});

describe("persisted schema compatibility", () => {
  it("keeps every persisted store represented by a valid fixture", () => {
    expect(PERSISTED_STORES).toHaveLength(15);
    expect(PERSISTED_MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(PERSISTED_SCHEMA_VERSION).toBe(DB_VERSION);
    expect(validatePersistedStores(validFixture)).toEqual([]);
  });

  it("surfaces malformed IndexedDB rows for recovery and repairs only those rows", async () => {
    const db = await getDb();
    await db.put("cards", { id: "broken-card", userId: USER, front: null } as never);

    await expect(loadSnapshot(USER)).rejects.toSatisfy(
      (error: unknown) => error instanceof StorageRecoveryError && error.kind === "corruption",
    );

    const repaired = await repairSnapshotForRecovery();
    expect(repaired.removed).toBe(1);
    expect(repaired.issues.some((issue) => issue.store === "cards" && issue.row === "broken-card")).toBe(true);
    await expect(loadSnapshot(USER)).resolves.toMatchObject({ settings: { userId: USER } });
  });

  it("keeps another account's rows out of the loaded snapshot", async () => {
    const db = await getDb();
    await db.put(
      "cards",
      {
        id: "other-account-card",
        userId: "other-account",
        subjectId: "biology",
        topicId: "cells",
        front: "private",
        back: "private",
        due: "2026-09-04",
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:00:00.000Z",
        stability: 0,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: "new",
        tags: [],
      } as never,
    );
    const snapshot = await loadSnapshot(USER);
    expect(snapshot.cards.some((card) => card.id === "other-account-card")).toBe(false);
  });

  it("scopes onboarding and sync cursors to the account", async () => {
    await writeReviseUserMeta("lastPullAt", "account-a", "2026-09-01T00:00:00.000Z");
    await writeReviseUserMeta("lastPullAt", "account-b", "2026-09-03T00:00:00.000Z");
    await expect(readReviseUserMeta("lastPullAt", "account-a")).resolves.toBe("2026-09-01T00:00:00.000Z");
    await expect(readReviseUserMeta("lastPullAt", "account-b")).resolves.toBe("2026-09-03T00:00:00.000Z");
    await expect(readReviseUserMeta("lastPullAt", "account-c")).resolves.toBeUndefined();
  });

  it("retries a legacy/partially-migrated database and records the completed schema", async () => {
    // The normal test setup intentionally keeps one connection open so it can
    // exercise real repository calls. Close that connection before replacing
    // the database with a version-1 fixture, just as a recovery screen would
    // do before retrying an interrupted upgrade.
    const current = await getDb();
    current.close();
    resetDbConnection();
    await deleteLocalDatabase();
    resetDbConnection();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const cards = db.createObjectStore("cards", { keyPath: "id" });
        cards.put({ id: "legacy-card", userId: USER, subjectId: "biology", topicId: "cells", front: "legacy", back: "row" });
        db.createObjectStore("meta", { keyPath: "key" }).put({ key: "schemaMigration", value: { version: 1, status: "started" } });
        db.createObjectStore("outbox", { keyPath: "id" }).put({
          id: "legacy-queue",
          entity: "cards",
          op: "upsert",
          payload: { userId: USER },
          queuedAt: "2026-09-04T00:00:00.000Z",
          attempts: 0,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error("Could not create legacy fixture"));
    });

    resetDbConnection();
    const db = await getDb();
    expect(db.version).toBe(PERSISTED_SCHEMA_VERSION);
    const migratedCard = await db.get("cards", "legacy-card");
    expect(migratedCard?.tags).toEqual([]);
    expect(await db.get("meta", "schemaMigration")).toMatchObject({ value: { version: PERSISTED_SCHEMA_VERSION, status: "complete" } });
    expect(await db.get("outbox", "legacy-queue")).toMatchObject({ ownerId: USER });
    expect(db.objectStoreNames.contains("cards")).toBe(true);
    db.close();
    resetDbConnection();
  });
});
