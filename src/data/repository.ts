import { seedCards, seedQuestions } from "@/content";
import { allTopics, allSubjects } from "@/domain/curriculum";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  LessonProgress,
  Mistake,
  Paper,
  PlannedSession,
  Question,
  ReviewLog,
  StreakState,
  UserSettings,
} from "@/domain/types";
import {
  isRevisionCheckpoint,
  type RevisionCheckpoint,
} from "@/domain/revision-checkpoint";
import { validatePersistedStores, type PersistenceIssue } from "./persistence-schema";
import { StorageRecoveryError } from "./storage-recovery";
import { isRevisionTwinState, type RevisionTwinState } from "@/domain/revision-twin";
import { COLLECTION_STORES, getAll, getDb, putAll, putOne, removeOne, streamAttempts, streamReviewLogs } from "./db";
import type { CollectionStore } from "./db";
import { enqueue } from "./sync";
import { readReviseMeta, readReviseUserMeta, REVISE_META_KEYS, writeReviseMeta, writeReviseUserMeta } from "./storage-namespace";

// ---------------------------------------------------------------------------
// The repository is the only thing the UI talks to. It writes IndexedDB, then
// queues the same change for Supabase. Nothing in the UI ever awaits the
// network, so a slow connection can never make the app feel slow.
// ---------------------------------------------------------------------------

export const ONBOARDED_KEY = REVISE_META_KEYS.onboardedAt;

export async function hasOnboarded(userId: Id = LOCAL_USER_ID): Promise<boolean> {
  const scoped = await readReviseUserMeta<string>("onboardedAt", userId);
  if (scoped !== undefined) return Boolean(scoped);
  // Migrate the pre-account local key lazily so existing offline profiles do
  // not see onboarding again after this release.
  return Boolean(await readReviseMeta<string>("onboardedAt"));
}

export async function markOnboarded(userId: Id = LOCAL_USER_ID): Promise<void> {
  await writeReviseUserMeta("onboardedAt", userId, new Date().toISOString());
  if (userId === LOCAL_USER_ID) await writeReviseMeta("onboardedAt", new Date().toISOString());
}

export async function loadRevisionCheckpoint(userId: Id): Promise<RevisionCheckpoint | undefined> {
  const value = await readReviseMeta<unknown>("revisionCheckpoint");
  if (isRevisionCheckpoint(value)) return value.userId === userId ? value : undefined;
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[userId];
  return isRevisionCheckpoint(candidate) && candidate.userId === userId ? candidate : undefined;
}

export async function saveRevisionCheckpoint(checkpoint: RevisionCheckpoint): Promise<void> {
  const current = await readReviseMeta<unknown>("revisionCheckpoint");
  const byUser: Record<string, RevisionCheckpoint> = {};
  if (isRevisionCheckpoint(current)) byUser[current.userId] = current;
  else if (current && typeof current === "object") {
    for (const [userId, value] of Object.entries(current)) {
      if (isRevisionCheckpoint(value) && value.userId === userId) byUser[userId] = value;
    }
  }
  byUser[checkpoint.userId] = checkpoint;
  await writeReviseMeta("revisionCheckpoint", byUser);
}

export async function clearRevisionCheckpoint(userId: Id): Promise<void> {
  const current = await readReviseMeta<unknown>("revisionCheckpoint");
  if (isRevisionCheckpoint(current)) {
    if (current.userId === userId) await writeReviseMeta("revisionCheckpoint", null);
    return;
  }
  if (!current || typeof current !== "object") return;
  const byUser: Record<string, RevisionCheckpoint> = {};
  for (const [key, value] of Object.entries(current)) {
    if (key !== userId && isRevisionCheckpoint(value) && value.userId === key) byUser[key] = value;
  }
  await writeReviseMeta("revisionCheckpoint", Object.keys(byUser).length ? byUser : null);
}

export interface Snapshot {
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  papers: Paper[];
  plannedSessions: PlannedSession[];
  examDates: ExamDate[];
  settings: UserSettings;
  streak: StreakState;
  lessonProgress: LessonProgress;
}

export const LOCAL_USER_ID = "local";

export function defaultSettings(userId: Id): UserSettings {
  return {
    userId,
    displayName: "Student",
    // Every seeded subject is on by default; onboarding narrows it.
    subjectIds: allSubjects().map((s) => s.id),
    availability: [
      { weekday: 0, minutes: 90 },
      { weekday: 1, minutes: 60 },
      { weekday: 2, minutes: 60 },
      { weekday: 3, minutes: 60 },
      { weekday: 4, minutes: 60 },
      { weekday: 5, minutes: 30 },
      { weekday: 6, minutes: 120 },
    ],
    sessionLengthMinutes: 25,
    targetGrades: {},
    theme: "system",
    accessibility: { largeText: false, dyslexiaFont: false, highContrast: false, reduceMotion: false },
    aiEnabled: true,
    // Pulse never reads this account's study history until it is switched on.
    pulseEnabled: false,
    lastLessonSubject: "",
    updatedAt: new Date().toISOString(),
  };
}

export function defaultStreak(userId: Id): StreakState {
  return { userId, current: 0, longest: 0, lastActiveDate: null, xp: 0, achievements: [] };
}

export function defaultLessonProgress(userId: Id): LessonProgress {
  return {
    userId,
    completed: {},
    streak: { count: 0, lastDay: "" },
    updatedAt: new Date().toISOString(),
  };
}

const SEED_VERSION = 1;

/**
 * Install the authored curriculum content for a user. Deterministic ids make
 * this idempotent: a re-run adds topics that appeared since last time and
 * leaves every existing card's FSRS history untouched.
 */
export async function ensureSeeded(userId: Id): Promise<void> {
  const installed = await readReviseMeta<number>("seedVersion");
  const existing = await getAll<Card>("cards");
  const known = new Set(existing.map((c) => c.id));

  const wanted = seedCards(allTopics(), userId);
  const missing = wanted.filter((c) => !known.has(c.id));
  if (missing.length) await putAll("cards", missing);

  const existingQuestions = await getAll<Question>("questions");
  const knownQuestions = new Set(existingQuestions.map((q) => q.id));
  const missingQuestions = seedQuestions.filter((q) => !knownQuestions.has(q.id));
  if (missingQuestions.length) await putAll("questions", missingQuestions);

  if (installed !== SEED_VERSION) await writeReviseMeta("seedVersion", SEED_VERSION);
}

/** How many history rows load synchronously at boot before the rest streams in. */
export const HISTORY_FIRST_PAGE = 500;
/** Everything beyond the first page streams in the background in these chunks. */
export const HISTORY_CHUNK = 500;

export async function loadSnapshot(userId: Id, opts?: { historyLimit?: number }): Promise<Snapshot> {
  await ensureSeeded(userId);
  const db = await getDb();
  const historyLimit = opts?.historyLimit ?? HISTORY_FIRST_PAGE;

  // Keyed by store name rather than destructured positionally: COLLECTION_STORES
  // is ordered for sync replay, and tying the read order to it silently swaps
  // collections the moment that order changes.
  const rows = Object.fromEntries(
    await Promise.all(
      COLLECTION_STORES.map(async (store) => [store, await db.getAll(store)] as const),
    ),
  ) as Record<CollectionStore, unknown[]>;

  // The two append-only history logs are the ones that grow without bound, so
  // only their most recent `historyLimit` rows load synchronously — IndexedDB
  // cursors walk the time index backwards, and the tail is what Today, the
  // review session and recent-mistake surfaces actually read first. Older
  // history hydrates progressively via streamHistory() without blocking boot.
  const [reviewLogs, attempts] = await Promise.all([
    latestRows<ReviewLog>(db, "reviewLogs", "byReviewed", historyLimit, userId),
    latestRows<Attempt>(db, "attempts", "byCreated", historyLimit, userId),
  ]);

  const settings = ((await db.get("settings", userId)) as UserSettings | undefined) ?? defaultSettings(userId);
  const streak = ((await db.get("streak", userId)) as StreakState | undefined) ?? defaultStreak(userId);
  const lessonProgress =
    ((await db.get("lessonProgress", userId)) as LessonProgress | undefined) ?? defaultLessonProgress(userId);

  const outbox = (await db.getAll("outbox")) as unknown[];
  const meta = (await db.getAll("meta")) as unknown[];
  const lessonRows = (await db.getAll("lessonProgress")) as unknown[];
  const aiCache = (await db.getAll("aiCache")) as unknown[];
  const aiDlq = (await db.getAll("aiDlq")) as unknown[];
  const issues = validatePersistedStores({
    cards: rows.cards,
    reviewLogs: rows.reviewLogs,
    questions: rows.questions,
    attempts: rows.attempts,
    mistakes: rows.mistakes,
    papers: rows.papers,
    plannedSessions: rows.plannedSessions,
    examDates: rows.examDates,
    settings: [settings],
    streak: [streak],
    lessonProgress: lessonRows,
    outbox,
    meta,
    aiCache,
    aiDlq,
  });
  if (issues.length) {
    throw new StorageRecoveryError(
      "corruption",
      `Revise found ${issues.length} malformed local row${issues.length === 1 ? "" : "s"}. Repair can remove only those rows.`,
      issues.slice(0, 40),
    );
  }

  const scoped = <T>(store: CollectionStore): T[] =>
    rows[store].filter((value) => {
      if (store === "questions") {
        const owner = value && typeof value === "object" ? (value as { userId?: unknown }).userId : undefined;
        return owner === undefined || owner === userId;
      }
      return Boolean(value && typeof value === "object" && (value as { userId?: unknown }).userId === userId);
    }) as T[];

  return {
    cards: scoped<Card>("cards"),
    reviewLogs: reviewLogs.filter((row) => row.userId === userId),
    questions: scoped<Question>("questions"),
    attempts: attempts.filter((row) => row.userId === userId),
    mistakes: scoped<Mistake>("mistakes"),
    papers: scoped<Paper>("papers"),
    plannedSessions: scoped<PlannedSession>("plannedSessions"),
    examDates: scoped<ExamDate>("examDates"),
    settings,
    streak,
    lessonProgress,
  };
}

export async function loadRevisionTwin(userId: Id): Promise<RevisionTwinState | undefined> {
  const value = await readReviseMeta<unknown>("revisionTwin");
  if (isRevisionTwinState(value)) return value.userId === userId ? value : undefined;
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[userId];
  return isRevisionTwinState(candidate) && candidate.userId === userId ? candidate : undefined;
}

export async function saveRevisionTwin(state: RevisionTwinState): Promise<void> {
  const current = await readReviseMeta<unknown>("revisionTwin");
  const byUser: Record<string, RevisionTwinState> = {};
  if (isRevisionTwinState(current)) byUser[current.userId] = current;
  else if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(current)) {
      if (isRevisionTwinState(value) && value.userId === key) byUser[key] = value;
    }
  }
  byUser[state.userId] = state;
  await writeReviseMeta("revisionTwin", byUser);
}

/** Raw-store export used by the recovery screen before a repair or reset. */
export async function dumpSnapshotForRecovery(): Promise<Record<string, unknown[]>> {
  const db = await getDb();
  const names = [
    "cards",
    "reviewLogs",
    "questions",
    "attempts",
    "mistakes",
    "papers",
    "plannedSessions",
    "examDates",
    "settings",
    "streak",
    "lessonProgress",
    "outbox",
    "meta",
    "aiCache",
    "aiDlq",
  ] as const;
  const rows: Record<string, unknown[]> = {};
  for (const name of names) rows[name] = (await db.getAll(name)) as unknown[];
  return rows;
}

/** Delete only rows that fail the persisted-shape validator. */
export async function repairSnapshotForRecovery(): Promise<{ removed: number; issues: PersistenceIssue[] }> {
  const db = await getDb();
  const dump = await dumpSnapshotForRecovery();
  const issues = validatePersistedStores(dump);
  if (!issues.length) return { removed: 0, issues: [] };
  const byStore = new Map<string, Set<string>>();
  for (const problem of issues) {
    const rows = byStore.get(problem.store) ?? new Set<string>();
    rows.add(problem.row);
    byStore.set(problem.store, rows);
  }
  let removed = 0;
  for (const [store, ids] of byStore) {
    const tx = db.transaction(store as never, "readwrite");
    for (const id of ids) {
      if (id === "?") continue;
      await tx.objectStore(store as never).delete(id);
      removed++;
    }
    await tx.done;
  }
  return { removed, issues };
}

/**
 * The newest `limit` rows from a store via its time index, newest-first.
 * A bounded cursor walk — O(limit) rows touched, not O(table).
 */
async function latestRows<T extends { userId?: Id }>(
  db: Awaited<ReturnType<typeof getDb>>,
  store: "reviewLogs" | "attempts",
  index: "byReviewed" | "byCreated",
  limit: number,
  userId: Id,
): Promise<T[]> {
  const tx = db.transaction(store);
  // idb keys .index() on the store's literal name; both stores here share
  // "byUser", so that literal is the safe overlap for the cast.
  let cursor = await tx.objectStore(store).index(index as "byUser").openCursor(null, "prev");
  const rows: T[] = [];
  while (cursor && rows.length < limit) {
    const row = cursor.value as unknown as T;
    if (row.userId === userId) rows.push(row);
    cursor = await cursor.continue();
  }
  return rows;
}

/**
 * Stream the full history logs oldest-first in chunks, for progressive
 * hydration: the store merges each chunk into its snapshot once, in the
 * background, until the whole history is resident again.
 */
export async function* streamHistory(
  chunkSize = HISTORY_CHUNK,
  userId?: Id,
): AsyncGenerator<{ reviewLogs?: ReviewLog[]; attempts?: Attempt[] }> {
  for await (const chunk of streamReviewLogs(chunkSize)) {
    const rows = userId ? chunk.filter((row) => row.userId === userId) : chunk;
    if (rows.length) yield { reviewLogs: rows };
  }
  for await (const chunk of streamAttempts(chunkSize)) {
    const rows = userId ? chunk.filter((row) => row.userId === userId) : chunk;
    if (rows.length) yield { attempts: rows };
  }
}

// --- writes ----------------------------------------------------------------

export async function saveCard(card: Card): Promise<void> {
  await putOne("cards", card);
  await enqueue("cards", "upsert", card);
}

export async function saveCards(cards: Card[]): Promise<void> {
  await putAll("cards", cards);
  for (const card of cards) await enqueue("cards", "upsert", card);
}

export async function deleteCard(id: Id, ownerId?: Id): Promise<void> {
  await removeOne("cards", id);
  await enqueue("cards", "delete", ownerId ? { id, userId: ownerId } : { id }, ownerId);
}

/** Bulk delete for the browser's multi-select. One transaction, one pass. */
export async function deleteCards(ids: Id[], ownerId?: Id): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction("cards", "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
  for (const id of ids) await enqueue("cards", "delete", ownerId ? { id, userId: ownerId } : { id }, ownerId);
}

export async function saveReviewLog(log: ReviewLog): Promise<void> {
  await putOne("reviewLogs", log);
  await enqueue("reviewLogs", "upsert", log);
}

export async function saveQuestion(question: Question): Promise<void> {
  await putOne("questions", question);
  await enqueue("questions", "upsert", question);
}

export async function saveQuestions(questions: Question[]): Promise<void> {
  await putAll("questions", questions);
  for (const q of questions) await enqueue("questions", "upsert", q);
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  await putOne("attempts", attempt);
  await enqueue("attempts", "upsert", attempt);
}

export async function saveMistake(mistake: Mistake): Promise<void> {
  await putOne("mistakes", mistake);
  await enqueue("mistakes", "upsert", mistake);
}

export async function saveMistakes(mistakes: Mistake[]): Promise<void> {
  await putAll("mistakes", mistakes);
  for (const m of mistakes) await enqueue("mistakes", "upsert", m);
}

export async function savePaper(paper: Paper): Promise<void> {
  await putOne("papers", paper);
  await enqueue("papers", "upsert", paper);
}

export async function savePlan(sessions: PlannedSession[]): Promise<void> {
  await putAll("plannedSessions", sessions);
  for (const s of sessions) await enqueue("plannedSessions", "upsert", s);
}

export async function replacePlan(userId: Id, sessions: PlannedSession[]): Promise<void> {
  const db = await getDb();
  const existing = (await db.getAll("plannedSessions")) as PlannedSession[];
  const keep = new Set(sessions.map((s) => s.id));
  const removed = existing.filter((s) => s.userId === userId && !keep.has(s.id));
  const tx = db.transaction("plannedSessions", "readwrite");
  await Promise.all(removed.map((s) => tx.store.delete(s.id)));
  await Promise.all(sessions.map((s) => tx.store.put(s)));
  await tx.done;
  for (const s of sessions) await enqueue("plannedSessions", "upsert", s);
  // Dropped sessions must also be deleted on the server, or every other
  // device keeps them and a future pull resurrects them locally.
  for (const s of removed) {
    await enqueue("plannedSessions", "delete", { id: s.id, userId } as Partial<PlannedSession>, userId);
  }
}

export async function saveExamDate(exam: ExamDate): Promise<void> {
  await putOne("examDates", exam);
  await enqueue("examDates", "upsert", exam);
}

export async function deleteExamDate(id: Id, ownerId?: Id): Promise<void> {
  await removeOne("examDates", id);
  await enqueue("examDates", "delete", ownerId ? { id, userId: ownerId } : { id }, ownerId);
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  const db = await getDb();
  await db.put("settings", settings);
  await enqueue("settings", "upsert", settings);
}

export async function saveStreak(streak: StreakState): Promise<void> {
  const db = await getDb();
  await db.put("streak", streak);
  await enqueue("streak", "upsert", streak);
}

export async function saveLessonProgress(progress: LessonProgress): Promise<void> {
  const db = await getDb();
  await db.put("lessonProgress", progress);
  await enqueue("lessonProgress", "upsert", progress);
}
