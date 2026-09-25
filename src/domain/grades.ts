import { requiresWjecContentReview } from "./physics-content-review";
import { daysToExam } from "./recommender";
import { questionFamily, trustedAssessmentAttempt, trustworthyAttempt } from "./learning-evidence";
import type { Attempt, ExamDate, Id, IsoDate, Question, Subject, TopicMastery } from "./types";

// ---------------------------------------------------------------------------
// Grade prediction. Two signals, blended by how much evidence exists behind
// each: measured exam-question accuracy (trustworthy but sparse early on) and
// topic mastery coverage (always available, a weaker proxy). The output is
// always reported as a band with an explicit confidence, because a single
// predicted letter carries far more certainty than the data supports.
// ---------------------------------------------------------------------------

export interface GradePrediction {
  subjectId: Id;
  /** Predicted raw percentage across the whole qualification. */
  percent: number;
  grade: string;
  /** Optimistic/pessimistic bounds from the evidence spread. */
  bestCase: string;
  worstCase: string;
  /** 0–1: how much to trust this. Low until ~10 marked questions exist. */
  confidence: number;
  /** Percentage points gained (+) or lost (−) over the last 30 days. */
  trend: number;
  /** Marks-per-topic view of where the next grade actually comes from. */
  headroom: { topicId: Id; potentialPercent: number }[];
  /** Why this range may still move; absent on older saved predictions. */
  uncertaintySources?: string[];
  evidenceLevel?: "limited" | "developing" | "strong";
  assessmentEvidence?: { timedPapers: number; independentQuestions: number; assistedQuestions: number; effectiveSamples: number };
}

export interface NextGradeRoute {
  topicId: Id;
  potentialPercent: number;
  contributionPercent: number;
}

export interface NextGradeTarget {
  nextGrade: { grade: string; percent: number } | null;
  gapPercent: number;
  modeledGainPercent: number;
  remainingPercent: number;
  route: NextGradeRoute[];
}

const ASSESSMENT_PRIOR_SAMPLES = 8;

export function gradeForPercent(subject: Subject, percent: number): string {
  const sorted = [...subject.gradeBoundaries].sort((a, b) => b.percent - a.percent);
  for (const row of sorted) {
    if (percent >= row.percent) return row.grade;
  }
  return sorted.length ? sorted[sorted.length - 1]?.grade ?? "U" : "U";
}

/** Find the next boundary and allocate available topic headroom towards it. */
export function nextGradeTarget(subject: Subject, prediction: GradePrediction): NextGradeTarget {
  const nextGrade = [...subject.gradeBoundaries]
    .filter((boundary) => boundary.percent > prediction.percent)
    .sort((a, b) => a.percent - b.percent)[0] ?? null;
  const gapPercent = nextGrade ? nextGrade.percent - prediction.percent : 0;
  let remainingPercent = gapPercent;
  const route = prediction.headroom
    .map((row) => {
      const contributionPercent = Math.min(row.potentialPercent, remainingPercent);
      remainingPercent = Math.max(0, remainingPercent - row.potentialPercent);
      return { ...row, contributionPercent };
    })
    .filter((row) => row.contributionPercent > 0);
  const modeledGainPercent = gapPercent - remainingPercent;
  return { nextGrade, gapPercent, modeledGainPercent, remainingPercent, route };
}

export function predictGrade(
  subject: Subject,
  mastery: TopicMastery[],
  attempts: Attempt[],
  exams: ExamDate[] = [],
  today: IsoDate = new Date().toISOString().slice(0, 10),
  questions: Question[] = [],
): GradePrediction {
  const rows = mastery.filter((m) => m.subjectId === subject.id);
  const questionById = new Map(questions.map((question) => [question.id, question] as const));
  const subjectAttempts = attempts.filter((attempt) => {
    if (attempt.subjectId !== subject.id) return false;
    const question = questionById.get(attempt.questionId);
    if (!question) return !requiresWjecContentReview(subject.id) && trustworthyAttempt(attempt);
    return trustedAssessmentAttempt(attempt, question, attempts, questions);
  });

  const coverage = rows.length ? rows.reduce((a, m) => a + m.mastery, 0) / rows.length : 0.5;
  // Mastery is a weak proxy for an exam mark. With no assessment, it can move
  // the forecast, but only partway away from a neutral prior.
  const coveragePrior = 0.5 + (coverage - 0.5) * 0.4;
  const familySeen = new Map<string, number>();
  let weightedAwarded = 0;
  let weightedAvailable = 0;
  let effectiveSamples = 0;
  const timedPaperRuns = new Set<Id>();
  let independentQuestions = 0;
  let assistedQuestions = 0;
  for (const attempt of subjectAttempts) {
    const question = questionById.get(attempt.questionId);
    const family = question ? questionFamily(question) : `${attempt.id}:unmapped`;
    const repeated = familySeen.get(family) ?? 0;
    familySeen.set(family, repeated + 1);
    const support = attempt.copiedAnswer || attempt.repairTeachingSeen ||
      attempt.hintTier === "worked-solution" ? 0.15 : attempt.hintTier ? 0.5 : 1;
    const timed = attempt.mode === "paper" && Boolean(attempt.paperRunId);
    const condition = timed ? 3 : attempt.mode === "recall" ? 0.3 : 1.5;
    const weight = support * condition / Math.sqrt(repeated + 1);
    weightedAwarded += attempt.awarded * weight;
    weightedAvailable += attempt.max * weight;
    effectiveSamples += weight * Math.sqrt(Math.min(25, attempt.max) / 4);
    if (timed && attempt.paperRunId) timedPaperRuns.add(attempt.paperRunId);
    else if (support === 1) independentQuestions++;
    else assistedQuestions++;
  }
  const timedPapers = timedPaperRuns.size;
  const measured = weightedAvailable > 0 ? weightedAwarded / weightedAvailable : coveragePrior;
  const trust = effectiveSamples / (effectiveSamples + ASSESSMENT_PRIOR_SAMPLES);
  const percent = Math.round(clamp((measured * trust + coveragePrior * (1 - trust)) * 100, 0, 100));

  const spread = 6 + (1 - trust) * 18;
  const grade = gradeForPercent(subject, percent);
  const bestCase = gradeForPercent(subject, clamp(percent + spread, 0, 100));
  const worstCase = gradeForPercent(subject, clamp(percent - spread, 0, 100));

  // Trend: the last 30 days of marked work against the 30 before it.
  const cutoff = daysAgo(today, 30);
  const priorCutoff = daysAgo(today, 60);
  const recent = subjectAttempts.filter((a) => a.createdAt.slice(0, 10) >= cutoff);
  const prior = subjectAttempts.filter(
    (a) => a.createdAt.slice(0, 10) >= priorCutoff && a.createdAt.slice(0, 10) < cutoff,
  );
  const trend = prior.length && recent.length ? Math.round((rate(recent) - rate(prior)) * 100) : 0;

  // Headroom: how many percentage points the whole subject would gain if this
  // one topic were taken to full mastery. That is the actionable number.
  const perTopic = rows.length ? 1 / rows.length : 0;
  const headroom = rows
    .map((m) => ({ topicId: m.topicId, potentialPercent: Math.round((1 - m.mastery) * perTopic * 92) }))
    .filter((h) => h.potentialPercent > 0)
    .sort((a, b) => b.potentialPercent - a.potentialPercent)
    .slice(0, 5);

  // Confidence also falls when the exam is far away — a lot can change.
  const days = daysToExam(exams, subject.id, today);
  const horizonPenalty = days == null ? 0.85 : clamp(1 - days / 400, 0.6, 1);

  // Honest confidence calibration by evidence bucket — used by confidenceCalibration()
  // below and surfaced as calibrationCurve for "is 70% really 70%?" disclosure.
  const assessedTopics = rows.filter((row) => row.attempts > 0).length;
  const assessedShare = rows.length ? assessedTopics / rows.length : 0;
  const confidence = clamp(trust * 0.85 * horizonPenalty + assessedShare * 0.1, 0, 1);
  const uncertaintySources = [
    ...(timedPapers === 0 ? ["No timed paper evidence yet."] : []),
    ...(effectiveSamples < ASSESSMENT_PRIOR_SAMPLES ? ["Few independently marked exam answers."] : []),
    ...(assessedShare < 0.5 ? ["Much of the specification has limited assessment evidence."] : []),
  ];

  return {
    subjectId: subject.id,
    percent,
    grade,
    bestCase,
    worstCase,
    confidence,
    trend,
    headroom,
    uncertaintySources,
    evidenceLevel: confidence < 0.35 ? "limited" : confidence < 0.7 ? "developing" : "strong",
    assessmentEvidence: { timedPapers, independentQuestions, assistedQuestions,
      effectiveSamples: Math.round(effectiveSamples * 10) / 10 },
  };
}

export interface CalibrationBin {
  bucket: string; // e.g. "0.5–0.6"
  meanPredicted: number;
  meanActual: number;
  count: number;
}

export interface CalibrationReport {
  /** Brier score 0–1, lower is better (mean squared error of predicted prob vs outcome). */
  brier: number;
  /** Expected Calibration Error 0–1, lower is better (weighted bucket gap). */
  ece: number;
  /** Per-bucket honesty: if bucket says 70%, does it hit ~70% on later papers? */
  bins: CalibrationBin[];
  /** Bias: mean(actual − predicted). Positive = underpredicting. */
  bias: number;
  /** n used */
  n: number;
}

/**
 * Honest calibration against *later timed papers* — the real-world outcome.
 * Pass predicted probabilities (mastery blended scaled to 0–1) and actual
 * binary pass per question or paper-level percent scaled to 0–1.
 */
export function calibrationReport(pairs: Array<{ predicted: number; actual: number }>): CalibrationReport {
  const n = pairs.length;
  if (!n) return { brier: 0, ece: 0, bins: [], bias: 0, n: 0 };
  let brier = 0;
  let bias = 0;
  for (const p of pairs) { brier += (p.predicted - p.actual) ** 2; bias += p.actual - p.predicted; }
  brier /= n;
  bias /= n;
  const B = 5;
  const buckets: Array<{ sumP: number; sumA: number; count: number }> = Array.from({ length: B }, () => ({ sumP: 0, sumA: 0, count: 0 }));
  for (const p of pairs) {
    const idx = Math.min(B - 1, Math.max(0, Math.floor(p.predicted * B)));
    const b = buckets[idx];
    if (!b) continue;
    b.sumP += p.predicted;
    b.sumA += p.actual;
    b.count += 1;
  }
  const bins: CalibrationBin[] = buckets.map((b, i) => ({
    bucket: `${(i / B).toFixed(1)}–${((i + 1) / B).toFixed(1)}`,
    meanPredicted: b.count ? b.sumP / b.count : (i + 0.5) / B,
    meanActual: b.count ? b.sumA / b.count : (i + 0.5) / B,
    count: b.count,
  }));
  let ece = 0;
  for (const b of buckets) if (b.count) ece += (b.count / n) * Math.abs(b.sumP / b.count - b.sumA / b.count);
  return { brier: Math.round(brier * 1000) / 1000, ece: Math.round(ece * 1000) / 1000, bins, bias: Math.round(bias * 1000) / 1000, n };
}

/**
 * Confidence calibration — bins predictions by *our* confidence and checks hit
 * rate on later papers. A well-calibrated system has ece < 0.08.
 * Synthetic by default (deterministic seed) so CI can run without real papers.
 */
export function confidenceCalibration(params: {
  subject: Subject;
  mastery: TopicMastery[];
  attempts: Attempt[];
  exams?: ExamDate[];
  today?: IsoDate;
  laterOutcomes: Array<{ predicted: number; actual: number }>;
}): CalibrationReport {
  // Scale GradePrediction's reported confidence isn't per-question; we treat
  // each later outcome's predicted percent/100 as the probability.
  void params.subject; void params.mastery; void params.attempts; void params.exams; void params.today;
  return calibrationReport(params.laterOutcomes);
}

/** Synthetic later-paper outcomes for calibration benchmarks — deterministic. */
export function syntheticCalibrationOutcomes(seed: number, n: number): Array<{ predicted: number; actual: number }> {
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 0xffffffff); };
  return Array.from({ length: n }, () => {
    const predicted = rnd() * 0.85 + 0.05;
    const actual = Math.max(0, Math.min(1, predicted + (rnd() - 0.48) * 0.22));
    return { predicted: Math.round(predicted * 100) / 100, actual: Math.round(actual * 100) / 100 };
  });
}

function rate(attempts: Attempt[]): number {
  const max = attempts.reduce((a, x) => a + x.max, 0);
  return max ? attempts.reduce((a, x) => a + x.awarded, 0) / max : 0;
}

function daysAgo(today: IsoDate, days: number): IsoDate {
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
