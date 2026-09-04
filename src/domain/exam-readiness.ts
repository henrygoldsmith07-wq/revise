import type { GradePrediction } from "./grades";
import type { Id, Subject } from "./types";

// ---------------------------------------------------------------------------
// Exam Readiness Passport
//
// The Digital Twin answers "what should I do with the next 45 minutes?".
// Readiness answers the more consequential question: "will those marks hold
// when the paper is timed and unfamiliar?" This module keeps that answer
// evidence-based and decomposable instead of inventing a single opaque score.
// ---------------------------------------------------------------------------

export type ExamReadinessStatus = "ready" | "nearly-ready" | "at-risk" | "building-evidence";
export type ReadinessSignalKey = "target" | "coverage" | "retention" | "accuracy" | "pace" | "transfer";
export type ReadinessBlockerKey = ReadinessSignalKey | "evidence";
export type ReadinessAction = "practice" | "review" | "timed" | "transfer";
export type ReadinessSignalStatus = "strong" | "watch" | "at-risk" | "missing";

export interface ExamReadinessInput {
  subject: Subject;
  prediction: GradePrediction;
  /** The student's configured target; the next boundary is used when absent. */
  targetGrade?: string | null;
  examDays?: number | null;
  coverage: {
    average: number;
    topics: number;
    evidencedTopics: number;
  };
  retention: {
    average: number | null;
    cards: number;
    reviews: number;
  };
  timed: {
    accuracy: number | null;
    attempts: number;
    marks: number;
  };
  pace: {
    ratio: number | null;
    attempts: number;
  };
  transfer: {
    passRate: number | null;
    completed: number;
    due: number;
  };
}

export interface ExamReadinessSignal {
  key: ReadinessSignalKey;
  label: string;
  /** 0–1 contribution score before the signal's weight is applied. */
  score: number;
  weight: number;
  status: ReadinessSignalStatus;
  evidence: string;
  detail: string;
}

export interface ExamReadinessBlocker {
  key: ReadinessBlockerKey;
  title: string;
  detail: string;
  severity: "high" | "medium";
  action: ReadinessAction;
}

export interface ExamReadiness {
  subjectId: Id;
  targetGrade: string | null;
  targetPercent: number | null;
  predictedGrade: string;
  predictedPercent: number;
  examDays: number | null;
  /** Percentage points still needed to reach the configured/inferred target. */
  gapPercent: number | null;
  /** Weighted 0–1 readiness score. */
  score: number;
  /** How much evidence supports the score, separate from the score itself. */
  confidence: number;
  status: ExamReadinessStatus;
  signals: ExamReadinessSignal[];
  blockers: ExamReadinessBlocker[];
  nextAction: { label: string; action: ReadinessAction };
  evidence: {
    topics: number;
    evidencedTopics: number;
    attempts: number;
    reviews: number;
    transferChecks: number;
    paceAttempts: number;
  };
}

export interface ExamReadinessSummary {
  score: number;
  confidence: number;
  status: ExamReadinessStatus;
  subjectCount: number;
  readyCount: number;
  atRiskCount: number;
  blockerCount: number;
  weakestSubjectId: Id | null;
}

const WEIGHTS: Record<ReadinessSignalKey, number> = {
  target: 0.3,
  coverage: 0.2,
  retention: 0.15,
  accuracy: 0.15,
  pace: 0.1,
  transfer: 0.1,
};

export function buildExamReadiness(input: ExamReadinessInput): ExamReadiness {
  const { subject, prediction } = input;
  const targetBoundary = input.targetGrade
    ? subject.gradeBoundaries.find((boundary) => boundary.grade === input.targetGrade)
    : undefined;
  const inferredBoundary = [...subject.gradeBoundaries]
    .filter((boundary) => boundary.percent > prediction.percent)
    .sort((a, b) => a.percent - b.percent)[0];
  const target = targetBoundary ?? inferredBoundary;
  const targetGrade = target?.grade ?? input.targetGrade ?? null;
  const targetPercent = target?.percent ?? null;
  const gapPercent = targetPercent == null ? null : round(Math.max(0, targetPercent - prediction.percent));

  const targetScore = targetPercent == null
    ? clamp01(prediction.confidence)
    : targetPercent <= prediction.percent
      ? 1
      : clamp01(prediction.percent / targetPercent);
  const coverage = clamp01(input.coverage.average);
  const retention = finite01(input.retention.average);
  const accuracy = finite01(input.timed.accuracy);
  const paceRatio = positiveFinite(input.pace.ratio);
  const paceScore = paceRatio == null
    ? 0.35
    : clamp01(1 - Math.abs(Math.log(paceRatio)) / Math.log(2));
  const transfer = finite01(input.transfer.passRate);

  const signals: ExamReadinessSignal[] = [
    {
      key: "target",
      label: "Target grade",
      score: round01(targetScore),
      weight: WEIGHTS.target,
      status: targetStatus(targetPercent, gapPercent, prediction.confidence),
      evidence: targetGrade ? (gapPercent ? `+${gapPercent}pp to ${targetGrade}` : `At ${targetGrade} boundary`) : "No target boundary",
      detail: targetPercent == null
        ? "The model has no higher configured boundary to test against yet."
        : gapPercent
          ? `${prediction.percent}% predicted · ${targetPercent}% needed for ${targetGrade}.`
          : `${prediction.percent}% predicted, at or above the ${targetGrade} boundary.`,
    },
    {
      key: "coverage",
      label: "Syllabus coverage",
      score: round01(coverage),
      weight: WEIGHTS.coverage,
      status: coverageStatus(coverage, input.coverage.topics, input.coverage.evidencedTopics),
      evidence: input.coverage.topics
        ? `${Math.round(coverage * 100)}% mastery · ${input.coverage.evidencedTopics}/${input.coverage.topics} evidenced`
        : "No topics selected",
      detail: "Coverage protects against a confident gap hiding in an untouched specification area.",
    },
    {
      key: "retention",
      label: "Recall retention",
      score: round01(retention ?? 0.35),
      weight: WEIGHTS.retention,
      status: retentionStatus(retention),
      evidence: retention == null ? "No card retention evidence" : `${Math.round(retention * 100)}% retained now · ${input.retention.reviews} reviews`,
      detail: "A topic is not exam-ready if the knowledge disappears between study sessions.",
    },
    {
      key: "accuracy",
      label: "Timed accuracy",
      score: round01(accuracy ?? 0.35),
      weight: WEIGHTS.accuracy,
      status: accuracyStatus(accuracy),
      evidence: accuracy == null ? "No marked answers" : `${Math.round(accuracy * 100)}% · ${input.timed.attempts} answers · ${round(input.timed.marks)} marks`,
      detail: "Marked answers are the closest direct evidence of marks likely to arrive on the paper.",
    },
    {
      key: "pace",
      label: "Exam pace",
      score: round01(paceScore),
      weight: WEIGHTS.pace,
      status: paceStatus(paceRatio, input.pace.attempts),
      evidence: paceRatio == null ? "Need three timed answers" : `${Math.round(paceRatio * 100)}% of exam pace · ${input.pace.attempts} timed answers`,
      detail: "The passport checks whether time is being converted into marks, not just whether answers are correct.",
    },
    {
      key: "transfer",
      label: "Unfamiliar transfer",
      score: round01(transfer ?? 0.35),
      weight: WEIGHTS.transfer,
      status: transferStatus(transfer),
      evidence: transfer == null ? `${input.transfer.due} check${input.transfer.due === 1 ? "" : "s"} waiting · none completed` : `${Math.round(transfer * 100)}% pass rate · ${input.transfer.completed} checks`,
      detail: "A delayed unfamiliar-context check is stronger proof than repeating the same question shape.",
    },
  ];

  const score = round01(signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0));
  const evidenceCoverage = input.coverage.topics ? clamp01(input.coverage.evidencedTopics / input.coverage.topics) : 0;
  const confidence = round01(
    evidenceCoverage * 0.2 +
      Math.min(1, Math.max(0, input.timed.attempts) / 8) * 0.3 +
      Math.min(1, Math.max(0, input.retention.reviews) / 20) * 0.15 +
      Math.min(1, Math.max(0, input.pace.attempts) / 3) * 0.1 +
      Math.min(1, Math.max(0, input.transfer.completed) / 3) * 0.15 +
      (targetGrade ? 0.1 : 0),
  );

  const blockers = buildBlockers({
    targetGrade,
    targetPercent,
    gapPercent,
    coverage,
    coverageTopics: input.coverage.topics,
    evidencedTopics: input.coverage.evidencedTopics,
    retention,
    accuracy,
    paceRatio,
    paceAttempts: input.pace.attempts,
    transfer,
    transferCompleted: input.transfer.completed,
    transferDue: input.transfer.due,
    confidence,
  });
  const status = readinessStatus(score, confidence, blockers);
  const nextAction = actionForBlocker(blockers[0]);

  return {
    subjectId: subject.id,
    targetGrade,
    targetPercent,
    predictedGrade: prediction.grade,
    predictedPercent: prediction.percent,
    examDays: input.examDays ?? null,
    gapPercent,
    score,
    confidence,
    status,
    signals,
    blockers,
    nextAction,
    evidence: {
      topics: input.coverage.topics,
      evidencedTopics: input.coverage.evidencedTopics,
      attempts: input.timed.attempts,
      reviews: input.retention.reviews,
      transferChecks: input.transfer.completed,
      paceAttempts: input.pace.attempts,
    },
  };
}

export function buildExamReadinessSet(inputs: ExamReadinessInput[]): ExamReadiness[] {
  return inputs
    .map(buildExamReadiness)
    .sort((a, b) => b.score - a.score || (a.examDays ?? Number.MAX_SAFE_INTEGER) - (b.examDays ?? Number.MAX_SAFE_INTEGER));
}

export function summariseExamReadiness(rows: ExamReadiness[]): ExamReadinessSummary {
  if (!rows.length) {
    return { score: 0, confidence: 0, status: "building-evidence", subjectCount: 0, readyCount: 0, atRiskCount: 0, blockerCount: 0, weakestSubjectId: null };
  }
  const score = round01(mean(rows.map((row) => row.score)));
  const confidence = round01(mean(rows.map((row) => row.confidence)));
  const atRiskCount = rows.filter((row) => row.status === "at-risk").length;
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const status: ExamReadinessStatus = confidence < 0.35
    ? "building-evidence"
    : atRiskCount
      ? "at-risk"
      : readyCount === rows.length && score >= 0.78
        ? "ready"
        : "nearly-ready";
  const weakest = [...rows].sort((a, b) => a.score - b.score)[0];
  return {
    score,
    confidence,
    status,
    subjectCount: rows.length,
    readyCount,
    atRiskCount,
    blockerCount: rows.reduce((sum, row) => sum + row.blockers.length, 0),
    weakestSubjectId: weakest?.subjectId ?? null,
  };
}

function buildBlockers(input: {
  targetGrade: string | null;
  targetPercent: number | null;
  gapPercent: number | null;
  coverage: number;
  coverageTopics: number;
  evidencedTopics: number;
  retention: number | null;
  accuracy: number | null;
  paceRatio: number | null;
  paceAttempts: number;
  transfer: number | null;
  transferCompleted: number;
  transferDue: number;
  confidence: number;
}): ExamReadinessBlocker[] {
  const blockers: ExamReadinessBlocker[] = [];
  if (input.targetPercent != null && (input.gapPercent ?? 0) > 0) {
    blockers.push({
      key: "target",
      title: `Close the ${input.targetGrade ?? "target"} gap`,
      detail: `Recover another +${input.gapPercent} percentage points before this subject reaches its target boundary.`,
      severity: (input.gapPercent ?? 0) >= 8 ? "high" : "medium",
      action: "practice",
    });
  }
  if (!input.coverageTopics || !input.evidencedTopics || input.coverage < 0.65) {
    blockers.push({
      key: "coverage",
      title: "Build syllabus proof",
      detail: !input.evidencedTopics
        ? "Untouched topics can hide a large mark gap. Get marked evidence across the specification."
        : `${Math.round(input.coverage * 100)}% average mastery leaves too much headroom for exam day.`,
      severity: !input.evidencedTopics || input.coverage < 0.45 ? "high" : "medium",
      action: "practice",
    });
  }
  if (input.retention == null || input.retention < 0.7) {
    blockers.push({
      key: "retention",
      title: "Make recall stick",
      detail: input.retention == null
        ? "There is not enough card evidence to prove the knowledge will still be available next week."
        : `Current recall is ${Math.round(input.retention * 100)}%; review due cards before adding more content.`,
      severity: input.retention != null && input.retention < 0.55 ? "high" : "medium",
      action: "review",
    });
  }
  if (input.accuracy == null || input.accuracy < 0.65) {
    blockers.push({
      key: "accuracy",
      title: "Add marked question evidence",
      detail: input.accuracy == null
        ? "The passport needs marked answers before it can trust the grade estimate."
        : `Timed accuracy is ${Math.round(input.accuracy * 100)}%; target the weakest question types next.`,
      severity: input.accuracy != null && input.accuracy < 0.55 ? "high" : "medium",
      action: "timed",
    });
  }
  if (input.paceAttempts < 3 || input.paceRatio == null) {
    blockers.push({
      key: "pace",
      title: "Prove exam pace",
      detail: "Complete three marked answers with timing recorded before trusting this subject's readiness.",
      severity: "medium",
      action: "timed",
    });
  } else if (input.paceRatio < 0.75 || input.paceRatio > 1.35) {
    blockers.push({
      key: "pace",
      title: input.paceRatio < 0.75 ? "Slow down enough to protect marks" : "Bring answers back to exam pace",
      detail: `Current pace is ${Math.round(input.paceRatio * 100)}% of the mark budget; speed and accuracy are not aligned yet.`,
      severity: input.paceRatio < 0.6 || input.paceRatio > 1.6 ? "high" : "medium",
      action: "timed",
    });
  }
  if (input.transfer == null || input.transfer < 0.6) {
    blockers.push({
      key: "transfer",
      title: "Pass an unfamiliar-context check",
      detail: input.transfer == null
        ? `${input.transferDue ? `${input.transferDue} check${input.transferDue === 1 ? "" : "s"} are due. ` : ""}Repeat-free transfer evidence is still missing.`
        : `Only ${Math.round(input.transfer * 100)}% of delayed transfer checks passed; the knowledge needs to travel further.`,
      severity: input.transfer != null && input.transfer < 0.45 ? "high" : "medium",
      action: "transfer",
    });
  }
  if (input.confidence < 0.35) {
    blockers.push({
      key: "evidence",
      title: "Collect a wider evidence base",
      detail: "This is an early estimate. More marked work across topics will make the passport trustworthy.",
      severity: "medium",
      action: "practice",
    });
  }
  const signalOrder: Record<ReadinessBlockerKey, number> = {
    target: 0,
    coverage: 1,
    accuracy: 2,
    retention: 3,
    pace: 4,
    transfer: 5,
    evidence: 6,
  };
  return blockers.sort((a, b) => (a.severity === b.severity ? signalOrder[a.key] - signalOrder[b.key] : a.severity === "high" ? -1 : 1));
}

function actionForBlocker(blocker: ExamReadinessBlocker | undefined): { label: string; action: ReadinessAction } {
  if (!blocker) return { label: "Protect this level with a timed set", action: "timed" };
  switch (blocker.action) {
    case "review":
      return { label: "Review due cards", action: "review" };
    case "timed":
      return { label: "Run a timed question set", action: "timed" };
    case "transfer":
      return { label: "Take a transfer check", action: "transfer" };
    case "practice":
      return { label: "Practise the highest-yield gap", action: "practice" };
  }
}

function readinessStatus(score: number, confidence: number, blockers: ExamReadinessBlocker[]): ExamReadinessStatus {
  if (confidence < 0.35) return "building-evidence";
  if (score >= 0.78 && confidence >= 0.65 && !blockers.some((blocker) => blocker.severity === "high")) return "ready";
  if (score >= 0.52) return "nearly-ready";
  return "at-risk";
}

function targetStatus(targetPercent: number | null, gapPercent: number | null, confidence: number): ReadinessSignalStatus {
  if (targetPercent == null) return "missing";
  if ((gapPercent ?? 0) === 0 && confidence >= 0.55) return "strong";
  if ((gapPercent ?? 0) <= 5) return "watch";
  return "at-risk";
}

function coverageStatus(value: number, topics: number, evidencedTopics: number): ReadinessSignalStatus {
  if (!topics || !evidencedTopics) return "missing";
  if (value >= 0.8) return "strong";
  if (value >= 0.6) return "watch";
  return "at-risk";
}

function retentionStatus(value: number | null): ReadinessSignalStatus {
  if (value == null) return "missing";
  if (value >= 0.85) return "strong";
  if (value >= 0.7) return "watch";
  return "at-risk";
}

function accuracyStatus(value: number | null): ReadinessSignalStatus {
  if (value == null) return "missing";
  if (value >= 0.8) return "strong";
  if (value >= 0.65) return "watch";
  return "at-risk";
}

function paceStatus(value: number | null, attempts: number): ReadinessSignalStatus {
  if (value == null || attempts < 3) return "missing";
  if (value >= 0.85 && value <= 1.15) return "strong";
  if (value >= 0.75 && value <= 1.35) return "watch";
  return "at-risk";
}

function transferStatus(value: number | null): ReadinessSignalStatus {
  if (value == null) return "missing";
  if (value >= 0.8) return "strong";
  if (value >= 0.6) return "watch";
  return "at-risk";
}

function finite01(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? clamp01(value) : null;
}

function positiveFinite(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round01(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

