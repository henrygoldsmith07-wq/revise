import type { SyncTombstone } from "./sync-tombstone";
import type { LearnerHistoryRecord } from "./learner-history";
import type { PaperOutcomeRecord } from "./paper-outcome";
import type { Card, DeckExport, Id, IsoInstant, LessonProgress, Paper, Question, UserSettings } from "./types";
import { exportDeck } from "./deck-io";
import type { ActualResultRecord, GradePredictionRecord } from "./grade-loop";

// ---------------------------------------------------------------------------
// Data portability, privacy and account controls.
//
// Three promises in one module, all offline-first:
//
//  1. **Portability (GDPR Art. 20)** — export user-held study data in one
//     machine-readable JSON archive. Card decks have a first-class importer;
//     full snapshot restore is intentionally not claimed until every linked
//     history row can be restored without breaking ids or evidence provenance.
//  2. **Deletion (Art. 17) + retention** — purging is an explicit, reversible
//     step in the UI; the helpers here are pure so the UI can show exactly
//     what will disappear before it does.
//  3. **Local-only / private mode** — Revise already runs without an account.
//     `privacyDisclosure` makes that claim auditable, and `shouldRetain`
//     enforces a configurable retention window without a background job.
// ---------------------------------------------------------------------------

export interface PortabilitySnapshot {
  formatVersion: 1 | 2;
  exportedAt: IsoInstant;
  app: "revise";
  userId: Id;
  /** Human label for the export file name, not an id. */
  exportedBy?: string;
  cards: DeckExport;
  /**
   * v2 raw card rows retain stable ids so review logs and FSRS history can be
   * restored transactionally. v1 exports omitted these ids and are therefore
   * readable but not eligible for a full-history restore.
   */
  cardRecords?: Card[];
  /** Question records needed to preserve attempt/paper references. */
  questions?: Question[];
  papers?: Paper[];
  lessonProgress?: LessonProgress | null;
  attemptsCount: number;
  attempts: unknown[];
  reviewLogsCount: number;
  reviewLogs: unknown[];
  mistakesCount: number;
  mistakes: unknown[];
  planSessionsCount: number;
  plannedSessions: unknown[];
  examDatesCount: number;
  examDates: unknown[];
  /** Forecast snapshots used to audit predicted grades against later outcomes. */
  gradePredictionsCount: number;
  gradePredictions: GradePredictionRecord[];
  /** Mocks, timed papers and final results entered by the student. */
  gradeActualsCount: number;
  gradeActuals: ActualResultRecord[];
  /** Immediate, transfer and delayed-retention intervention evidence. */
  interventionOutcomesCount: number;
  interventionOutcomes: unknown[];
  settings: UserSettings | null;
  streak: unknown | null;
  // Round-trippable: the app's seed content is *not* duplicated into the
  // snapshot (it is reproducible), but the export records its seed version so
  // a restore on a newer app can warn.
  seedVersion: number;
  paperOutcomes?: PaperOutcomeRecord[];
  deletions?: SyncTombstone[];
  learnerHistoryDeletions?: LearnerHistoryRecord[];
  notes?: string[];
}

export interface PortabilityInput {
  userId: Id;
  displayName?: string;
  cards: Card[];
  questions?: Question[];
  papers?: Paper[];
  lessonProgress?: LessonProgress | null;
  attempts: unknown[];
  reviewLogs: unknown[];
  mistakes: unknown[];
  plannedSessions: unknown[];
  examDates: unknown[];
  gradePredictions?: GradePredictionRecord[];
  gradeActuals?: ActualResultRecord[];
  interventionOutcomes?: unknown[];
  settings?: UserSettings | null;
  streak?: unknown | null;
  paperOutcomes?: PaperOutcomeRecord[];
  deletions?: SyncTombstone[];
  learnerHistoryDeletions?: LearnerHistoryRecord[];
  seedVersion?: number;
  now?: Date;
}

export function buildPortabilitySnapshot(input: PortabilityInput): PortabilitySnapshot {
  const at = (input.now ?? new Date()).toISOString();
  return {
    formatVersion: 2,
    exportedAt: at,
    app: "revise",
    userId: input.userId,
    exportedBy: input.displayName,
    cards: exportDeck(input.cards, { name: `Revise export — ${input.userId}`, includeScheduling: true }),
    cardRecords: input.cards,
    questions: input.questions ?? [],
    papers: input.papers ?? [],
    lessonProgress: input.lessonProgress ?? null,
    attemptsCount: input.attempts.length,
    attempts: input.attempts,
    reviewLogsCount: input.reviewLogs.length,
    reviewLogs: input.reviewLogs,
    mistakesCount: input.mistakes.length,
    mistakes: input.mistakes,
    planSessionsCount: input.plannedSessions.length,
    plannedSessions: input.plannedSessions,
    examDatesCount: input.examDates.length,
    examDates: input.examDates,
    gradePredictionsCount: input.gradePredictions?.length ?? 0,
    gradePredictions: input.gradePredictions ?? [],
    gradeActualsCount: input.gradeActuals?.length ?? 0,
    gradeActuals: input.gradeActuals ?? [],
    interventionOutcomesCount: input.interventionOutcomes?.length ?? 0,
    interventionOutcomes: input.interventionOutcomes ?? [],
    paperOutcomes: input.paperOutcomes ?? [],
    deletions: input.deletions ?? [],
    learnerHistoryDeletions: input.learnerHistoryDeletions ?? [],
    settings: input.settings ?? null,
    streak: input.streak ?? null,
    seedVersion: input.seedVersion ?? 1,
    notes: [
      "This is a machine-readable Revise profile snapshot. Keep it private — it contains card content, study history and recorded assessment outcomes.",
      "Format v2 preserves raw record ids so Settings can validate and transactionally restore this profile on another device.",
    ],
  };
}

export interface ParsedPortability {
  ok: boolean;
  snapshot: PortabilitySnapshot | null;
  warnings: string[];
  counts: { cards: number; attempts: number; reviewLogs: number; mistakes: number };
}

export function parsePortabilitySnapshot(text: string): ParsedPortability {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, snapshot: null, warnings: ["Not valid JSON — is this a Revise export?"], counts: { cards: 0, attempts: 0, reviewLogs: 0, mistakes: 0 } };
  }
  const body = raw as Record<string, unknown>;
  if (body.app !== "revise" || (body.formatVersion !== 1 && body.formatVersion !== 2)) {
    return { ok: false, snapshot: null, warnings: ["This does not look like a supported Revise export (missing/unsupported app or formatVersion)."], counts: { cards: 0, attempts: 0, reviewLogs: 0, mistakes: 0 } };
  }
  const snap = body as unknown as PortabilitySnapshot;
  // Grade-loop fields were added additively to format v1. Older v1 exports
  // remain valid and simply restore with no recorded forecast/outcome history.
  if (!Array.isArray(snap.gradePredictions)) snap.gradePredictions = [];
  if (!Array.isArray(snap.gradeActuals)) snap.gradeActuals = [];
  snap.gradePredictionsCount = snap.gradePredictions.length;
  snap.gradeActualsCount = snap.gradeActuals.length;
  if (!Array.isArray(snap.cards?.cards)) warnings.push("Cards deck missing — the rest of the export was read.");
  if (snap.formatVersion === 1) {
    warnings.push("Legacy v1 export: card ids were not preserved, so full study-history restore is unavailable. Deck import is still supported.");
  } else {
    if (!Array.isArray(snap.cardRecords)) warnings.push("v2 snapshot is missing raw card records required for full restore.");
    if (!Array.isArray(snap.questions)) snap.questions = [];
    if (!Array.isArray(snap.papers)) snap.papers = [];
  }
  if (typeof snap.seedVersion !== "number") warnings.push("No seedVersion — restore may behave differently on a newer app.");
  return {
    ok: warnings.length === 0,
    snapshot: snap,
    warnings,
    counts: {
      cards: Array.isArray(snap.cards?.cards) ? snap.cards.cards.length : 0,
      attempts: Array.isArray(snap.attempts) ? snap.attempts.length : 0,
      reviewLogs: Array.isArray(snap.reviewLogs) ? snap.reviewLogs.length : 0,
      mistakes: Array.isArray(snap.mistakes) ? snap.mistakes.length : 0,
    },
  };
}

export interface PortabilityRestorePreview {
  fullRestoreSupported: boolean;
  reason: string | null;
  counts: {
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

export function portabilityRestorePreview(snapshot: PortabilitySnapshot): PortabilityRestorePreview {
  const fullRestoreSupported = snapshot.formatVersion >= 2 && Array.isArray(snapshot.cardRecords);
  return {
    fullRestoreSupported,
    reason: fullRestoreSupported
      ? null
      : "This legacy export does not contain stable card ids, so restoring linked review history would be unsafe.",
    counts: {
      cards: snapshot.cardRecords?.length ?? snapshot.cards?.cards?.length ?? 0,
      reviewLogs: Array.isArray(snapshot.reviewLogs) ? snapshot.reviewLogs.length : 0,
      attempts: Array.isArray(snapshot.attempts) ? snapshot.attempts.length : 0,
      mistakes: Array.isArray(snapshot.mistakes) ? snapshot.mistakes.length : 0,
      plannedSessions: Array.isArray(snapshot.plannedSessions) ? snapshot.plannedSessions.length : 0,
      examDates: Array.isArray(snapshot.examDates) ? snapshot.examDates.length : 0,
      questions: snapshot.questions?.length ?? 0,
      papers: snapshot.papers?.length ?? 0,
    },
  };
}

export function portabilityFilename(userId: Id, at: IsoInstant = new Date().toISOString()): string {
  const date = at.slice(0, 10);
  const safeUser = String(userId).slice(0, 24).replace(/[^a-z0-9._-]/gi, "_");
  return `revise-export-${safeUser}-${date}.json`;
}

// ---------------------------------------------------------------------------
// Privacy disclosure + retention
// ---------------------------------------------------------------------------

export interface RetentionSettings {
  /** Keep server-synced rows this long after last update (days). null = keep forever locally. */
  serverRetentionDays: number | null;
  /** Whether cloud sync is enabled at all. */
  cloudEnabled: boolean;
  /** When true, no card text, question text or raw review logs are queued for upload even if cloudEnabled. */
  localOnly: boolean;
  updatedAt: IsoInstant;
}

export function defaultRetention(now?: Date): RetentionSettings {
  return {
    serverRetentionDays: 365,
    cloudEnabled: false,
    localOnly: true,
    updatedAt: (now ?? new Date()).toISOString(),
  };
}

/**
 * Whether a row should still be retained given retention settings.
 * Compares the row's updatedAt/createdAt against the window; locally-stored
 * rows are never auto-purged unless the user explicitly deletes the account.
 */
export function shouldRetain(
  row: { updatedAt?: IsoInstant; createdAt?: IsoInstant },
  retention: RetentionSettings,
  now: Date = new Date(),
): boolean {
  if (retention.serverRetentionDays == null) return true;
  const stamp = row.updatedAt ?? row.createdAt;
  if (!stamp) return true;
  const ageDays = Math.round((now.getTime() - new Date(stamp).getTime()) / 86_400_000);
  // Local-only mode never expires local rows; expiry only applies to the
  // server replica. The helper still returns true locally so the UI does not
  // hide rows prematurely.
  if (retention.localOnly) return true;
  return ageDays <= retention.serverRetentionDays;
}

/**
 * Plain-English privacy disclosure the Settings page can render verbatim.
 * The text is kept here so tests can assert its claims.
 */
export function privacyDisclosure(cloudEnabled: boolean): string[] {
  if (!cloudEnabled) {
    return [
      "Local-only mode: everything is stored in your browser (IndexedDB) and never sent to a server.",
      "No analytics, no cookies, no account required. Your cards, attempts, review logs and recorded assessment outcomes leave this device only if you export or share data.",
      "Clear site data or use Settings → Data → Delete to remove everything. Nothing can be recovered after that.",
    ];
  }
  return [
    "Cloud sync relays supported study rows to Supabase so they can appear on other devices. Local metadata such as forecast calibration history stays on this device unless you export it.",
    "Data is scoped by your user id with row-level security. Use Settings → Data → Export to get a machine-readable copy, or Delete to remove your account's rows locally and on next sync on the server.",
    "You can switch back to local-only at any time — queued changes stay local and nothing new is uploaded.",
  ];
}

// ---------------------------------------------------------------------------
// Deletion — pure preview of what will be removed
// ---------------------------------------------------------------------------

export interface DeletionPreview {
  stores: Array<{ store: string; count: number }>;
  total: number;
  warning: string;
  /** Rows that contain authored content and are worth double-checking. */
  authoredCards: number;
}

export function deletionPreview(counts: { store: string; count: number }[], authoredCards: number): DeletionPreview {
  const total = counts.reduce((a, r) => a + r.count, 0);
  const warning =
    total === 0
      ? "Nothing to delete — this profile has no stored rows."
      : authoredCards > 0
        ? `This will permanently delete ${total} rows including ${authoredCards} authored cards. Export first if you want a backup — nothing can be recovered after this.`
        : `This will permanently delete ${total} rows. Nothing can be recovered after this.`;
  return { stores: counts, total, warning, authoredCards };
}

/** One-line summary for logs / tests. */
export function deletionSummary(preview: DeletionPreview): string {
  if (preview.total === 0) return "No rows to delete.";
  return `Delete ${preview.total} rows (${preview.stores.map((s) => `${s.store}:${s.count}`).join(", ")}).`;
}
