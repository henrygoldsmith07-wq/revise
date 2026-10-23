import { syncWireIdValue } from "./sync-contract";
import { seedCards, upgradeSeedCardFaces } from "@/content/seed-cards";
import { loadQuestionRows, preloadAuthoredQuestions } from "./authored-questions";
import { applyRuntimeReviewLedger, readRuntimeReviewLedger } from "./runtime-review-ledger";
import { allTopics } from "@/domain/curriculum";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { aiConsentGrantedInSettings } from "@/domain/ai-consent";
import { buildSundayPlan, retainedSundayPlan, type SundayPlanSnapshot } from "@/domain/sunday-plan";
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
import { COLLECTION_STORES, activeDatabaseProfile, getDb, putAll, putMissing, putOne, streamAttempts, streamReviewLogs } from "./db";
import { deleteReplicaRows } from "./sync-deletions";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import type { CollectionStore } from "./db";
import { migrateContentIds } from "./content-ids";
import { enqueue } from "./sync";
import { isUnit4Option, isYearGroup } from "@/domain/year-group";
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
    // New students start on the four flagship subjects. Settings/onboarding
    // can add reference-tier boards; they are not silently enrolled.
    subjectIds: FLAGSHIP_SUBJECTS.map((s) => s.subjectId),
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
    // AI is off until the learner explicitly opts in (domain/ai-consent.ts).
    // The audience includes under-18s, so no work leaves for a model provider
    // by default.
    aiEnabled: false,
    // Pulse never reads this account's study history until it is switched on.
    pulseEnabled: false,
    sundayPlanEnabled: false,
    // Pilot telemetry never leaves the device until it is switched on.
    pilotTelemetry: false,
    // Official-paper matching stays off until the owner confirms the terms.
    officialPaperTrust: false,
    officialPaperTermsConfirmed: false,
    labMode: false,
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

// v2: ids are namespaced under cnt: (see src/data/content-ids.ts); the bank
// mints namespaced ids and a data migration remaps every persisted legacy id.
const SEED_VERSION = 2;

/**
 * Install the authored curriculum content for a user. Deterministic ids make
 * this idempotent: a re-run adds topics that appeared since last time and
 * leaves every existing card's FSRS history untouched.
 *
 * The cnt: content-id migration runs first: legacy `seed-*` ids (which
 * collided with operator tooling) are rewritten before the bank tops up, so
 * a pre-namespace device reseeds against already-remapped rows and never
 * reintroduces a legacy id. Idempotent and effectively free when it has run.
 */
export async function ensureSeeded(userId: Id): Promise<Card[]> {
  await migrateContentIds();
  const installed = await readReviseMeta<number>("seedVersion");
  // putMissing skips ids already installed and ids the learner deleted (local
  // or wire tombstone), reading both inside its own write transaction.
  // Authored questions are not copied: the bundle serves them (see
  // ./authored-questions), so only cards, which carry FSRS state, install.
  const seeded = seedCards(allTopics(), userId);
  await putMissing("cards", seeded, userId);
  if (installed !== SEED_VERSION) await writeReviseMeta("seedVersion", SEED_VERSION);
  return seeded;
}

/** How many history rows load synchronously at boot before the rest streams in. */
export const HISTORY_FIRST_PAGE = 500;
/** Everything beyond the first page streams in the background in these chunks. */
export const HISTORY_CHUNK = 500;

export async function loadSnapshot(userId: Id, opts?: { historyLimit?: number }): Promise<Snapshot> {
  // The authored bank is a separate chunk; start fetching it while the cards install.
  preloadAuthoredQuestions();
  const seeded = await ensureSeeded(userId);
  const db = await getDb();
  const historyLimit = opts?.historyLimit ?? HISTORY_FIRST_PAGE;

  // Keyed by store name rather than destructured positionally: COLLECTION_STORES
  // is ordered for sync replay, and tying the read order to it silently swaps
  // collections the moment that order changes.
  // Questions are the exception: current authored questions come from the
  // bundle and only private/retired rows are read from the store.
  const [questionRows, rows] = await Promise.all([
    loadQuestionRows(userId),
    Promise.all(
      COLLECTION_STORES.filter((store) => store !== "questions").map(async (store) => [store, await db.getAll(store)] as const),
    ).then((entries) => Object.fromEntries(entries) as Record<Exclude<CollectionStore, "questions">, unknown[]>),
  ]);

  // The two append-only history logs are the ones that grow without bound, so
  // only their most recent `historyLimit` rows load synchronously — IndexedDB
  // cursors walk the time index backwards, and the tail is what Today, the
  // review session and recent-mistake surfaces actually read first. Older
  // history hydrates progressively via streamHistory() without blocking boot.
  const [reviewLogs, attempts] = await Promise.all([
    latestRows<ReviewLog>(db, "reviewLogs", "byReviewed", historyLimit, userId),
    latestRows<Attempt>(db, "attempts", "byCreated", historyLimit, userId),
  ]);

  const stored = (await db.get("settings", userId)) as UserSettings | undefined;
  const fallback = defaultSettings(userId);
  const settings: UserSettings = stored
    ? {
        ...fallback,
        ...stored,
        accessibility: { ...fallback.accessibility, ...stored.accessibility },
        labMode: stored.labMode === true,
        ...(isYearGroup(stored.yearGroup) ? { yearGroup: stored.yearGroup } : { yearGroup: undefined }),
        ...(isUnit4Option(stored.unit4Option) ? { unit4Option: stored.unit4Option } : { unit4Option: undefined }),
        pulseEnabled: stored.pulseEnabled === true,
        sundayPlanEnabled: stored.sundayPlanEnabled === true,
        pilotTelemetry: stored.pilotTelemetry === true,
        officialPaperTrust: stored.officialPaperTrust === true,
        officialPaperTermsConfirmed: stored.officialPaperTermsConfirmed === true,
        // The historic default stored `aiEnabled: true` for every profile even
        // though no learner chose it. Only an explicit opt-in at the current
        // consent wording counts.
        aiEnabled: aiConsentGrantedInSettings(stored),
      }
    : fallback;
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
    questions: questionRows.stored,
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

  const runtimeLedger = await readRuntimeReviewLedger();
  const scoped = <T>(store: CollectionStore): T[] =>
    (store === "questions" ? questionRows.questions : rows[store]).filter((value) => {
      if (store === "questions") {
        const owner = value && typeof value === "object" ? (value as { userId?: unknown }).userId : undefined;
        return owner === undefined || owner === userId;
      }
      return Boolean(value && typeof value === "object" && (value as { userId?: unknown }).userId === userId);
    }) as T[];

  return {
    // Cards installed by an older generator get its fixed faces (see upgradeSeedCardFaces).
    cards: upgradeSeedCardFaces(scoped<Card>("cards"), seeded, allTopics()),
    reviewLogs: reviewLogs.filter((row) => row.userId === userId),
    // Retired template rows stay on disk for export/history recovery, but can
    // no longer be selected or contribute to live learning evidence.
    // Reviewer-portal approvals (cached effective ledger) are applied on read,
    // never written back, so the trust state is always re-derived.
    questions: applyRuntimeReviewLedger(
      scoped<Question>("questions").filter((question) => !question.id.startsWith("cnt:question:wjec-physics-depth-")),
      runtimeLedger,
    ),
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
    "markingFlags",
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
  const row = await (await getDb()).get("cards", id);
  await deleteReplicaRows("cards", [id], ownerId ?? row?.userId ?? activeDatabaseProfile());
}

/** Bulk delete for the browser's multi-select. One transaction, one pass. */
export async function deleteCards(ids: Id[], ownerId?: Id): Promise<void> {
  if (!ids.length) return;
  const row = await (await getDb()).get("cards", ids[0]!);
  await deleteReplicaRows("cards", ids, ownerId ?? row?.userId ?? activeDatabaseProfile());
}

export async function saveReviewLog(log: ReviewLog): Promise<void> {
  await putOne("reviewLogs", log);
  await enqueue("reviewLogs", "upsert", log);
}

export async function saveQuestion(question: Question, ownerId: Id = activeDatabaseProfile()): Promise<void> {
  await putOne("questions", question);
  await enqueue("questions", "upsert", question, ownerId);
}

export async function saveQuestions(questions: Question[], ownerId: Id = activeDatabaseProfile()): Promise<void> {
  await putAll("questions", questions);
  for (const q of questions) await enqueue("questions", "upsert", q, ownerId);
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  await putOne("attempts", attempt);
  await enqueue("attempts", "upsert", attempt);
}

/** Keep an answer, its repair evidence and newly-created cards atomic locally. */
export async function saveLearningResult(attempt: Attempt, mistakes: Mistake[], cards: Card[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["attempts", "mistakes", "cards", "meta"], "readwrite");
  try {
    const targets = [["attempts", attempt], ...mistakes.map(row => ["mistakes", row]), ...cards.map(row => ["cards", row])] as const;
    for (const [entity, row] of targets) {
      if (await tx.objectStore("meta").get(tombstoneKey(String(entity), (row as Attempt).id)) || await tx.objectStore("meta").get(wireTombstoneKey(String(entity), syncWireIdValue(attempt.userId, (row as Attempt).id)))) throw new Error("Cannot update deleted evidence.");
    }
    await Promise.all([
      tx.objectStore("attempts").put(attempt),
      ...mistakes.map((mistake) => tx.objectStore("mistakes").put(mistake)),
      ...cards.map((card) => tx.objectStore("cards").put(card)),
      tx.done,
    ]);
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted by IndexedDB. */ }
    await tx.done.catch(() => {});
    throw error;
  }
  await enqueue("attempts", "upsert", attempt);
  for (const mistake of mistakes) await enqueue("mistakes", "upsert", mistake);
  for (const card of cards) await enqueue("cards", "upsert", card);
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

// Plan replacements run one at a time. Onboarding saves exam dates (which
// fires the dynamic replan) and then rebuilds the plan itself; run together,
// each read "existing" before the other had written, neither deleted the
// other's rows, and a fresh student's Schedule showed two blocks at 16:00
// (twenty-third pass). Serialised, the later plan replaces the earlier one.
//
// That queue only covers one tab. Two open tabs (or a tab and an installed
// PWA window) share one IndexedDB, and each replan read "existing" before the
// other wrote, so both plans survived (twenty-fourth pass). Where the Web
// Locks API exists, every replacement also holds one origin-wide lock, so the
// later plan replaces the earlier one across tabs too. Without it (very old
// browsers) behaviour is the single-tab queue, as before.
let planWrites: Promise<void> = Promise.resolve();

export const PLAN_REPLACE_LOCK = "revise:replace-plan";

type PlanLockManager = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };

function planLocks(): PlanLockManager | null {
  const locks = (globalThis as { navigator?: { locks?: PlanLockManager } }).navigator?.locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

export function replacePlan(userId: Id, sessions: PlannedSession[]): Promise<void> {
  const locks = planLocks();
  const run = planWrites.then(() =>
    locks ? locks.request(PLAN_REPLACE_LOCK, () => replacePlanNow(userId, sessions)) : replacePlanNow(userId, sessions),
  );
  planWrites = run.catch(() => undefined);
  return run;
}

async function replacePlanNow(userId: Id, sessions: PlannedSession[]): Promise<void> {
  const db = await getDb();
  const existing = (await db.getAll("plannedSessions")) as PlannedSession[];
  const keep = new Set(sessions.map((s) => s.id));
  const removed = existing.filter((s) => s.userId === userId && !keep.has(s.id));
  await deleteReplicaRows("plannedSessions", removed.map(s => s.id), userId, sessions);
  for (const s of sessions) await enqueue("plannedSessions", "upsert", s);
  // Dropped sessions must also be deleted on the server, or every other
  // device keeps them and a future pull resurrects them locally.
}

export async function saveExamDate(exam: ExamDate): Promise<void> {
  await putOne("examDates", exam);
  await enqueue("examDates", "upsert", exam);
}

export async function deleteExamDate(id: Id, ownerId?: Id): Promise<void> {
  const row = await (await getDb()).get("examDates", id);
  await deleteReplicaRows("examDates", [id], ownerId ?? row?.userId ?? activeDatabaseProfile());
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("settings", "readwrite");
  const stored = await tx.store.get(settings.userId) as UserSettings | undefined;
  // A stale view saving another setting must not discard or rewrite a weekly
  // snapshot. The first snapshot wins, including concurrent tabs.
  const existing = stored?.sundayPlanSnapshot;
  const incoming = settings.sundayPlanSnapshot;
  const next = existing && (!incoming || existing.weekStart >= incoming.weekStart)
    ? { ...settings, sundayPlanSnapshot: existing }
    : settings;
  await tx.store.put(next);
  await tx.done;
  await enqueue("settings", "upsert", next);
}

/** Reads complete persisted local history, not the store's partial boot window.
 * A preview never writes. Recurring capture is opt-in and atomic per week. */
export async function loadSundayPlan(userId: Id, now: Date, timeZone: string, preview = false): Promise<SundayPlanSnapshot | null> {
  const db = await getDb();
  const initial = await db.get("settings", userId) as UserSettings | undefined;
  if (!initial || (!preview && initial.sundayPlanEnabled !== true)) return null;
  if (!preview) {
    const retained = retainedSundayPlan(initial.sundayPlanSnapshot, now, timeZone);
    if (retained) return retained;
  }
  const tx = db.transaction(["settings", "attempts", "reviewLogs", "cards", "examDates"], "readonly");
  const [settings, attempts, reviewLogs, cards, examDates] = await Promise.all([
    tx.objectStore("settings").get(userId) as Promise<UserSettings | undefined>,
    tx.objectStore("attempts").getAll() as Promise<Attempt[]>,
    tx.objectStore("reviewLogs").getAll() as Promise<ReviewLog[]>,
    tx.objectStore("cards").getAll() as Promise<Card[]>,
    tx.objectStore("examDates").getAll() as Promise<ExamDate[]>,
  ]);
  await tx.done;
  if (!settings || (!preview && settings.sundayPlanEnabled !== true)) return null;
  if (!preview) {
    const retained = retainedSundayPlan(settings.sundayPlanSnapshot, now, timeZone);
    if (retained) return retained;
  }
  const snapshot = buildSundayPlan({
    now, timeZone, subjectIds: settings.subjectIds,
    subjectTopicIds: allTopics(settings.subjectIds).map((topic) => topic.id),
    attempts: attempts.filter((row) => row.userId === userId),
    reviewLogs: reviewLogs.filter((row) => row.userId === userId),
    cards: cards.filter((row) => row.userId === userId),
    examDates: examDates.filter((row) => row.userId === userId),
  });
  if (preview) return snapshot;
  const write = db.transaction("settings", "readwrite");
  const latest = await write.store.get(userId) as UserSettings | undefined;
  if (!latest || latest.sundayPlanEnabled !== true) { await write.done; return null; }
  const retained = retainedSundayPlan(latest.sundayPlanSnapshot, now, timeZone);
  if (retained) { await write.done; return retained; }
  const next: UserSettings = { ...latest, sundayPlanSnapshot: snapshot, updatedAt: now.toISOString() };
  await write.store.put(next);
  await write.done;
  // Same IndexedDB-first/outbox path as every other settings update. No send
  // to a notification service; configured account sync may replicate settings.
  await enqueue("settings", "upsert", next);
  return snapshot;
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
