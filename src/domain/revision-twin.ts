import { independentAttempt, questionCapabilities, trustedAssessmentAttempt } from "./learning-evidence";
import type { ActivityKind, Attempt, Id, IsoInstant, Question, Recommendation } from "./types";

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
export const REVISION_TWIN_MINUTES = 20;
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
export type RevisionTwinOutcomeSource = "trusted-attempt" | "self-reported" | "unverified";

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
  /** Denominator for the trusted marked check. */
  actualMax?: number;
  /** Observed mark gain against a trusted pre-block baseline on the same topic. */
  observedGainMarks?: number;
  /** Accuracy before and after the block, retained so calibration is auditable. */
  baselineAccuracy?: number;
  observedAccuracy?: number;
  /** Canonical attempt that supplied the trusted post-block result. */
  proofAttemptId?: Id;
  /** Only trusted-attempt outcomes are allowed to change future forecasts. */
  outcomeSource?: RevisionTwinOutcomeSource;
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
  /** Fixed comparison window. The Twin follows Today's learning window. */
  plannedMinutes: number;
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
  /** Completed blocks that are retained in history but excluded from calibration. */
  unverifiedCompleted: number;
}

export interface RevisionTwinProof {
  attemptId: Id;
  actualMarks: number;
  actualMax: number;
  baselineAccuracy: number;
  observedAccuracy: number;
  observedGainMarks: number;
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
  const plannedMinutes = clampMinutes(input.plannedMinutes ?? input.choice.plannedMinutes ?? REVISION_TWIN_MINUTES);
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
    outcomeSource: "self-reported",
  };
}

/** Close a block without inventing an outcome. It remains history, not calibration evidence. */
export function finishRevisionTwinSession(
  session: RevisionTwinSession,
  input: { actualMinutes?: number; now?: IsoInstant } = {},
): RevisionTwinSession {
  return {
    ...session,
    status: "completed",
    completedAt: input.now ?? new Date().toISOString(),
    actualMinutes: clampMinutes(input.actualMinutes ?? session.plannedMinutes),
    outcomeSource: "unverified",
  };
}

function validAttemptScore(attempt: Attempt): number | null {
  if (!Number.isFinite(attempt.awarded) || !Number.isFinite(attempt.max) || attempt.max <= 0 ||
    attempt.awarded < 0 || attempt.awarded > attempt.max) return null;
  return attempt.awarded / attempt.max;
}

function matchesTwinTarget(session: RevisionTwinSession, attempt: Attempt): boolean {
  return attempt.userId === session.userId &&
    attempt.subjectId === session.subjectId &&
    (!session.topicId || attempt.topicIds.includes(session.topicId));
}

function trustedTwinAttempt(attempt: Attempt, history: readonly Attempt[], questions: readonly Question[]): boolean {
  const question = questions.find((row) => row.id === attempt.questionId);
  return Boolean(question && independentAttempt(attempt) && trustedAssessmentAttempt(attempt, question, history, questions));
}

/**
 * Turn one canonical post-block attempt into a directional gain observation.
 *
 * A trusted post score alone is not "marks gained". The Twin therefore also
 * requires the latest trusted independent pre-block attempt on the same target.
 * The before/after accuracy delta is expressed on the post-check denominator.
 * This remains noisy evidence, so the calibration layer keeps its shrinkage
 * prior and never accepts manually typed scores.
 */
export function revisionTwinProofForAttempt(
  session: RevisionTwinSession,
  attempt: Attempt,
  history: readonly Attempt[],
  questions: readonly Question[],
): RevisionTwinProof | null {
  const observedAccuracy = validAttemptScore(attempt);
  if (session.status !== "active" || observedAccuracy == null || !matchesTwinTarget(session, attempt) ||
    Date.parse(attempt.createdAt) <= Date.parse(session.startedAt) ||
    !trustedTwinAttempt(attempt, history, questions)) return null;

  const baseline = history
    .filter((row) => row.id !== attempt.id && row.questionId !== attempt.questionId && matchesTwinTarget(session, row) &&
      Date.parse(row.createdAt) < Date.parse(session.startedAt) &&
      validAttemptScore(row) != null && trustedTwinAttempt(row, history, questions) &&
      comparableTwinQuestions(row.questionId, attempt.questionId, questions))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!baseline) return null;
  const baselineAccuracy = validAttemptScore(baseline);
  if (baselineAccuracy == null) return null;

  return {
    attemptId: attempt.id,
    actualMarks: roundMarks(attempt.awarded),
    actualMax: roundMarks(attempt.max),
    baselineAccuracy: round01(baselineAccuracy),
    observedAccuracy: round01(observedAccuracy),
    observedGainMarks: roundMarks((observedAccuracy - baselineAccuracy) * attempt.max),
  };
}

function comparableTwinQuestions(baselineQuestionId: Id, observedQuestionId: Id, questions: readonly Question[]): boolean {
  const baseline = questions.find((row) => row.id === baselineQuestionId);
  const observed = questions.find((row) => row.id === observedQuestionId);
  if (!baseline || !observed) return false;
  const left = questionCapabilities(baseline);
  const right = new Set(questionCapabilities(observed));
  // Capability metadata is the strongest available like-for-like comparison.
  // Legacy/reference-tier content without capability ids falls back to the
  // already-enforced subject/topic target rather than fabricating a mapping.
  return !left.length || !right.size || left.some((id) => right.has(id));
}

export function eligibleRevisionTwinProofAttempts(
  session: RevisionTwinSession,
  history: readonly Attempt[],
  questions: readonly Question[],
): Array<{ attempt: Attempt; proof: RevisionTwinProof }> {
  return history
    .filter((attempt) => Date.parse(attempt.createdAt) > Date.parse(session.startedAt))
    .map((attempt) => ({ attempt, proof: revisionTwinProofForAttempt(session, attempt, history, questions) }))
    .filter((row): row is { attempt: Attempt; proof: RevisionTwinProof } => Boolean(row.proof))
    .sort((a, b) => b.attempt.createdAt.localeCompare(a.attempt.createdAt));
}

export function completeRevisionTwinSessionFromAttempt(
  session: RevisionTwinSession,
  attempt: Attempt,
  history: readonly Attempt[],
  questions: readonly Question[],
  input: { actualMinutes?: number; now?: IsoInstant } = {},
): RevisionTwinSession {
  const proof = revisionTwinProofForAttempt(session, attempt, history, questions);
  if (!proof) throw new Error("This attempt is not eligible trusted Twin evidence.");
  return {
    ...session,
    status: "completed",
    completedAt: input.now ?? new Date().toISOString(),
    actualMarks: proof.actualMarks,
    actualMax: proof.actualMax,
    observedGainMarks: proof.observedGainMarks,
    baselineAccuracy: proof.baselineAccuracy,
    observedAccuracy: proof.observedAccuracy,
    proofAttemptId: proof.attemptId,
    actualMinutes: clampMinutes(input.actualMinutes ?? session.plannedMinutes),
    outcomeSource: "trusted-attempt",
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

/** Trusted observed gain normalised to the same time window as the forecast. */
export function observedGainForWindow(session: RevisionTwinSession): number | null {
  if (session.outcomeSource !== "trusted-attempt" || session.observedGainMarks == null ||
    !Number.isFinite(session.observedGainMarks)) return null;
  const minutes = Math.max(1, session.actualMinutes ?? session.plannedMinutes);
  return roundMarks(session.observedGainMarks * (session.plannedMinutes / minutes));
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
      session.outcomeSource === "trusted-attempt" &&
      session.observedGainMarks != null &&
      Number.isFinite(session.observedGainMarks) &&
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
      const actual = observedGainForWindow(row) ?? 0;
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
 * Convert the recommender's mixed-duration candidates into one common bounded
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
      plannedMinutes: budgetMinutes,
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
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const trustedCompleted = completedSessions.filter((session) => observedGainForWindow(session) != null);
  const calibrations = [...calibrateRevisionTwin(sessions).values()].sort((a, b) => b.sampleSize - a.sampleSize || a.key.localeCompare(b.key));
  if (!trustedCompleted.length) {
    return {
      sessions,
      activeSession: sessions.find((session) => session.status === "active") ?? null,
      completedSessions,
      calibrations,
      checks: 0,
      meanAbsoluteError: null,
      bias: null,
      hitRate: null,
      unverifiedCompleted: completedSessions.length,
    };
  }
  const errors = trustedCompleted.map((session) => (observedGainForWindow(session) ?? 0) - session.predictedMarks);
  return {
    sessions,
    activeSession: sessions.find((session) => session.status === "active") ?? null,
    completedSessions,
    calibrations,
    checks: trustedCompleted.length,
    meanAbsoluteError: roundMarks(errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length),
    bias: roundMarks(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    hitRate: Math.round((errors.filter((error) => Math.abs(error) <= 0.5).length / errors.length) * 100) / 100,
    unverifiedCompleted: completedSessions.length - trustedCompleted.length,
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
    (candidate.actualMax == null || Number.isFinite(candidate.actualMax)) &&
    (candidate.observedGainMarks == null || Number.isFinite(candidate.observedGainMarks)) &&
    (candidate.baselineAccuracy == null || Number.isFinite(candidate.baselineAccuracy)) &&
    (candidate.observedAccuracy == null || Number.isFinite(candidate.observedAccuracy)) &&
    (candidate.proofAttemptId == null || typeof candidate.proofAttemptId === "string") &&
    (candidate.outcomeSource == null || ["trusted-attempt", "self-reported", "unverified"].includes(candidate.outcomeSource)) &&
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
    actualMax: session.actualMax == null ? undefined : roundMarks(Math.max(0, finiteOr(session.actualMax, 0))),
    observedGainMarks: session.observedGainMarks == null ? undefined : roundMarks(finiteOr(session.observedGainMarks, 0)),
    baselineAccuracy: session.baselineAccuracy == null ? undefined : round01(session.baselineAccuracy),
    observedAccuracy: session.observedAccuracy == null ? undefined : round01(session.observedAccuracy),
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

function round01(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

