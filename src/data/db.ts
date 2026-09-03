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
export const DB_VERSION = 5;

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
  outbox: { key: Id; value: OutboxItem };
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
  dbPromise ??= openDB<ReviseSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      // v4 → v5 adds the AI-marking stores (local-only, never synced): the
      // semantic cache of AI-graded answers and the dead-letter queue for
      // marks that must be re-graded when a provider is reachable again.
      if (oldVersion >= 4) {
        const cache = db.createObjectStore("aiCache", { keyPath: "key" });
        cache.createIndex("byScope", "scope");
        db.createObjectStore("aiDlq", { keyPath: "id" }).createIndex("byNextAttempt", "nextAttemptAt");
        return;
      }
      // v3 → v4 adds time indexes on the two append-only stores so history
      // can be streamed oldest-first with a cursor (progressive hydration)
      // instead of getAll()'d wholesale at boot.
      if (oldVersion >= 3) {
        tx.objectStore("reviewLogs").createIndex("byReviewed", "reviewedAt");
        tx.objectStore("attempts").createIndex("byCreated", "createdAt");
        const cache = db.createObjectStore("aiCache", { keyPath: "key" });
        cache.createIndex("byScope", "scope");
        db.createObjectStore("aiDlq", { keyPath: "id" }).createIndex("byNextAttempt", "nextAttemptAt");
        return;
      }
      // v2 → v3 adds the lessonProgress singleton row (one per user, like
      // settings and streak) so lesson completion syncs across devices.
      if (oldVersion >= 2) {
        db.createObjectStore("lessonProgress", { keyPath: "userId" });
        return;
      }
      // v1 → v2 adds tags. Existing cards predate the field, and code all over
      // the app calls card.tags.something, so they are backfilled here rather
      // than defended against at every call site.
      //
      // Never trust oldVersion alone: a storeless "v1" db (a foreign or corrupt
      // database squatting on this origin) has no cards store, and reading it
      // below would abort the upgrade and brick the app's boot. Fall through to
      // the full build in that case — there is nothing worth preserving.
      if (oldVersion >= 1) {
        if (!tx.objectStoreNames.contains("cards")) {
          // fall through to the full build below
        } else {
          const store = tx.objectStore("cards");
          store.createIndex("byTag", "tags", { multiEntry: true });
          let cursor = await store.openCursor();
          while (cursor) {
            const card = cursor.value as Card;
            if (!Array.isArray(card.tags)) await cursor.update({ ...card, tags: [] });
            cursor = await cursor.continue();
          }
          db.createObjectStore("lessonProgress", { keyPath: "userId" });
          return;
        }
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
      logs.createIndex("byReviewed", "reviewedAt");

      const questions = db.createObjectStore("questions", { keyPath: "id" });
      questions.createIndex("bySubject", "subjectId");

      const attempts = db.createObjectStore("attempts", { keyPath: "id" });
      attempts.createIndex("byUser", "userId");
      attempts.createIndex("byQuestion", "questionId");
      attempts.createIndex("byCreated", "createdAt");

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
      db.createObjectStore("lessonProgress", { keyPath: "userId" });
      db.createObjectStore("outbox", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
      const cache = db.createObjectStore("aiCache", { keyPath: "key" });
      cache.createIndex("byScope", "scope");
      db.createObjectStore("aiDlq", { keyPath: "id" }).createIndex("byNextAttempt", "nextAttemptAt");
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
