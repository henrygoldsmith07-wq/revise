import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  Mistake,
  OutboxItem,
  Paper,
  PlannedSession,
  Question,
  ReviewLog,
  StreakState,
  UserSettings,
} from "@/domain/types";

// ---------------------------------------------------------------------------
// IndexedDB is the *primary* store, not a cache. Every write lands here first
// and is immediately durable; Supabase is a replica the outbox drains into
// when a network exists. That ordering is what makes the app work on a train,
// in a school with blocked wifi, or with no account at all.
// ---------------------------------------------------------------------------

export const DB_NAME = "revise";
export const DB_VERSION = 2;

interface ReviseSchema extends DBSchema {
  cards: { key: Id; value: Card; indexes: { byUser: Id; byTopic: Id; byDue: string; byTag: string } };
  reviewLogs: { key: Id; value: ReviewLog; indexes: { byUser: Id; byCard: Id } };
  questions: { key: Id; value: Question; indexes: { bySubject: Id } };
  attempts: { key: Id; value: Attempt; indexes: { byUser: Id; byQuestion: Id } };
  mistakes: { key: Id; value: Mistake; indexes: { byUser: Id; byTopic: Id } };
  papers: { key: Id; value: Paper; indexes: { byUser: Id; bySubject: Id } };
  plannedSessions: { key: Id; value: PlannedSession; indexes: { byUser: Id; byDate: string } };
  examDates: { key: Id; value: ExamDate; indexes: { byUser: Id } };
  settings: { key: Id; value: UserSettings };
  streak: { key: Id; value: StreakState };
  outbox: { key: Id; value: OutboxItem };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type ReviseDB = IDBPDatabase<ReviseSchema>;

let dbPromise: Promise<ReviseDB> | null = null;

export function getDb(): Promise<ReviseDB> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable — this must run in the browser."));
  }
  dbPromise ??= openDB<ReviseSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      // v1 → v2 adds tags. Existing cards predate the field, and code all over
      // the app calls card.tags.something, so they are backfilled here rather
      // than defended against at every call site.
      if (oldVersion >= 1) {
        const store = tx.objectStore("cards");
        store.createIndex("byTag", "tags", { multiEntry: true });
        let cursor = await store.openCursor();
        while (cursor) {
          const card = cursor.value as Card;
          if (!Array.isArray(card.tags)) await cursor.update({ ...card, tags: [] });
          cursor = await cursor.continue();
        }
        return;
      }

      const cards = db.createObjectStore("cards", { keyPath: "id" });
      cards.createIndex("byUser", "userId");
      cards.createIndex("byTopic", "topicId");
      cards.createIndex("byDue", "due");
      // Multi-entry: one index record per tag, so tag filters stay fast as a
      // deck grows past a few thousand cards.
      cards.createIndex("byTag", "tags", { multiEntry: true });

      const logs = db.createObjectStore("reviewLogs", { keyPath: "id" });
      logs.createIndex("byUser", "userId");
      logs.createIndex("byCard", "cardId");

      const questions = db.createObjectStore("questions", { keyPath: "id" });
      questions.createIndex("bySubject", "subjectId");

      const attempts = db.createObjectStore("attempts", { keyPath: "id" });
      attempts.createIndex("byUser", "userId");
      attempts.createIndex("byQuestion", "questionId");

      const mistakes = db.createObjectStore("mistakes", { keyPath: "id" });
      mistakes.createIndex("byUser", "userId");
      mistakes.createIndex("byTopic", "topicId");

      const papers = db.createObjectStore("papers", { keyPath: "id" });
      papers.createIndex("byUser", "userId");
      papers.createIndex("bySubject", "subjectId");

      const plan = db.createObjectStore("plannedSessions", { keyPath: "id" });
      plan.createIndex("byUser", "userId");
      plan.createIndex("byDate", "date");

      const exams = db.createObjectStore("examDates", { keyPath: "id" });
      exams.createIndex("byUser", "userId");

      db.createObjectStore("settings", { keyPath: "userId" });
      db.createObjectStore("streak", { keyPath: "userId" });
      db.createObjectStore("outbox", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
    },
  });
  return dbPromise;
}

/** Stores holding user-owned records, in the order sync should replay them. */
export const COLLECTION_STORES = [
  "questions",
  "cards",
  "reviewLogs",
  "attempts",
  "mistakes",
  "papers",
  "plannedSessions",
  "examDates",
] as const;

export type CollectionStore = (typeof COLLECTION_STORES)[number];

export async function getAll<T>(store: CollectionStore): Promise<T[]> {
  const db = await getDb();
  return (await db.getAll(store)) as T[];
}

export async function putAll<T extends { id: Id }>(store: CollectionStore, rows: T[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  await Promise.all(rows.map((row) => tx.store.put(row as never)));
  await tx.done;
}

export async function putOne<T extends { id: Id }>(store: CollectionStore, row: T): Promise<void> {
  const db = await getDb();
  await db.put(store, row as never);
}

export async function removeOne(store: CollectionStore, id: Id): Promise<void> {
  const db = await getDb();
  await db.delete(store, id);
}

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const row = await db.get("meta", key);
  return row?.value as T | undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("meta", { key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await getDb();
  await db.delete("meta", key);
}

/** Wipe every store. Used by "sign out and forget this device". */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  const stores = [...COLLECTION_STORES, "settings", "streak", "outbox", "meta"] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
