// ---------------------------------------------------------------------------
// Grade-prediction loop — longitudinal honesty about predicted grades.
//
// Predictions are snapshotted over time (percent, grade, confidence interval,
// evidence share); actual mocks/papers close the loop. analyseGradeLoop()
// pairs each actual with the LATEST prediction made before it (as-of join,
// so a better later prediction cannot retroactively fix an earlier miss)
// and reports MAE, bias, calibration bins, confidence-interval coverage and
// breakdowns by distance-from-exam, subject and evidence amount.
//
// The narrative says the quiet part loudly: low evidence means low
// confidence - "predicted B" is never dressed up as precision.
// ---------------------------------------------------------------------------

import type { Id, IsoDate, IsoInstant } from "./types";

export interface GradePredictionRecord {
  id: Id;
  anonId: string;
  subjectId: Id;
  /** Point prediction as a percentage (76 = 76 %). */
  predictedPercent: number;
  /** Confidence interval bounds on the same percentage scale. */
  lowerPercent: number;
  upperPercent: number;
  gradeLabel: string;
  /** Marker self-confidence 0..1 at snapshot time. */
  confidence: number;
  /** Share of assessed specification points completed when predicting. */
  evidenceShare: number;
  createdAt: IsoInstant;
  examDate?: IsoDate | null;
}

export interface ActualResultRecord {
  id: Id;
  anonId: string;
  subjectId: Id;
  percent: number;
  label?: string;
  kind: "mock" | "paper" | "final";
  takenAt: IsoInstant;
}

export interface PredictionOutcome {
  actualId: Id;
  predictionId: Id;
  subjectId: Id;
  predictedPercent: number;
  actualPercent: number;
  error: number; // actual − predicted (positive = under-predicted)
  insideInterval: boolean;
  daysBeforeExam: number | null;
  evidenceShare: number;
}

export interface CalibrationRow {
  range: string;
  pairs: number;
  meanPredicted: number;
  meanActual: number;
}

export interface GroupAccuracy {
  key: string;
  pairs: number;
  mae: number;
  bias: number;
}

export interface GradeLoopReport {
  predictionsStored: number;
  actualsStored: number;
  pairs: number;
  mae: number | null;
  bias: number | null; // mean(actual − predicted); positive = Revise under-predicts
  intervalCoverage: number | null; // share of actuals landing inside their CI
  calibration: CalibrationRow[];
  byDistance: { within30Days: GroupAccuracy; days31to90: GroupAccuracy; beyond90Days: GroupAccuracy; unknown: GroupAccuracy };
  bySubject: GroupAccuracy[];
  byEvidence: { under25: GroupAccuracy; quarterTo60: GroupAccuracy; over60: GroupAccuracy };
  insufficientData: boolean;
  note: string;
}

const MIN_PAIRS = 5;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** As-of join: latest prediction per subject created before the actual. */
export function pairPredictionsWithActuals(
  predictions: GradePredictionRecord[],
  actuals: ActualResultRecord[],
): PredictionOutcome[] {
  const out: PredictionOutcome[] = [];
  for (const actual of [...actuals].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
    const takenAt = new Date(actual.takenAt).getTime();
    const candidates = predictions.filter(
      (p) => p.anonId === actual.anonId && p.subjectId === actual.subjectId && new Date(p.createdAt).getTime() <= takenAt,
    );
    if (!candidates.length) continue;
    const latest = candidates.reduce((best, p) =>
      new Date(p.createdAt).getTime() > new Date(best.createdAt).getTime() ? p : best,
    );
    // Days-before-exam is measured from the PREDICTION date, not the actual
    // date — "how accurate are predictions made 90 days out?" refers to when
    // the prediction was made, not when the exam was sat.
    const daysBeforeExam =
      latest.examDate != null
        ? Math.round((new Date(latest.examDate).getTime() - new Date(latest.createdAt).getTime()) / 86_400_000)
        : null;
    out.push({
      actualId: actual.id,
      predictionId: latest.id,
      subjectId: actual.subjectId,
      predictedPercent: latest.predictedPercent,
      actualPercent: actual.percent,
      error: round(actual.percent - latest.predictedPercent),
      insideInterval:
        actual.percent >= latest.lowerPercent && actual.percent <= latest.upperPercent,
      daysBeforeExam,
      evidenceShare: latest.evidenceShare,
    });
  }
  return out;
}

function groupAccuracy(pairs: PredictionOutcome[], key: string): GroupAccuracy {
  const n = pairs.length;
  return {
    key,
    pairs: n,
    mae: n ? round(pairs.reduce((acc, p) => acc + Math.abs(p.error), 0) / n) : null as unknown as number,
    bias: n ? round(pairs.reduce((acc, p) => acc + p.error, 0) / n) : null as unknown as number,
  };
}
function inRange(value: number, lo: number, hiInclusive: number): boolean {
  return value >= lo && value <= hiInclusive;
}

export function analyseGradeLoop(input: {
  predictions: GradePredictionRecord[];
  actuals: ActualResultRecord[];
}): GradeLoopReport {
  const outcomes = pairPredictionsWithActuals(input.predictions, input.actuals);
  const n = outcomes.length;
  const mae = n ? round(outcomes.reduce((acc, p) => acc + Math.abs(p.error), 0) / n) : null;
  const bias = n ? round(outcomes.reduce((acc, p) => acc + p.error, 0) / n) : null;
  const coverage = n ? round(outcomes.filter((p) => p.insideInterval).length / n) : null;

  // Calibration bins on predicted deciles.
  const ranges: Array<[number, number]> = [
    [0, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 90], [90, 101],
  ];
  const calibration: CalibrationRow[] = ranges.map(([lo, hi]) => {
    const bin = outcomes.filter((p) => inRange(p.predictedPercent, lo, hi - 1));
    return {
      range: `${lo}–${hi - 1}`,
      pairs: bin.length,
      meanPredicted: bin.length ? round(bin.reduce((a, p) => a + p.predictedPercent, 0) / bin.length) : null as unknown as number,
      meanActual: bin.length ? round(bin.reduce((a, p) => a + p.actualPercent, 0) / bin.length) : null as unknown as number,
    };
  });

  
  const makeGroups = (keyFn: (p: PredictionOutcome) => string): Record<string, GroupAccuracy> => {
    const groups: Record<string, PredictionOutcome[]> = {};
    for (const p of outcomes) {
      const k = keyFn(p);
      (groups[k] ??= []).push(p);
    }
    return Object.fromEntries(Object.entries(groups).map(([k, list]) => [k, groupAccuracy(list, k)]));
  };

  const byDistanceRaw = makeGroups((p) => {
    if (p.daysBeforeExam == null) return "unknown";
    if (p.daysBeforeExam > 90) return "beyond90Days";
    if (p.daysBeforeExam <= 30) return "within30Days";
    return "days31to90";
  });
  const byDistance = {
    within30Days: byDistanceRaw.within30Days ?? groupAccuracy([], "within30Days"),
    days31to90: byDistanceRaw.days31to90 ?? groupAccuracy([], "days31to90"),
    beyond90Days: byDistanceRaw.beyond90Days ?? groupAccuracy([], "beyond90Days"),
    unknown: byDistanceRaw.unknown ?? groupAccuracy([], "unknown"),
  };

  const subjects = new Map<string, number>();
  for (const p of outcomes) subjects.set(p.subjectId, (subjects.get(p.subjectId) ?? 0) + 1);
  const bySubject = [...subjects.entries()]
    .map(([subjectId]) => groupAccuracy(outcomes.filter((p) => p.subjectId === subjectId), subjectId))
    .sort((a, b) => b.pairs - a.pairs);

  const evidenceRaw = makeGroups((p) =>
    p.evidenceShare < 0.25 ? "under25" : p.evidenceShare <= 0.6 ? "quarterTo60" : "over60",
  );
  const byEvidence = {
    under25: evidenceRaw.under25 ?? groupAccuracy([], "under25"),
    quarterTo60: evidenceRaw.quarterTo60 ?? groupAccuracy([], "quarterTo60"),
    over60: evidenceRaw.over60 ?? groupAccuracy([], "over60"),
  };

  const sufficient = n >= MIN_PAIRS;
  return {
    predictionsStored: input.predictions.length,
    actualsStored: input.actuals.length,
    pairs: n,
    mae,
    bias,
    intervalCoverage: coverage,
    calibration,
    byDistance,
    bySubject,
    byEvidence,
    insufficientData: !sufficient,
    note: sufficient
      ? `${n} predicted→actual pairs across ${bySubject.length} ${bySubject.length === 1 ? "subject" : "subjects"}.`
      : `Only ${n} closed loop${n === 1 ? "" : "s"} so far — percentages become meaningful from five pairs.`,
  };
}

// --- narrative -----------------------------------------------------------------

/**
 * Honest phrasing for the current prediction: low evidence says so, instead
 * of dressing a guess up as precision.
 */
export function gradeConfidenceNarrative(prediction: {
  gradeLabel: string;
  confidence: number;
  evidenceShare: number;
}): string {
  const sharePct = Math.round(prediction.evidenceShare * 100);
  if (prediction.confidence < 0.5 || prediction.evidenceShare < 0.25) {
    return `Your predicted grade is currently ${prediction.gradeLabel}, but confidence is low because you've completed only ${sharePct}% of assessed specification points.`;
  }
  if (prediction.confidence < 0.75 || prediction.evidenceShare < 0.6) {
    return `Your predicted grade is currently ${prediction.gradeLabel}, and confidence is building — ${sharePct}% of assessed specification points have evidence behind them.`;
  }
  return `Your predicted grade is currently ${prediction.gradeLabel} with high confidence — ${sharePct}% of assessed specification points are covered.`;
}
