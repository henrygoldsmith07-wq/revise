import type { Attempt, Id, Mistake, Question } from "./types";

/** The minimum question count before calculation performance is called reliable. */
export const CALCULATION_MASTERY_MIN_ATTEMPTS = 5;
export const CALCULATION_TREND_WINDOW = 5;
export const CALCULATION_SECURE_THRESHOLD = 0.8;

export type CalculationMasteryStatus = "insufficient" | "developing" | "secure";

export interface CalculationPerformance {
  attempts: number;
  marksAwarded: number;
  marksAvailable: number;
  accuracy: number | null;
}

export interface CalculationTopicMastery extends CalculationPerformance {
  topicId: Id;
  subjectId: Id;
  reliable: boolean;
  status: CalculationMasteryStatus;
}

export interface CalculationErrorPattern {
  key: string;
  label: string;
  marksLost: number;
  occurrences: number;
}

export interface CalculationMasteryReport extends CalculationPerformance {
  reliable: boolean;
  status: CalculationMasteryStatus;
  minimumAttempts: number;
  recent: CalculationPerformance;
  previous: CalculationPerformance;
  /** Difference between the recent and previous accuracy windows. */
  trend: number | null;
  calculator: CalculationPerformance;
  noCalculator: CalculationPerformance;
  byTopic: CalculationTopicMastery[];
  errorPatterns: CalculationErrorPattern[];
  nextAction: string;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function emptyPerformance(): CalculationPerformance {
  return { attempts: 0, marksAwarded: 0, marksAvailable: 0, accuracy: null };
}

function performanceOf(attempts: number, marksAwarded: number, marksAvailable: number): CalculationPerformance {
  const available = round(Math.max(0, marksAvailable));
  const awarded = round(Math.max(0, Math.min(available, marksAwarded)));
  return {
    attempts,
    marksAwarded: awarded,
    marksAvailable: available,
    accuracy: available > 0 ? round(awarded / available) : null,
  };
}

function addPerformance(target: { attempts: number; marksAwarded: number; marksAvailable: number }, attempt: Attempt, question: Question, divisor = 1) {
  const marksAvailable = attempt.max > 0 ? attempt.max : question.totalMarks;
  if (marksAvailable <= 0) return;
  const marksAwarded = Math.max(0, Math.min(marksAvailable, attempt.awarded));
  target.attempts += 1;
  target.marksAvailable += marksAvailable / divisor;
  target.marksAwarded += marksAwarded / divisor;
}

function statusFor(performance: CalculationPerformance): CalculationMasteryStatus {
  if (performance.attempts < CALCULATION_MASTERY_MIN_ATTEMPTS) return "insufficient";
  return (performance.accuracy ?? 0) >= CALCULATION_SECURE_THRESHOLD ? "secure" : "developing";
}

function errorKey(mistake: Mistake): string {
  if (mistake.misconception && mistake.misconception !== "other") return mistake.misconception;
  if (mistake.category !== "unclassified") return mistake.category;
  return mistake.misconception ?? mistake.category;
}

const ERROR_LABELS: Record<string, string> = {
  arithmetic: "Arithmetic slips",
  units: "Units",
  "significant-figures": "Significant figures",
  rearrangement: "Rearrangement",
  "substitution-slips": "Substitution slips",
  "graph-reading": "Graph reading",
  "method-skipped": "Method skipped",
  "misread-command": "Misread command",
  terminology: "Terminology",
  conceptual: "Conceptual error",
  other: "Other",
  unclassified: "Unclassified",
};

function performanceForAttempts(attempts: Array<{ attempt: Attempt; question: Question }>): CalculationPerformance {
  const totals = { attempts: 0, marksAwarded: 0, marksAvailable: 0 };
  for (const row of attempts) addPerformance(totals, row.attempt, row.question);
  return performanceOf(totals.attempts, totals.marksAwarded, totals.marksAvailable);
}

/** Derive calculation-only performance from the existing question and attempt history. */
export function calculateCalculationMastery(input: {
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
}): CalculationMasteryReport {
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const calculationAttempts = input.attempts
    .map((attempt) => ({ attempt, question: questionsById.get(attempt.questionId) }))
    .filter((row): row is { attempt: Attempt; question: Question } => row.question?.kind === "calculation")
    .filter(({ attempt, question }) => (attempt.max > 0 ? attempt.max : question.totalMarks) > 0)
    .sort((a, b) => a.attempt.createdAt.localeCompare(b.attempt.createdAt) || a.attempt.id.localeCompare(b.attempt.id));

  const overallTotals = { attempts: 0, marksAwarded: 0, marksAvailable: 0 };
  const calculatorTotals = { attempts: 0, marksAwarded: 0, marksAvailable: 0 };
  const noCalculatorTotals = { attempts: 0, marksAwarded: 0, marksAvailable: 0 };
  const topicTotals = new Map<Id, { subjectId: Id; attempts: number; marksAwarded: number; marksAvailable: number }>();

  for (const row of calculationAttempts) {
    addPerformance(overallTotals, row.attempt, row.question);
    addPerformance(row.question.calculatorAllowed ? calculatorTotals : noCalculatorTotals, row.attempt, row.question);

    const topicIds = [...new Set(row.question.topicIds.length ? row.question.topicIds : row.attempt.topicIds)];
    for (const topicId of topicIds) {
      const topic = topicTotals.get(topicId) ?? { subjectId: row.question.subjectId, attempts: 0, marksAwarded: 0, marksAvailable: 0 };
      addPerformance(topic, row.attempt, row.question, topicIds.length);
      topicTotals.set(topicId, topic);
    }
  }

  const overall = performanceOf(overallTotals.attempts, overallTotals.marksAwarded, overallTotals.marksAvailable);
  const recentRows = calculationAttempts.slice(-CALCULATION_TREND_WINDOW);
  const previousRows = calculationAttempts.length >= CALCULATION_TREND_WINDOW * 2
    ? calculationAttempts.slice(-CALCULATION_TREND_WINDOW * 2, -CALCULATION_TREND_WINDOW)
    : [];
  const recent = performanceForAttempts(recentRows);
  const previous = performanceForAttempts(previousRows);
  const trend = recent.accuracy != null && previous.accuracy != null ? round(recent.accuracy - previous.accuracy) : null;

  const byTopic = [...topicTotals.entries()]
    .map(([topicId, totals]) => {
      const performance = performanceOf(totals.attempts, totals.marksAwarded, totals.marksAvailable);
      return {
        topicId,
        subjectId: totals.subjectId,
        ...performance,
        reliable: performance.attempts >= CALCULATION_MASTERY_MIN_ATTEMPTS,
        status: statusFor(performance),
      } satisfies CalculationTopicMastery;
    })
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.marksAvailable - a.marksAvailable || a.topicId.localeCompare(b.topicId));

  const calculationAttemptIds = new Set(calculationAttempts.map(({ attempt }) => attempt.id));
  const calculationQuestionIds = new Set(calculationAttempts.map(({ question }) => question.id));
  const errors = new Map<string, { marksLost: number; occurrences: number }>();
  for (const mistake of input.mistakes) {
    const belongsToCalculation =
      (mistake.questionId != null && calculationQuestionIds.has(mistake.questionId)) ||
      (mistake.attemptId != null && calculationAttemptIds.has(mistake.attemptId));
    if (!belongsToCalculation) continue;
    const key = errorKey(mistake);
    const current = errors.get(key) ?? { marksLost: 0, occurrences: 0 };
    current.marksLost += Math.max(0, mistake.marksLost);
    current.occurrences += 1;
    errors.set(key, current);
  }
  const errorPatterns = [...errors.entries()]
    .map(([key, value]) => ({ key, label: ERROR_LABELS[key] ?? key, ...value }))
    .sort((a, b) => b.marksLost - a.marksLost || b.occurrences - a.occurrences || a.key.localeCompare(b.key));

  const reliable = overall.attempts >= CALCULATION_MASTERY_MIN_ATTEMPTS;
  const status = statusFor(overall);
  const nextAction = !overall.attempts
    ? `Complete ${CALCULATION_MASTERY_MIN_ATTEMPTS} calculation questions to establish a baseline.`
    : !reliable
      ? `Complete ${CALCULATION_MASTERY_MIN_ATTEMPTS - overall.attempts} more calculation question${overall.attempts === CALCULATION_MASTERY_MIN_ATTEMPTS - 1 ? "" : "s"} before judging mastery.`
      : trend != null && trend <= -0.1
        ? "Recent calculation accuracy is falling — use a short mixed set and check every final line."
        : (overall.accuracy ?? 0) < 0.55
          ? "Prioritise the most common calculation error, then retest it on a similar question."
          : "Keep a mixed calculation set in revision so method and accuracy stay secure.";

  return {
    ...overall,
    reliable,
    status,
    minimumAttempts: CALCULATION_MASTERY_MIN_ATTEMPTS,
    recent,
    previous,
    trend,
    calculator: performanceOf(calculatorTotals.attempts, calculatorTotals.marksAwarded, calculatorTotals.marksAvailable),
    noCalculator: performanceOf(noCalculatorTotals.attempts, noCalculatorTotals.marksAwarded, noCalculatorTotals.marksAvailable),
    byTopic,
    errorPatterns,
    nextAction,
  };
}
