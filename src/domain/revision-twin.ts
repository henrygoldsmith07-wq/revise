import type { ActivityKind, Id, IsoInstant, Recommendation } from "./types";

// ---------------------------------------------------------------------------
// Revision Digital Twin
//
// The recommender already estimates marks per hour. The twin turns that
// estimate into a small, falsifiable decision system: show a fixed-time set of
// choices, record which one the student picked, then compare the predicted
// return with a marked check at the end of the block. The calibration is
// deliberately conservative so one noisy session cannot swing the ranking.
// ---------------------------------------------------------------------------

export const REVISION_TWIN_VERSION = 1 as const;
export const REVISION_TWIN_MINUTES = 45;
const REVISION_TWIN_ACTIVITIES: readonly ActivityKind[] = [
  "learn",
  "flashcards",
  "recall",
  "practice",
  "paper",
  "mistakes",
];

export type RevisionTwinSessionStatus = "active" | "completed" | "abandoned";
export type RevisionTwinConfidence = "new" | "learning" | "calibrated";

export interface RevisionTwinSession {
  id: Id;
  userId: Id;
  /** The activity the student actually chose. */
  activity: ActivityKind;
  subjectId: Id;
  topicId?: Id;
  /** Snapshot title keeps history readable if authored content is renamed. */
  title: string;
  plannedMinutes: number;
  /** Original marks estimate before the empirical multiplier was applied. */
  baselineMarks?: number;
  predictedMarks: number;
  startedAt: IsoInstant;
  completedAt?: IsoInstant;
  /** Marks earned in the end-of-session check, not a confidence rating. */
  actualMarks?: number;
  /** Real time spent; useful when a student stops early. */
  actualMinutes?: number;
  status: RevisionTwinSessionStatus;
}

export interface RevisionTwinState {
  version: typeof REVISION_TWIN_VERSION;
  userId: Id;
  sessions: RevisionTwinSession[];
  updatedAt: IsoInstant;
}

export interface RevisionTwinCalibration {
  key: string;
  sampleSize: number;
  /** Shrinkage multiplier applied to the baseline predicted marks. */
  multiplier: number;
  /** Mean actual − predicted marks for the completed checks. */
  bias: number;
  /** Mean absolute error in marks. */
  mae: number;
  confidence: RevisionTwinConfidence;
  lastObservedAt: IsoInstant | null;
}

export interface RevisionTwinChoice {
  key: string;
  recommendation: Recommendation;
  activity: ActivityKind;
  subjectId: Id;
  topicId?: Id;
  /** Uncalibrated return for the fixed time window. */
  baselineMarks: number;
  /** Return after the conservative empirical multiplier is applied. */
  predictedMarks: number;
  marksPerHour: number;
  sampleSize: number;
  confidence: RevisionTwinConfidence;
}

export interface RevisionTwinReport {
  sessions: RevisionTwinSession[];
  activeSession: RevisionTwinSession | null;
  completedSessions: RevisionTwinSession[];
  calibrations: RevisionTwinCalibration[];
  checks: number;
  meanAbsoluteError: number | null;
  bias: number | null;
  hitRate: number | null;
}

export function revisionTwinKey(activity: ActivityKind, subjectId: Id, topicId?: Id): string {
  return `${activity}:${subjectId}:${topicId ?? "subject"}`;
}

export function createRevisionTwinState(userId: Id, sessions: RevisionTwinSession[] = [], now = new Date().toISOString()): RevisionTwinState {
  return {
    version: REVISION_TWIN_VERSION,
    userId,
    sessions: sessions.filter((session) => session.userId === userId).map(normaliseSession),
    updatedAt: now,
  };
}

export function createRevisionTwinSession(input: {
  id: Id;
  userId: Id;
  choice: RevisionTwinChoice;
  title?: string;
  now?: IsoInstant;
  plannedMinutes?: number;
}): RevisionTwinSession {
  const plannedMinutes = clampMinutes(input.plannedMinutes ?? REVISION_TWIN_MINUTES);
  return {
    id: input.id,
    userId: input.userId,
    activity: input.choice.activity,
    subjectId: input.choice.subjectId,
    topicId: input.choice.topicId,
    title: input.title?.trim() || "Revision block",
    plannedMinutes,
    baselineMarks: roundMarks(input.choice.baselineMarks),
    predictedMarks: roundMarks(input.choice.predictedMarks),
    startedAt: input.now ?? new Date().toISOString(),
    status: "active",
  };
}

/**
 * Complete an active block with the marks earned in its check. The inputs are
 * clamped at the domain boundary so a malformed form value cannot poison the
 * calibration history with NaN or negative marks.
 */
export function completeRevisionTwinSession(
  session: RevisionTwinSession,
  input: { actualMarks: number; actualMinutes?: number; now?: IsoInstant },
): RevisionTwinSession {
  return {
    ...session,
    status: "completed",
    completedAt: input.now ?? new Date().toISOString(),
    actualMarks: roundMarks(Math.max(0, finiteOr(input.actualMarks, 0))),
    actualMinutes: clampMinutes(input.actualMinutes ?? session.plannedMinutes),
  };
}

export function abandonRevisionTwinSession(session: RevisionTwinSession, now = new Date().toISOString()): RevisionTwinSession {
  return {
    ...session,
    status: "abandoned",
    completedAt: now,
  };
}

/** Convert a check score to the same planned window used by the forecast. */
export function actualMarksForWindow(session: RevisionTwinSession): number | null {
  if (session.actualMarks == null || !Number.isFinite(session.actualMarks)) return null;
  const minutes = Math.max(1, session.actualMinutes ?? session.plannedMinutes);
  return roundMarks(Math.max(0, session.actualMarks) * (session.plannedMinutes / minutes));
}

/**
 * Build empirical calibration per activity/topic. A three-session prior keeps
 * the first observation useful without allowing a single lucky or poor check
 * to dominate the next recommendation.
 */
export function calibrateRevisionTwin(sessions: RevisionTwinSession[]): Map<string, RevisionTwinCalibration> {
  const completed = sessions.filter(
    (session) =>
      session.status === "completed" &&
      session.actualMarks != null &&
      Number.isFinite(session.actualMarks) &&
      Number.isFinite(session.predictedMarks),
  );
  const grouped = new Map<string, RevisionTwinSession[]>();
  for (const session of completed) {
    const key = revisionTwinKey(session.activity, session.subjectId, session.topicId);
    const rows = grouped.get(key) ?? [];
    rows.push(session);
    grouped.set(key, rows);
  }

  const out = new Map<string, RevisionTwinCalibration>();
  for (const [key, rows] of grouped) {
    const priorWeight = 3;
    let ratioSum = 0;
    let biasSum = 0;
    let maeSum = 0;
    for (const row of rows) {
      const baseline = Math.max(0.1, row.baselineMarks ?? row.predictedMarks);
      const actual = actualMarksForWindow(row) ?? 0;
      ratioSum += actual / baseline;
      biasSum += actual - row.predictedMarks;
      maeSum += Math.abs(actual - row.predictedMarks);
    }
    const multiplier = clamp(
      (priorWeight + ratioSum) / (priorWeight + rows.length),
      0.35,
      1.8,
    );
    const sampleSize = rows.length;
    out.set(key, {
      key,
      sampleSize,
      multiplier: roundMultiplier(multiplier),
      bias: roundMarks(biasSum / sampleSize),
      mae: roundMarks(maeSum / sampleSize),
      confidence: sampleSize >= 5 ? "calibrated" : sampleSize >= 2 ? "learning" : "new",
      lastObservedAt: rows.map((row) => row.completedAt ?? row.startedAt).sort().at(-1) ?? null,
    });
  }
  return out;
}

/**
 * Convert the recommender's mixed-duration candidates into a common 45-minute
 * comparison. One candidate per subject is preferred before filling any spare
 * rows, which makes the choice set genuinely useful when several subjects are
 * enrolled and one subject currently has a deep queue.
 */
export function buildRevisionTwinChoices(input: {
  recommendations: Recommendation[];
  sessions?: RevisionTwinSession[];
  budgetMinutes?: number;
  limit?: number;
}): RevisionTwinChoice[] {
  const budgetMinutes = clampMinutes(input.budgetMinutes ?? REVISION_TWIN_MINUTES);
  const limit = Math.max(1, Math.floor(input.limit ?? 4));
  const calibrations = calibrateRevisionTwin(input.sessions ?? []);
  const byKey = new Map<string, RevisionTwinChoice>();

  for (const recommendation of input.recommendations) {
    const key = revisionTwinKey(recommendation.activity, recommendation.subjectId, recommendation.topicId);
    const explanation = recommendation.explanation;
    const baselineRate =
      explanation?.marksPerHour ??
      (explanation?.recoverableMarks != null
        ? explanation.recoverableMarks / (Math.max(1, recommendation.minutes) / 60)
        : 0);
    if (!Number.isFinite(baselineRate) || baselineRate <= 0) continue;

    const baselineMarks = roundMarks((baselineRate * budgetMinutes) / 60);
    const calibration = calibrations.get(key);
    const predictedMarks = roundMarks(baselineMarks * (calibration?.multiplier ?? 1));
    const candidate: RevisionTwinChoice = {
      key,
      recommendation,
      activity: recommendation.activity,
      subjectId: recommendation.subjectId,
      topicId: recommendation.topicId,
      baselineMarks,
      predictedMarks,
      marksPerHour: roundMarks((predictedMarks / budgetMinutes) * 60),
      sampleSize: calibration?.sampleSize ?? 0,
      confidence: calibration?.confidence ?? "new",
    };
    const previous = byKey.get(key);
    if (!previous || candidate.predictedMarks > previous.predictedMarks || recommendation.score > previous.recommendation.score) {
      byKey.set(key, candidate);
    }
  }

  const sorted = [...byKey.values()].sort(
    (a, b) => b.predictedMarks - a.predictedMarks || b.recommendation.score - a.recommendation.score,
  );
  const chosen: RevisionTwinChoice[] = [];
  const subjects = new Set<Id>();
  for (const candidate of sorted) {
    if (chosen.length >= limit) break;
    if (subjects.has(candidate.subjectId)) continue;
    chosen.push(candidate);
    subjects.add(candidate.subjectId);
  }
  for (const candidate of sorted) {
    if (chosen.length >= limit) break;
    if (!chosen.some((row) => row.key === candidate.key)) chosen.push(candidate);
  }
  return chosen;
}

export function revisionTwinReport(state: RevisionTwinState | null | undefined): RevisionTwinReport {
  const sessions = [...(state?.sessions ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const completedSessions = sessions.filter(
    (session) => session.status === "completed" && session.actualMarks != null && Number.isFinite(session.actualMarks),
  );
  const calibrations = [...calibrateRevisionTwin(sessions).values()].sort((a, b) => b.sampleSize - a.sampleSize || a.key.localeCompare(b.key));
  if (!completedSessions.length) {
    return {
      sessions,
      activeSession: sessions.find((session) => session.status === "active") ?? null,
      completedSessions,
      calibrations,
      checks: 0,
      meanAbsoluteError: null,
      bias: null,
      hitRate: null,
    };
  }
  const errors = completedSessions.map((session) => (actualMarksForWindow(session) ?? 0) - session.predictedMarks);
  return {
    sessions,
    activeSession: sessions.find((session) => session.status === "active") ?? null,
    completedSessions,
    calibrations,
    checks: completedSessions.length,
    meanAbsoluteError: roundMarks(errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length),
    bias: roundMarks(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    hitRate: Math.round((errors.filter((error) => Math.abs(error) <= 0.5).length / errors.length) * 100) / 100,
  };
}

export function isRevisionTwinState(value: unknown): value is RevisionTwinState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RevisionTwinState>;
  return (
    candidate.version === REVISION_TWIN_VERSION &&
    typeof candidate.userId === "string" &&
    Array.isArray(candidate.sessions) &&
    candidate.sessions.every((session) => isRevisionTwinSession(session) && session.userId === candidate.userId) &&
    typeof candidate.updatedAt === "string"
  );
}

function isRevisionTwinSession(value: unknown): value is RevisionTwinSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RevisionTwinSession>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.userId === "string" &&
    REVISION_TWIN_ACTIVITIES.includes(candidate.activity as ActivityKind) &&
    typeof candidate.subjectId === "string" &&
    typeof candidate.title === "string" &&
    Number.isFinite(candidate.plannedMinutes) &&
    (candidate.baselineMarks == null || Number.isFinite(candidate.baselineMarks)) &&
    Number.isFinite(candidate.predictedMarks) &&
    typeof candidate.startedAt === "string" &&
    (candidate.status === "active" || candidate.status === "completed" || candidate.status === "abandoned") &&
    (candidate.actualMarks == null || Number.isFinite(candidate.actualMarks)) &&
    (candidate.actualMinutes == null || Number.isFinite(candidate.actualMinutes))
  );
}

function normaliseSession(session: RevisionTwinSession): RevisionTwinSession {
  return {
    ...session,
    plannedMinutes: clampMinutes(session.plannedMinutes),
    baselineMarks: session.baselineMarks == null ? undefined : roundMarks(Math.max(0, finiteOr(session.baselineMarks, 0))),
    predictedMarks: roundMarks(Math.max(0, finiteOr(session.predictedMarks, 0))),
    actualMarks: session.actualMarks == null ? undefined : roundMarks(Math.max(0, finiteOr(session.actualMarks, 0))),
    actualMinutes: session.actualMinutes == null ? undefined : clampMinutes(session.actualMinutes),
  };
}

function clampMinutes(value: number): number {
  return Math.min(24 * 60, Math.max(1, Math.round(finiteOr(value, REVISION_TWIN_MINUTES))));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundMarks(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

