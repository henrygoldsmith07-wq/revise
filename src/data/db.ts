import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  LessonProgress,
  Mistake,
  OutboxItem,
  Paper,
  PlannedSession,
  Question,
  ReviewLog,
  StreakState,
  UserSettings,
} from "@/domain/types";
import { PERSISTED_SCHEMA_VERSION } from "./persistence-schema";
import { captureTelemetry, errorClass } from "@/lib/observability";

// ---------------------------------------------------------------------------
// IndexedDB is the *primary* store, not a cache. Every write lands here first
// and is immediately durable; Supabase is a replica the outbox drains into
// when a network exists. That ordering is what makes the app work on a train,
// in a school with blocked wifi, or with no account at all.
//
// Two local-only stores (never synced) support the AI-marking resilience
// layer: `aiCache` (semantic cache of previously AI-graded answers) and
// `aiDlq` (dead-letter queue of marks awaiting an AI re-grade). They are
// device-local by design: a cached grade is only valid for the same student,
// and the DLQ replays against the *local* attempt records.
// ---------------------------------------------------------------------------

export const DB_NAME = "revise";
export const DB_VERSION = PERSISTED_SCHEMA_VERSION;

/** A cached AI mark: the graded result plus the embedding used to find it. */
export interface AiCacheEntry {
  /** questionId:partId:answerHash — exact-match tier. */
  key: string;
  /** questionId:partId prefix lets one query fetch a whole question's entries. */
  scope: string;
  /** L2-normalised embedding of "answer \u0000 mark-scheme points". Null on legacy pre-embedding entries. */
  embedding: number[] | null;
  /** The AI grade being cached. */
  marked: Attempt["marked"][number];
  /** Overall provider confidence for the mark that produced this entry. */
  confidence: number;
  markedBy: "ai";
  /** When the entry was written — used for LRU eviction and staleness. */
  createdAt: string;
}

/** A mark that never reached AI grading, queued for retry with backoff. */
export interface AiDlqItem {
  id: string;
  attemptId: string;
  question: Question;
  answers: Record<string, string>;
  /** Why the AI grade did not happen. */
  reason: string;
  queuedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
}

interface ReviseSchema extends DBSchema {
  cards: { key: Id; value: Card; indexes: { byUser: Id; byTopic: Id; byDue: string; byTag: string } };
  reviewLogs: { key: Id; value: ReviewLog; indexes: { byUser: Id; byCard: Id; byReviewed: string } };
  questions: { key: Id; value: Question; indexes: { bySubject: Id } };
  attempts: { key: Id; value: Attempt; indexes: { byUser: Id; byQuestion: Id; byCreated: string } };
  mistakes: { key: Id; value: Mistake; indexes: { byUser: Id; byTopic: Id } };
  papers: { key: Id; value: Paper; indexes: { byUser: Id; bySubject: Id } };
  plannedSessions: { key: Id; value: PlannedSession; indexes: { byUser: Id; byDate: string } };
  examDates: { key: Id; value: ExamDate; indexes: { byUser: Id } };
  settings: { key: Id; value: UserSettings };
  streak: { key: Id; value: StreakState };
  lessonProgress: { key: Id; value: LessonProgress };
  outbox: { key: Id; value: OutboxItem; indexes: { byOwner: Id; byQueuedAt: string } };
  meta: { key: string; value: { key: string; value: unknown } };
  aiCache: { key: string; value: AiCacheEntry; indexes: { byScope: string } };
  aiDlq: { key: string; value: AiDlqItem; indexes: { byNextAttempt: string } };
}

export type ReviseDB = IDBPDatabase<ReviseSchema>;

let dbPromise: Promise<ReviseDB> | null = null;

export function getDb(): Promise<ReviseDB> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable — this must run in the browser."));
  }
  if (dbPromise) return dbPromise;
  const opening = openDB<ReviseSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      // Migrations are strictly monotonic and idempotent. A single upgrade
      // transaction can jump from any historical version to the current one;
      // interrupted upgrades roll back and safely retry on the next open.
      if (!db.objectStoreNames.contains("cards")) {
        const cards = db.createObjectStore("cards", { keyPath: "id" });
        cards.createIndex("byUser", "userId");
        cards.createIndex("byTopic", "topicId");
        cards.createIndex("byDue", "due");
        cards.createIndex("byTag", "tags", { multiEntry: true });
      }
      if (!db.objectStoreNames.contains("reviewLogs")) {
        const logs = db.createObjectStore("reviewLogs", { keyPath: "id" });
        logs.createIndex("byUser", "userId");
        logs.createIndex("byCard", "cardId");
        logs.createIndex("byReviewed", "reviewedAt");
      }
      if (!db.objectStoreNames.contains("questions")) {
        const questions = db.createObjectStore("questions", { keyPath: "id" });
        questions.createIndex("bySubject", "subjectId");
      }
      if (!db.objectStoreNames.contains("attempts")) {
        const attempts = db.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("byUser", "userId");
        attempts.createIndex("byQuestion", "questionId");
        attempts.createIndex("byCreated", "createdAt");
      }
      if (!db.objectStoreNames.contains("mistakes")) {
        const mistakes = db.createObjectStore("mistakes", { keyPath: "id" });
        mistakes.createIndex("byUser", "userId");
        mistakes.createIndex("byTopic", "topicId");
      }
      if (!db.objectStoreNames.contains("papers")) {
        const papers = db.createObjectStore("papers", { keyPath: "id" });
        papers.createIndex("byUser", "userId");
        papers.createIndex("bySubject", "subjectId");
      }
      if (!db.objectStoreNames.contains("plannedSessions")) {
        const plan = db.createObjectStore("plannedSessions", { keyPath: "id" });
        plan.createIndex("byUser", "userId");
        plan.createIndex("byDate", "date");
      }
      if (!db.objectStoreNames.contains("examDates")) {
        const exams = db.createObjectStore("examDates", { keyPath: "id" });
        exams.createIndex("byUser", "userId");
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("streak")) db.createObjectStore("streak", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("lessonProgress")) db.createObjectStore("lessonProgress", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("aiCache")) db.createObjectStore("aiCache", { keyPath: "key" });
      if (!db.objectStoreNames.contains("aiDlq")) db.createObjectStore("aiDlq", { keyPath: "id" });

      const cards = tx.objectStore("cards");
      if (!cards.indexNames.contains("byUser")) cards.createIndex("byUser", "userId");
      if (!cards.indexNames.contains("byTopic")) cards.createIndex("byTopic", "topicId");
      if (!cards.indexNames.contains("byDue")) cards.createIndex("byDue", "due");
      if (!cards.indexNames.contains("byTag")) cards.createIndex("byTag", "tags", { multiEntry: true });
      if (oldVersion < 2) {
        let cursor = await cards.openCursor();
        while (cursor) {
          const card = cursor.value as Card;
          if (!Array.isArray(card.tags)) await cursor.update({ ...card, tags: [] });
          cursor = await cursor.continue();
        }
      }
      const logs = tx.objectStore("reviewLogs");
      if (!logs.indexNames.contains("byUser")) logs.createIndex("byUser", "userId");
      if (!logs.indexNames.contains("byCard")) logs.createIndex("byCard", "cardId");
      if (!logs.indexNames.contains("byReviewed")) logs.createIndex("byReviewed", "reviewedAt");
      const attempts = tx.objectStore("attempts");
      if (!attempts.indexNames.contains("byUser")) attempts.createIndex("byUser", "userId");
      if (!attempts.indexNames.contains("byQuestion")) attempts.createIndex("byQuestion", "questionId");
      if (!attempts.indexNames.contains("byCreated")) attempts.createIndex("byCreated", "createdAt");
      const cache = tx.objectStore("aiCache");
      if (!cache.indexNames.contains("byScope")) cache.createIndex("byScope", "scope");
      const dlq = tx.objectStore("aiDlq");
      if (!dlq.indexNames.contains("byNextAttempt")) dlq.createIndex("byNextAttempt", "nextAttemptAt");
      const outbox = tx.objectStore("outbox");
      if (!outbox.indexNames.contains("byOwner")) outbox.createIndex("byOwner", "ownerId");
      if (!outbox.indexNames.contains("byQueuedAt")) outbox.createIndex("byQueuedAt", "queuedAt");
      let outboxCursor = await outbox.openCursor();
      while (outboxCursor) {
        const item = outboxCursor.value as OutboxItem;
        const payload = item.payload as { userId?: unknown } | null;
        if (!item.ownerId && typeof payload?.userId === "string" && payload.userId.trim()) {
          await outboxCursor.update({ ...item, ownerId: payload.userId });
        }
        outboxCursor = await outboxCursor.continue();
      }
      tx.objectStore("meta").put({
        key: "schemaMigration",
        value: { version: PERSISTED_SCHEMA_VERSION, status: "complete", completedAt: new Date().toISOString() },
      });
    },
  });
  dbPromise = opening.catch((error) => {
    dbPromise = null;
    captureTelemetry("migration.failure", { status: "failed", schemaVersion: DB_VERSION, errorClass: errorClass(error) });
    throw error;
  });
  return dbPromise;
}

/** Let recovery flows retry after a closed or failed connection. */
export function resetDbConnection(): void {
  dbPromise = null;
}

/** Delete local data only after an explicit recovery/reset choice. */
export async function deleteLocalDatabase(): Promise<void> {
  const current = dbPromise ? await dbPromise.catch(() => undefined) : undefined;
  current?.close();
  dbPromise = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete local database."));
    request.onblocked = () => reject(new Error("Close other Revise tabs before resetting local data."));
  });
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

/**
 * Stream a store's rows oldest-first in chunks via a cursor on its time
 * index. Boot reads only the first chunk; the rest arrives in the background
 * (progressive hydration), so a 5,000-attempt history never blocks first paint.
 *
 * The primary key is a random UUID — meaningless chronologically — so the
 * cursor runs on the time index to get true oldest-first order. Async
 * iteration keeps the event loop breathing between chunks, unlike one giant
 * getAll() that hands the UI a single enormous allocation to parse.
 */
export async function* streamReviewLogs(chunkSize = 500): AsyncGenerator<ReviewLog[]> {
  const db = await getDb();
  let cursor = await db.transaction("reviewLogs").objectStore("reviewLogs").index("byReviewed").openCursor();
  let chunk: ReviewLog[] = [];
  while (cursor) {
    chunk.push(cursor.value);
    if (chunk.length >= chunkSize) {
      yield chunk;
      chunk = [];
    }
    cursor = await cursor.continue();
  }
  if (chunk.length) yield chunk;
}

/** Same as streamReviewLogs, for the attempts log. */
export async function* streamAttempts(chunkSize = 500): AsyncGenerator<Attempt[]> {
  const db = await getDb();
  let cursor = await db.transaction("attempts").objectStore("attempts").index("byCreated").openCursor();
  let chunk: Attempt[] = [];
  while (cursor) {
    chunk.push(cursor.value);
    if (chunk.length >= chunkSize) {
      yield chunk;
      chunk = [];
    }
    cursor = await cursor.continue();
  }
  if (chunk.length) yield chunk;
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
  const stores = [
    ...COLLECTION_STORES,
    "settings",
    "streak",
    "lessonProgress",
    "outbox",
    "meta",
    "aiCache",
    "aiDlq",
  ] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
