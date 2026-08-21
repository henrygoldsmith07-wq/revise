import type { HumanMarkingCorpus, HumanMarkingEvaluator } from "./human-marking-corpus";
import type { Id } from "./types";

export const MARKER_IDS = ["human", "rubric", "ai"] as const;
export type MarkerId = (typeof MARKER_IDS)[number];

export const MARKER_PAIRS = [
  { id: "human-vs-rubric", left: "human", right: "rubric" },
  { id: "human-vs-ai", left: "human", right: "ai" },
  { id: "rubric-vs-ai", left: "rubric", right: "ai" },
] as const satisfies ReadonlyArray<{ id: string; left: MarkerId; right: MarkerId }>;

export type MarkerPairId = (typeof MARKER_PAIRS)[number]["id"];

export type MarkerAwards = Partial<Record<MarkerId, readonly number[]>>;

export interface MarkerDisagreementSample {
  rowId: Id;
  questionId: Id;
  label: string;
  awards: MarkerAwards;
}

export interface MarkerPairDisagreement {
  comparedParts: number;
  disagreementCount: number;
  partAgreement: number | null;
  meanAbsoluteDifference: number | null;
  signedBias: number | null;
  maxAbsoluteDifference: number | null;
  totalDifference: number;
  totalAgreement: boolean;
}

export interface MarkerDisagreementRow {
  rowId: Id;
  questionId: Id;
  label: string;
  awards: MarkerAwards;
  pairs: Partial<Record<MarkerPairId, MarkerPairDisagreement>>;
}

export interface MarkerDisagreementMetric {
  pair: MarkerPairId;
  left: MarkerId;
  right: MarkerId;
  comparedRows: number;
  totalAgreement: number | null;
  comparedParts: number;
  partAgreement: number | null;
  disagreementCount: number;
  meanAbsoluteDifference: number | null;
  signedBias: number | null;
  maxAbsoluteDifference: number | null;
}

export interface MarkerDisagreementReport {
  corpusId?: Id;
  corpusVersion?: string;
  rows: MarkerDisagreementRow[];
  metrics: MarkerDisagreementMetric[];
}

export type AutomatedMarkerEvaluator = Partial<Record<Exclude<MarkerId, "human">, HumanMarkingEvaluator>>;

interface MetricAccumulator {
  comparedRows: number;
  totalAgreementCount: number;
  comparedParts: number;
  partAgreementCount: number;
  disagreementCount: number;
  absoluteDifferenceTotal: number;
  signedDifferenceTotal: number;
  maxAbsoluteDifference: number;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function compareAwards(left: readonly number[], right: readonly number[]): MarkerPairDisagreement {
  const comparedParts = Math.max(left.length, right.length);
  const differences = Array.from({ length: comparedParts }, (_, index) => ({
    absolute: Math.abs((right[index] ?? 0) - (left[index] ?? 0)),
    signed: (right[index] ?? 0) - (left[index] ?? 0),
  }));
  const disagreementCount = differences.filter((difference) => difference.absolute > 0).length;
  const absoluteDifferenceTotal = differences.reduce((total, difference) => total + difference.absolute, 0);
  const signedDifferenceTotal = differences.reduce((total, difference) => total + difference.signed, 0);

  return {
    comparedParts,
    disagreementCount,
    partAgreement: comparedParts ? (comparedParts - disagreementCount) / comparedParts : null,
    meanAbsoluteDifference: comparedParts ? absoluteDifferenceTotal / comparedParts : null,
    signedBias: comparedParts ? signedDifferenceTotal / comparedParts : null,
    maxAbsoluteDifference: comparedParts ? Math.max(...differences.map((difference) => difference.absolute)) : null,
    totalDifference: sum(right) - sum(left),
    totalAgreement: sum(left) === sum(right),
  };
}

function emptyAccumulator(): MetricAccumulator {
  return {
    comparedRows: 0,
    totalAgreementCount: 0,
    comparedParts: 0,
    partAgreementCount: 0,
    disagreementCount: 0,
    absoluteDifferenceTotal: 0,
    signedDifferenceTotal: 0,
    maxAbsoluteDifference: 0,
  };
}

export function trackMarkerDisagreement(samples: readonly MarkerDisagreementSample[]): MarkerDisagreementReport {
  const accumulators = new Map<MarkerPairId, MetricAccumulator>(
    MARKER_PAIRS.map((pair) => [pair.id, emptyAccumulator()]),
  );

  const rows = samples.map((sample): MarkerDisagreementRow => {
    const pairs: Partial<Record<MarkerPairId, MarkerPairDisagreement>> = {};

    for (const pair of MARKER_PAIRS) {
      const left = sample.awards[pair.left];
      const right = sample.awards[pair.right];
      if (left === undefined || right === undefined) continue;

      const result = compareAwards(left, right);
      pairs[pair.id] = result;
      const accumulator = accumulators.get(pair.id)!;
      accumulator.comparedRows += 1;
      accumulator.totalAgreementCount += result.totalAgreement ? 1 : 0;
      accumulator.comparedParts += result.comparedParts;
      accumulator.partAgreementCount += result.comparedParts - result.disagreementCount;
      accumulator.disagreementCount += result.disagreementCount;
      accumulator.absoluteDifferenceTotal += result.meanAbsoluteDifference === null
        ? 0
        : result.meanAbsoluteDifference * result.comparedParts;
      accumulator.signedDifferenceTotal += result.signedBias === null
        ? 0
        : result.signedBias * result.comparedParts;
      accumulator.maxAbsoluteDifference = Math.max(
        accumulator.maxAbsoluteDifference,
        result.maxAbsoluteDifference ?? 0,
      );
    }

    return { ...sample, pairs };
  });

  const metrics = MARKER_PAIRS.map((pair): MarkerDisagreementMetric => {
    const accumulator = accumulators.get(pair.id)!;
    return {
      pair: pair.id,
      left: pair.left,
      right: pair.right,
      comparedRows: accumulator.comparedRows,
      totalAgreement: accumulator.comparedRows
        ? accumulator.totalAgreementCount / accumulator.comparedRows
        : null,
      comparedParts: accumulator.comparedParts,
      partAgreement: accumulator.comparedParts
        ? accumulator.partAgreementCount / accumulator.comparedParts
        : null,
      disagreementCount: accumulator.disagreementCount,
      meanAbsoluteDifference: accumulator.comparedParts
        ? accumulator.absoluteDifferenceTotal / accumulator.comparedParts
        : null,
      signedBias: accumulator.comparedParts
        ? accumulator.signedDifferenceTotal / accumulator.comparedParts
        : null,
      maxAbsoluteDifference: accumulator.comparedParts ? accumulator.maxAbsoluteDifference : null,
    };
  });

  return { rows, metrics };
}

export function scoreMarkerDisagreement(
  corpus: HumanMarkingCorpus,
  evaluators: AutomatedMarkerEvaluator = {},
): MarkerDisagreementReport {
  const samples = corpus.rows.map((row): MarkerDisagreementSample => {
    const awards: MarkerAwards = { human: row.humanAwards };
    for (const marker of ["rubric", "ai"] as const) {
      const evaluator = evaluators[marker];
      if (evaluator) {
        awards[marker] = evaluator(row.question, row.answers).marked.map((part) => part.awarded);
      }
    }
    return {
      rowId: row.id,
      questionId: row.question.id,
      label: row.label,
      awards,
    };
  });

  return {
    ...trackMarkerDisagreement(samples),
    corpusId: corpus.id,
    corpusVersion: corpus.version,
  };
}
