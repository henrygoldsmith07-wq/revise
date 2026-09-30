import { HISTORY_KINDS, validateHistoryValue, validateHistoryRecord, historyRecordId, historyStorageKey, mergeHistoryRecord } from "@/domain/learner-history";
import { tombstoneKey, wireTombstoneKey, validateTombstone } from "@/domain/sync-tombstone";
import { syncWireIdValue } from "./sync-contract";
import { isSupabaseConfigured } from "./supabase";
import type { OutboxItem } from "@/domain/types";
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
import type { ActualResultRecord, GradePredictionRecord } from "@/domain/grade-loop";
import type { PortabilitySnapshot } from "@/domain/portability";
import { portabilityRestorePreview } from "@/domain/portability";
import { getDb } from "./db";
import { validatePersistedStores, type PersistenceIssue } from "./persistence-schema";
import { REVISE_META_KEYS } from "./storage-namespace";

export interface PortableRestoreValidation {
  ok: boolean;
  issues: PersistenceIssue[];
  counts: ReturnType<typeof portabilityRestorePreview>["counts"];
}

export interface PortableRestoreResult {
  restored: {
    cards: number;
    reviewLogs: number;
    attempts: number;
    mistakes: number;
    plannedSessions: number;
    examDates: number;
    questions: number;
    papers: number;
  };
}

type Owned = { userId?: Id };
type AnonOwned = { anonId?: string };

function remapOwned<T extends Owned>(rows: unknown[], sourceUserId: Id, targetUserId: Id): T[] {
  return rows.map((value) => {
    const row = value as T;
    if (row && typeof row === "object" && row.userId === sourceUserId) {
      return { ...row, userId: targetUserId } as T;
    }
    return row;
  });
}

function remapAnon<T extends AnonOwned>(rows: T[], sourceUserId: Id, targetUserId: Id): T[] {
  return rows.map((row) =>
    row && typeof row === "object" && row.anonId === sourceUserId
      ? { ...row, anonId: targetUserId }
      : row
  );
}

function rowId(value: unknown): string {
  if (!value || typeof value !== "object") return "?";
  const row = value as { id?: unknown; userId?: unknown };
  return typeof row.id === "string"
    ? row.id
    : typeof row.userId === "string"
      ? row.userId
      : "?";
}

function customIssue(
  store: PersistenceIssue["store"],
  row: string,
  field: string,
  reason: string,
): PersistenceIssue {
  return { store, row, field, reason };
}

function ownershipIssues(
  store: PersistenceIssue["store"],
  rows: unknown[],
  sourceUserId: Id,
): PersistenceIssue[] {
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as { userId?: unknown };
    return row.userId === sourceUserId
      ? []
      : [customIssue(
          store,
          rowId(value),
          "userId",
          "does not match the snapshot owner",
        )];
  });
}

function snapshotOwnershipIssues(snapshot: PortabilitySnapshot): PersistenceIssue[] {
  const sourceUserId = snapshot.userId;
  const issues: PersistenceIssue[] = [];

  const anonOwnedMeta = [
    ...(snapshot.gradePredictions ?? []),
    ...(snapshot.gradeActuals ?? []),
  ];
  for (const value of anonOwnedMeta) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push(customIssue("meta", "?", "anonId", "missing or invalid snapshot owner"));
      continue;
    }
    const row = value as { id?: unknown; anonId?: unknown };
    if (row.anonId !== sourceUserId) {
      issues.push(customIssue(
        "meta",
        typeof row.id === "string" ? row.id : "?",
        "anonId",
        "does not match the snapshot owner",
      ));
    }
  }

  for (const value of snapshot.interventionOutcomes ?? []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push(customIssue("meta", "?", "userId", "missing or invalid snapshot owner"));
      continue;
    }
    const row = value as { id?: unknown; userId?: unknown };
    if (row.userId !== sourceUserId) {
      issues.push(customIssue(
        "meta",
        typeof row.id === "string" ? row.id : "?",
        "userId",
        "does not match the snapshot owner",
      ));
    }
  }
  const ownedStores: Array<[PersistenceIssue["store"], unknown[]]> = [
    ["cards", snapshot.cardRecords ?? []],
    ["reviewLogs", snapshot.reviewLogs ?? []],
    ["attempts", snapshot.attempts ?? []],
    ["mistakes", snapshot.mistakes ?? []],
    ["papers", snapshot.papers ?? []],
    ["plannedSessions", snapshot.plannedSessions ?? []],
    ["examDates", snapshot.examDates ?? []],
  ];
  for (const [store, rows] of ownedStores) {
    issues.push(...ownershipIssues(store, rows, sourceUserId));
  }
  if (snapshot.settings) issues.push(...ownershipIssues("settings", [snapshot.settings], sourceUserId));
  if (snapshot.streak) issues.push(...ownershipIssues("streak", [snapshot.streak], sourceUserId));
  if (snapshot.lessonProgress) issues.push(...ownershipIssues("lessonProgress", [snapshot.lessonProgress], sourceUserId));
  return issues;
}

function buildRows(snapshot: PortabilitySnapshot, targetUserId: Id) {
  const sourceUserId = snapshot.userId;
  const cards = remapOwned<Card>(snapshot.cardRecords ?? [], sourceUserId, targetUserId);
  const reviewLogs = remapOwned<ReviewLog>(snapshot.reviewLogs ?? [], sourceUserId, targetUserId);
  const attempts = remapOwned<Attempt>(snapshot.attempts ?? [], sourceUserId, targetUserId);
  const mistakes = remapOwned<Mistake>(snapshot.mistakes ?? [], sourceUserId, targetUserId);
  const plannedSessions = remapOwned<PlannedSession>(snapshot.plannedSessions ?? [], sourceUserId, targetUserId);
  const examDates = remapOwned<ExamDate>(snapshot.examDates ?? [], sourceUserId, targetUserId);
  const questions = snapshot.questions ?? [];
  const papers = remapOwned<Paper>(snapshot.papers ?? [], sourceUserId, targetUserId);
  const settings = snapshot.settings
    ? ({ ...snapshot.settings, userId: targetUserId } as UserSettings)
    : null;
  const streak = snapshot.streak
    ? ({ ...(snapshot.streak as StreakState), userId: targetUserId } as StreakState)
    : null;
  const lessonProgress = snapshot.lessonProgress
    ? ({ ...snapshot.lessonProgress, userId: targetUserId } as LessonProgress)
    : null;

  return {
    cards,
    reviewLogs,
    attempts,
    mistakes,
    plannedSessions,
    examDates,
    questions,
    papers,
    settings,
    streak,
    lessonProgress,
  };
}

export async function validatePortableRestore(
  snapshot: PortabilitySnapshot,
  targetUserId: Id,
): Promise<PortableRestoreValidation> {
  const preview = portabilityRestorePreview(snapshot);
  if (!preview.fullRestoreSupported) {
    return {
      ok: false,
      issues: [customIssue("cards", "snapshot", "formatVersion", preview.reason ?? "Full restore is unavailable.")],
      counts: preview.counts,
    };
  }

  const ownership = snapshotOwnershipIssues(snapshot);
  if (ownership.length) {
    return { ok: false, issues: ownership, counts: preview.counts };
  }

  try {
    for (const kind of HISTORY_KINDS) {
      const values = kind === "paperOutcomes" ? snapshot.paperOutcomes ?? [] : snapshot[kind] ?? [];
      if (!Array.isArray(values)) throw new Error("Malformed learner history.");
      for (const value of values) validateHistoryValue(kind, value, snapshot.userId);
    }
    for (const marker of snapshot.deletions ?? []) validateTombstone(marker,snapshot.userId);
    for (const marker of snapshot.learnerHistoryDeletions ?? []) {
      if (!validateHistoryRecord(marker,snapshot.userId).deleted) throw new Error("Expected history deletion.");
    }
  } catch (error) {
    return {ok:false,issues:[customIssue("meta","history","ownership",error instanceof Error ? error.message : "Malformed history.")],counts:preview.counts};
  }

  const rows = buildRows(snapshot, targetUserId);
  const issues = validatePersistedStores({
    cards: rows.cards,
    reviewLogs: rows.reviewLogs,
    attempts: rows.attempts,
    mistakes: rows.mistakes,
    plannedSessions: rows.plannedSessions,
    examDates: rows.examDates,
    questions: rows.questions,
    papers: rows.papers,
    ...(rows.settings ? { settings: [rows.settings] } : {}),
    ...(rows.streak ? { streak: [rows.streak] } : {}),
    ...(rows.lessonProgress ? { lessonProgress: [rows.lessonProgress] } : {}),
  });

  const cardIds = new Set(rows.cards.map((row) => row.id));
  for (const log of rows.reviewLogs) {
    if (!cardIds.has(log.cardId)) {
      issues.push(customIssue(
        "reviewLogs",
        rowId(log),
        "cardId",
        "references a card that is not present in the snapshot",
      ));
    }
  }

  // Current shared/seed questions are valid referents and are deliberately not
  // overwritten by restore. Snapshot questions cover user-authored/imported
  // question rows that cannot be reproduced from the shipped curriculum.
  const db = await getDb();
  const existingQuestions = (await db.getAll("questions")) as Question[];
  const questionIds = new Set([
    ...existingQuestions.map((q) => q.id),
    ...rows.questions.map((q) => q.id),
  ]);
  for (const attempt of rows.attempts) {
    if (!questionIds.has(attempt.questionId)) {
      issues.push(customIssue(
        "attempts",
        rowId(attempt),
        "questionId",
        "references a question that is neither in the snapshot nor the current shipped curriculum",
      ));
    }
  }
  for (const paper of rows.papers) {
    for (const questionId of paper.questionIds) {
      if (!questionIds.has(questionId)) {
        issues.push(customIssue(
          "papers",
          rowId(paper),
          "questionIds",
          `references missing question ${questionId}`,
        ));
      }
    }
  }

  return { ok: issues.length === 0, issues, counts: preview.counts };
}

async function deleteOwnedRows(
  store: "cards" | "reviewLogs" | "attempts" | "mistakes" | "papers" | "plannedSessions" | "examDates",
  targetUserId: Id,
  objectStore: {
    getAll(): Promise<unknown[]>;
    delete(key: IDBValidKey): Promise<unknown>;
  },
): Promise<void> {
  const existing = await objectStore.getAll();
  for (const value of existing) {
    const row = value as { id?: unknown; userId?: unknown };
    if (row.userId === targetUserId && typeof row.id === "string") await objectStore.delete(row.id);
  }
  void store;
}

export async function restorePortableSnapshot(
  snapshot: PortabilitySnapshot,
  targetUserId: Id,
): Promise<PortableRestoreResult> {
  const validation = await validatePortableRestore(snapshot, targetUserId);
  if (!validation.ok) {
    const first = validation.issues[0];
    throw new Error(
      first
        ? `Restore validation failed: ${first.store} ${first.row}${first.field ? `.${first.field}` : ""} — ${first.reason}`
        : "Restore validation failed.",
    );
  }

  const rows = buildRows(snapshot, targetUserId);
  const db = await getDb();
  const tx = db.transaction(
    [
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
    ],
    "readwrite",
  );

  try {
    const meta = tx.objectStore("meta");
    // Imported terminal markers and existing device markers both suppress IDs.
    for (const raw of snapshot.deletions ?? []) {
      if (raw.wireOnly && snapshot.userId !== targetUserId) continue; // wire hashes belong to the source account
      const marker = {...validateTombstone(raw,snapshot.userId),userId:targetUserId};
      await meta.put({key:marker.wireOnly ? wireTombstoneKey(marker.entity,marker.id) : tombstoneKey(marker.entity,marker.id),value:marker});
    }
    for (const raw of snapshot.learnerHistoryDeletions ?? []) {
      const marker = {...validateHistoryRecord(raw,snapshot.userId),userId:targetUserId};
      await meta.put({key:historyStorageKey(marker.id),value:marker});
    }
    for (const store of ["cards","reviewLogs","questions","attempts","mistakes","papers","plannedSessions","examDates"] as const) {
      for (const row of rows[store]) {
        if (await meta.get(tombstoneKey(store,row.id)) || await meta.get(wireTombstoneKey(store,syncWireIdValue(targetUserId,row.id)))) throw new Error("Restore includes a deleted id. Import it as a new record instead.");
      }
    }
    for (const store of ["cards", "reviewLogs", "attempts", "mistakes", "papers", "plannedSessions", "examDates"] as const) {
      await deleteOwnedRows(store, targetUserId, tx.objectStore(store) as never);
    }

    // Questions are globally keyed/shared in the current schema. Never
    // overwrite current shipped content with an older export. Historical
    // non-seed/custom questions from the snapshot are inserted only when the
    // id does not already exist locally.
    const questionStore = tx.objectStore("questions");
    const existingQuestionIds = new Set((await questionStore.getAll()).map((question) => question.id));

    const outbox = tx.objectStore("outbox");
    for (const value of await outbox.getAll()) {
      const item = value as { id: string; ownerId?: Id; payload?: { userId?: Id } };
      if (item.ownerId === targetUserId || item.payload?.userId === targetUserId) await outbox.delete(item.id);
    }

    await Promise.all([
      ...rows.cards.map((row) => tx.objectStore("cards").put(row)),
      ...rows.reviewLogs.map((row) => tx.objectStore("reviewLogs").put(row)),
      ...rows.questions.filter((row) => !existingQuestionIds.has(row.id)).map((row) => tx.objectStore("questions").put(row)),
      ...rows.attempts.map((row) => tx.objectStore("attempts").put(row)),
      ...rows.mistakes.map((row) => tx.objectStore("mistakes").put(row)),
      ...rows.papers.map((row) => tx.objectStore("papers").put(row)),
      ...rows.plannedSessions.map((row) => tx.objectStore("plannedSessions").put(row)),
      ...rows.examDates.map((row) => tx.objectStore("examDates").put(row)),
      ...(rows.settings ? [tx.objectStore("settings").put(rows.settings)] : []),
      ...(rows.streak ? [tx.objectStore("streak").put(rows.streak)] : []),
      ...(rows.lessonProgress ? [tx.objectStore("lessonProgress").put(rows.lessonProgress)] : []),
    ]);

    const mergeMeta = async <T extends Record<string, unknown>>(
      key: string,
      incoming: T[],
      belongsToTarget: (row: T) => boolean,
    ) => {
      const current = await meta.get(key);
      const existing = Array.isArray(current?.value) ? (current.value as T[]) : [];
      const kind = HISTORY_KINDS.find(kind => REVISE_META_KEYS[kind] === key)!;
      for (const value of incoming) {
        validateHistoryValue(kind,value,targetUserId);
        const stored = (await meta.get(historyStorageKey(historyRecordId(kind,String(value.id)))))?.value;
        if (stored) {
          const old = validateHistoryRecord(stored,targetUserId);
          if (old.deleted) throw new Error("Restore includes deleted learner history.");
          mergeHistoryRecord(old,{...old,value,lamport:old.lamport+1});
        }
      }
      await meta.put({ key, value: [...existing.filter((row) => !belongsToTarget(row)), ...incoming] });
    };

    const gradePredictions = remapAnon(
      snapshot.gradePredictions ?? [],
      snapshot.userId,
      targetUserId,
    ) as GradePredictionRecord[];
    const gradeActuals = remapAnon(
      snapshot.gradeActuals ?? [],
      snapshot.userId,
      targetUserId,
    ) as ActualResultRecord[];
    const interventions = remapOwned<Record<string, unknown> & Owned>(
      snapshot.interventionOutcomes ?? [],
      snapshot.userId,
      targetUserId,
    );

    await mergeMeta(
      REVISE_META_KEYS.gradePredictions,
      gradePredictions as unknown as Record<string, unknown>[],
      (row) => row.anonId === targetUserId,
    );
    await mergeMeta(
      REVISE_META_KEYS.gradeActuals,
      gradeActuals as unknown as Record<string, unknown>[],
      (row) => row.anonId === targetUserId,
    );
    await mergeMeta(
      REVISE_META_KEYS.interventionOutcomes,
      interventions,
      (row) => row.userId === targetUserId,
    );

    await mergeMeta(REVISE_META_KEYS.paperOutcomes, remapOwned<Record<string,unknown> & Owned>(snapshot.paperOutcomes ?? [],snapshot.userId,targetUserId), row => row.userId === targetUserId);
    // Old exports have no continuity fields. Existing markers remain durable.
    // Requeue imported study rows and every deletion in the same restore commit.
    if (isSupabaseConfigured && targetUserId !== "local") {
      const queue = async (entity: OutboxItem["entity"], op: OutboxItem["op"], payload: unknown) => {
        await outbox.put({id:crypto.randomUUID(),entity,op,payload,ownerId:targetUserId,queuedAt:new Date().toISOString(),attempts:0,idempotencyKey:crypto.randomUUID()});
      };
      for (const store of ["cards","reviewLogs","attempts","mistakes","papers","plannedSessions","examDates"] as const) for (const row of rows[store]) await queue(store,"upsert",row);
      for (const entry of await meta.getAll()) {
        if (entry.key.startsWith("revise.deleted.v1:")) {
          const marker=validateTombstone(entry.value,targetUserId); await queue(marker.entity,"delete",marker);
        } else if (entry.key.startsWith("revise.historyRecord.v1:")) {
          const marker=validateHistoryRecord(entry.value,targetUserId);
          if (marker.deleted) await queue("learnerRecords","upsert",marker);
        }
      }
    }
    await meta.delete(`revise.changeCursor.v1:learner_records::user:${targetUserId}`);
    await meta.delete(`revise.changeCursor.v1:sync_tombstones::user:${targetUserId}`);

    // A restored profile must not resume a pre-restore sync cursor. The next
    // pull starts from the beginning and reconciles deliberately.
    await meta.delete(`${REVISE_META_KEYS.pullCursors}::user:${targetUserId}`);
    await meta.delete(`${REVISE_META_KEYS.lastPullAt}::user:${targetUserId}`);

    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // IndexedDB may already have aborted the transaction.
    }
    await tx.done.catch(() => {});
    throw error;
  }

  return {
    restored: {
      cards: rows.cards.length,
      reviewLogs: rows.reviewLogs.length,
      attempts: rows.attempts.length,
      mistakes: rows.mistakes.length,
      plannedSessions: rows.plannedSessions.length,
      examDates: rows.examDates.length,
      questions: rows.questions.length,
      papers: rows.papers.length,
    },
  };
}
