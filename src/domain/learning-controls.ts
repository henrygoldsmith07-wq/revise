import type { QuestionTrace } from "./knowledge-tracing";
import { masteryIntervals } from "./mastery-uncertainty";
import type { Attempt, Card, Id, Mistake, Question, Topic, TopicMastery } from "./types";
import type { MasteryInterval } from "./mastery-uncertainty";

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// --- sparse-evidence confidence -------------------------------------------

export interface SparseEvidenceConfidenceReport {
  status: "insufficient" | "mixed" | "confident";
  confidence: number;
  totalTopics: number;
  reliableTopics: number;
  needsMoreEvidence: number;
  highUncertainty: number;
  meanIntervalWidth: number;
  intervals: MasteryInterval[];
  narrative: string;
}

/** Summarise the uncertainty around topic mastery without inventing evidence. */
export function sparseEvidenceConfidence(input: {
  topics: Topic[];
  mastery: TopicMastery[];
  cards: Card[];
  attempts: Attempt[];
  mistakes: Mistake[];
  now?: Date;
}): SparseEvidenceConfidenceReport {
  const masteryByTopic = new Map(input.mastery.map((row) => [row.topicId, row.mastery]));
  const cardsByTopic = new Map<Id, Card[]>();
  const attemptsByTopic = new Map<Id, Attempt[]>();
  const mistakesByTopic = new Map<Id, Mistake[]>();

  for (const card of input.cards) {
    const rows = cardsByTopic.get(card.topicId) ?? [];
    rows.push(card);
    cardsByTopic.set(card.topicId, rows);
  }
  for (const attempt of input.attempts) {
    for (const topicId of attempt.topicIds) {
      const rows = attemptsByTopic.get(topicId) ?? [];
      rows.push(attempt);
      attemptsByTopic.set(topicId, rows);
    }
  }
  for (const mistake of input.mistakes) {
    const rows = mistakesByTopic.get(mistake.topicId) ?? [];
    rows.push(mistake);
    mistakesByTopic.set(mistake.topicId, rows);
  }

  const intervals = masteryIntervals({ masteryByTopic, cardsByTopic, attemptsByTopic, mistakesByTopic, now: input.now });
  const totalTopics = intervals.length;
  const reliableTopics = intervals.filter((row) => !row.needsMoreEvidence).length;
  const needsMoreEvidence = intervals.filter((row) => row.needsMoreEvidence).length;
  const highUncertainty = intervals.filter((row) => row.uncertainty === "high").length;
  const meanIntervalWidth = totalTopics
    ? round(intervals.reduce((sum, row) => sum + row.width, 0) / totalTopics)
    : 1;
  const confidence = round(clamp01(1 - meanIntervalWidth));
  const status: SparseEvidenceConfidenceReport["status"] = !totalTopics || !reliableTopics
    ? "insufficient"
    : reliableTopics / totalTopics >= 0.7 && meanIntervalWidth < 0.35
      ? "confident"
      : "mixed";
  const narrative = !totalTopics
    ? "No topic evidence yet — complete a review or marked question to start a personal baseline."
    : status === "insufficient"
      ? `${needsMoreEvidence} topic${needsMoreEvidence === 1 ? " needs" : "s need"} more evidence before mastery estimates are dependable.`
      : status === "mixed"
        ? `${highUncertainty} topic${highUncertainty === 1 ? " has" : "s have"} wide uncertainty intervals — treat the point estimates as provisional.`
        : "Most topic estimates have enough, consistent evidence to guide revision priorities.";

  return {
    status,
    confidence,
    totalTopics,
    reliableTopics,
    needsMoreEvidence,
    highUncertainty,
    meanIntervalWidth,
    intervals,
    narrative,
  };
}

// --- prediction vs outcome + calibration curves --------------------------

export interface PredictionOutcomePair {
  groupId: Id;
  subjectId: Id;
  predictedMarks: number;
  actualMarks: number;
  marksAvailable: number;
  date: string;
}

export interface CalibrationCurveBin {
  index: number;
  label: string;
  count: number;
  predicted: number;
  actual: number;
  gap: number;
  reliable: boolean;
}

export interface PredictionOutcomeReport {
  status: "insufficient" | "calibrated" | "underpredicting" | "overpredicting";
  reliable: boolean;
  n: number;
  predictedMarks: number;
  actualMarks: number;
  marksAvailable: number;
  predictedRate: number | null;
  actualRate: number | null;
  mae: number | null;
  bias: number | null;
  correlation: number | null;
  curve: CalibrationCurveBin[];
  pairs: PredictionOutcomePair[];
  narrative: string;
}

interface TopicPrior {
  awarded: number;
  max: number;
}

function groupKey(attempt: Attempt): string {
  return attempt.paperRunId ?? attempt.paperId ?? attempt.id;
}

function priorRate(topicIds: Id[], prior: Map<Id, TopicPrior>): number {
  const rates = topicIds
    .map((topicId) => prior.get(topicId))
    .filter((row): row is TopicPrior => Boolean(row && row.max > 0))
    .map((row) => row.awarded / row.max);
  return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0.4;
}

/** Build paper-level predictions from evidence available before each paper. */
export function buildPredictionOutcomePairs(input: { attempts: Attempt[]; questions: Question[] }): PredictionOutcomePair[] {
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const grouped = new Map<string, Attempt[]>();
  for (const attempt of input.attempts.filter((row) => row.mode === "paper")) {
    const key = `${attempt.subjectId}:${groupKey(attempt)}`;
    const rows = grouped.get(key) ?? [];
    rows.push(attempt);
    grouped.set(key, rows);
  }

  const groups = [...grouped.values()].sort(
    (a, b) => a[0]!.createdAt.localeCompare(b[0]!.createdAt) || a[0]!.id.localeCompare(b[0]!.id),
  );
  const prior = new Map<Id, TopicPrior>();
  const pairs: PredictionOutcomePair[] = [];

  for (const group of groups) {
    let predictedMarks = 0;
    let actualMarks = 0;
    let marksAvailable = 0;
    for (const attempt of group) {
      const question = questionsById.get(attempt.questionId);
      const available = attempt.max > 0 ? attempt.max : question?.totalMarks ?? 0;
      if (available <= 0) continue;
      const topicIds = [...new Set(question?.topicIds.length ? question.topicIds : attempt.topicIds)];
      const baseRate = priorRate(topicIds, prior);
      const difficultyAdjustment = question ? (question.difficulty - 3) * 0.03 : 0;
      const predictedRate = clamp01(Math.max(0.2, Math.min(0.95, 0.35 + baseRate * 0.6 - difficultyAdjustment)));
      predictedMarks += available * predictedRate;
      actualMarks += Math.max(0, Math.min(available, attempt.awarded));
      marksAvailable += available;
    }
    if (marksAvailable <= 0) continue;

    const first = group[0]!;
    pairs.push({
      groupId: groupKey(first),
      subjectId: first.subjectId,
      predictedMarks: round(predictedMarks, 2),
      actualMarks: round(actualMarks, 2),
      marksAvailable: round(marksAvailable, 2),
      date: first.createdAt,
    });

    // Update only after the complete paper so a question cannot predict itself.
    for (const attempt of group) {
      const question = questionsById.get(attempt.questionId);
      const available = attempt.max > 0 ? attempt.max : question?.totalMarks ?? 0;
      if (available <= 0) continue;
      const topicIds = [...new Set(question?.topicIds.length ? question.topicIds : attempt.topicIds)];
      for (const topicId of topicIds) {
        const row = prior.get(topicId) ?? { awarded: 0, max: 0 };
        row.awarded += Math.max(0, Math.min(available, attempt.awarded)) / Math.max(1, topicIds.length);
        row.max += available / Math.max(1, topicIds.length);
        prior.set(topicId, row);
      }
    }
  }
  return pairs;
}

export function calibrationCurve(pairs: PredictionOutcomePair[], binCount = 5): CalibrationCurveBin[] {
  const bins = Array.from({ length: Math.max(1, binCount) }, (_, index) => ({
    index,
    predicted: 0,
    actual: 0,
    count: 0,
  }));
  for (const pair of pairs) {
    if (pair.marksAvailable <= 0) continue;
    const predicted = clamp01(pair.predictedMarks / pair.marksAvailable);
    const actual = clamp01(pair.actualMarks / pair.marksAvailable);
    const index = Math.min(bins.length - 1, Math.floor(predicted * bins.length));
    const bin = bins[index]!;
    bin.predicted += predicted;
    bin.actual += actual;
    bin.count += 1;
  }
  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => {
      const predicted = round(bin.predicted / bin.count);
      const actual = round(bin.actual / bin.count);
      const lower = Math.round((bin.index / bins.length) * 100);
      const upper = Math.round(((bin.index + 1) / bins.length) * 100);
      return {
        index: bin.index,
        label: `${lower}–${upper}% predicted`,
        count: bin.count,
        predicted,
        actual,
        gap: round(actual - predicted),
        reliable: bin.count >= 3,
      };
    });
}

export function predictionOutcomeReport(pairs: PredictionOutcomePair[]): PredictionOutcomeReport {
  const valid = pairs.filter((pair) => pair.marksAvailable > 0);
  const marksAvailable = valid.reduce((sum, pair) => sum + pair.marksAvailable, 0);
  const predictedMarks = valid.reduce((sum, pair) => sum + pair.predictedMarks, 0);
  const actualMarks = valid.reduce((sum, pair) => sum + pair.actualMarks, 0);
  const predictedRates = valid.map((pair) => pair.predictedMarks / pair.marksAvailable);
  const actualRates = valid.map((pair) => pair.actualMarks / pair.marksAvailable);
  const predictedRate = marksAvailable ? round(predictedMarks / marksAvailable) : null;
  const actualRate = marksAvailable ? round(actualMarks / marksAvailable) : null;
  const mae = valid.length ? round(valid.reduce((sum, pair) => sum + Math.abs((pair.actualMarks - pair.predictedMarks) / pair.marksAvailable), 0) / valid.length) : null;
  const bias = predictedRate != null && actualRate != null ? round(actualRate - predictedRate) : null;
  const meanPredicted = predictedRates.length ? predictedRates.reduce((sum, value) => sum + value, 0) / predictedRates.length : 0;
  const meanActual = actualRates.length ? actualRates.reduce((sum, value) => sum + value, 0) / actualRates.length : 0;
  let numerator = 0;
  let predictedVariance = 0;
  let actualVariance = 0;
  for (let i = 0; i < predictedRates.length; i++) {
    numerator += (predictedRates[i]! - meanPredicted) * (actualRates[i]! - meanActual);
    predictedVariance += (predictedRates[i]! - meanPredicted) ** 2;
    actualVariance += (actualRates[i]! - meanActual) ** 2;
  }
  const correlation = predictedVariance && actualVariance
    ? round(numerator / Math.sqrt(predictedVariance * actualVariance), 2)
    : null;
  const reliable = valid.length >= 3;
  const status: PredictionOutcomeReport["status"] = !reliable
    ? "insufficient"
    : Math.abs(bias ?? 0) <= 0.05
      ? "calibrated"
      : (bias ?? 0) > 0
        ? "underpredicting"
        : "overpredicting";
  const narrative = !valid.length
    ? "Complete a timed paper to measure predictions against an actual outcome."
    : !reliable
      ? `${valid.length} outcome${valid.length === 1 ? "" : "s"} recorded — three are needed before calibration is trusted.`
      : status === "calibrated"
        ? "Predicted and actual paper performance are currently close."
        : status === "underpredicting"
          ? "Actual performance is ahead of the prediction; the baseline is too pessimistic."
          : "Actual performance is below the prediction; the baseline is too optimistic.";

  return {
    status,
    reliable,
    n: valid.length,
    predictedMarks: round(predictedMarks, 1),
    actualMarks: round(actualMarks, 1),
    marksAvailable: round(marksAvailable, 1),
    predictedRate,
    actualRate,
    mae,
    bias,
    correlation,
    curve: calibrationCurve(valid),
    pairs: valid,
    narrative,
  };
}

// --- adaptive question difficulty ----------------------------------------

export interface AdaptiveDifficultyRow {
  questionId: Id;
  subjectId: Id;
  authoredDifficulty: number;
  empiricalDifficulty: number;
  targetDifficulty: number;
  attempts: number;
  successRate: number | null;
  reliable: boolean;
  action: "stretch" | "consolidate" | "hold" | "insufficient";
}

export interface AdaptiveDifficultyReport {
  status: "insufficient" | "stable" | "adapting";
  stretch: number;
  consolidate: number;
  hold: number;
  rows: AdaptiveDifficultyRow[];
  narrative: string;
}

function clampDifficulty(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

export function adaptiveDifficultyCalibration(input: {
  questions: Question[];
  traces: QuestionTrace[];
}): AdaptiveDifficultyReport {
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const rows = input.traces
    .map((trace): AdaptiveDifficultyRow | null => {
      const question = questionsById.get(trace.questionId);
      if (!question) return null;
      const action: AdaptiveDifficultyRow["action"] = !trace.reliable || trace.successRate == null
        ? "insufficient"
        : trace.successRate >= 0.8
          ? "stretch"
          : trace.successRate <= 0.45
            ? "consolidate"
            : "hold";
      const targetDifficulty = action === "stretch"
        ? clampDifficulty(question.difficulty + 1)
        : action === "consolidate"
          ? clampDifficulty(question.difficulty - 1)
          : question.difficulty;
      return {
        questionId: trace.questionId,
        subjectId: trace.subjectId,
        authoredDifficulty: question.difficulty,
        empiricalDifficulty: trace.empiricalDifficulty,
        targetDifficulty,
        attempts: trace.attempts,
        successRate: trace.successRate,
        reliable: trace.reliable,
        action,
      };
    })
    .filter((row): row is AdaptiveDifficultyRow => row !== null)
    .sort((a, b) => {
      const order = { consolidate: 0, stretch: 1, hold: 2, insufficient: 3 };
      return order[a.action] - order[b.action] || a.questionId.localeCompare(b.questionId);
    });
  const stretch = rows.filter((row) => row.action === "stretch").length;
  const consolidate = rows.filter((row) => row.action === "consolidate").length;
  const hold = rows.filter((row) => row.action === "hold").length;
  const reliable = rows.filter((row) => row.reliable).length;
  const status: AdaptiveDifficultyReport["status"] = !reliable ? "insufficient" : stretch || consolidate ? "adapting" : "stable";
  const narrative = !reliable
    ? "Answer at least five questions per item before adapting difficulty." 
    : stretch || consolidate
      ? `${stretch} item${stretch === 1 ? "" : "s"} can stretch up and ${consolidate} need${consolidate === 1 ? "s" : ""} an easier consolidation step.`
      : "Current item difficulty is holding; continue mixing levels.";
  return { status, stretch, consolidate, hold, rows, narrative };
}
