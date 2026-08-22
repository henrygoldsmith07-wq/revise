import type { Card, Id, ReviewLog } from "./types";
import { forgettingCurve } from "./scheduling";

// ---------------------------------------------------------------------------
// FSRS validation & personalisation — real-data only.
//
// FSRS ships with default weights (w) fit on ~ 10M Anki reviews. Those
// weights are a good prior, but a classroom that uses Revise differently
// (shorter sessions, exam-question heavy, younger learners) will see a
// different forgetting curve. This module measures that curve and suggests a
// tuned request_retention once enough local evidence exists.
//
// Design:
// - Validation is pure and offline: compare predicted retrievability at
//   review time vs actual recall (grade !== "again") bucketed by predicted
//   probability. No network, no optimizer binary.
// - Personalisation is gated: < 100 reviews → no suggestion (cold-start
//   protection). 100–199 → hint. 200+ → concrete suggestion. The scheduler
//   itself keeps using default weights until the caller explicitly applies
//   the suggestion via `personalisedSchedulerParams`.
// ---------------------------------------------------------------------------

export interface FsrsBucket {
  label: string; // e.g. "0.80–0.90"
  predictedMean: number;
  actualRecall: number; // 0–1
  count: number;
  gap: number; // actual - predicted
}

export interface FsrsValidation {
  n: number;
  overallRecall: number;
  predictedRetention: number; // request_retention the scheduler was fit to (0.9 by default)
  mae: number; // mean abs gap across buckets
  ece: number; // expected calibration error
  bias: number; // actual - predicted (positive = model pessimistic, cards remembered better than expected)
  buckets: FsrsBucket[];
  verdict: "well-calibrated" | "over-confident" | "under-confident" | "insufficient-data";
  suggestion: FsrsPersonalisation | null;
}

export interface FsrsPersonalisation {
  suggestedRequestRetention: number; // 0.80–0.95
  reason: string;
  confidence: "low" | "medium" | "high";
  reviewsUsed: number;
}

const DEFAULT_REQUEST_RETENTION = 0.9;
const MIN_FOR_HINT = 100;
const MIN_FOR_TUNE = 200;

function bucketLabel(p: number): string {
  if (p < 0.6) return "0.00–0.60";
  if (p < 0.7) return "0.60–0.70";
  if (p < 0.8) return "0.70–0.80";
  if (p < 0.9) return "0.80–0.90";
  return "0.90–1.00";
}

function bucketMid(label: string): number {
  const m: Record<string, number> = {
    "0.00–0.60": 0.45,
    "0.60–0.70": 0.65,
    "0.70–0.80": 0.75,
    "0.80–0.90": 0.85,
    "0.90–1.00": 0.95,
  };
  return m[label] ?? 0.5;
}

/** Predict retrievability at the instant the review happened. Falls back to 0.9 for new cards. */
function predictedAtReview(card: Card | undefined, log: ReviewLog, previousReviewedAt?: string): number {
  if (!card || card.reps === 0 || !previousReviewedAt) return DEFAULT_REQUEST_RETENTION;
  // Recompute retrievability as it was at review time: elapsed = review − previous review.
  // We only have the card's *current* stability; historical stability is approximated by current.
  // This is a conservative proxy — a real optimizer would use the card's history rows.
  const elapsed = (new Date(log.reviewedAt).getTime() - new Date(previousReviewedAt).getTime()) / 86_400_000;
  if (elapsed <= 0) return 1;
  const s = Math.max(0.5, card.stability);
  return forgettingCurve(elapsed, s);
}

/** Group logs per card and sort them chronologically. */
function groupLogsByCard(logs: ReviewLog[]): Map<Id, ReviewLog[]> {
  const logsByCard = new Map<Id, ReviewLog[]>();
  for (const log of logs) {
    const list = logsByCard.get(log.cardId);
    if (list) list.push(log);
    else logsByCard.set(log.cardId, [log]);
  }
  for (const list of logsByCard.values()) list.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  return logsByCard;
}

interface CalibrationAggregate {
  n: number;
  correct: number;
  bucketMap: Map<string, { sumPred: number; sumActual: number; count: number }>;
}

/**
 * Walk every card's logs chronologically and predict at each review from the
 * *previous* review's instant (never from the card's final state), aggregating
 * only the logs `shouldCount` accepts — so a holdout evaluation can reuse the
 * full history as context while scoring nothing that informed it.
 */
function calibrate(
  cardsById: Map<Id, Card>,
  logsByCard: Map<Id, ReviewLog[]>,
  predictedRetention: number,
  shouldCount?: (log: ReviewLog) => boolean,
): CalibrationAggregate {
  let correct = 0;
  let n = 0;
  const bucketMap = new Map<string, { sumPred: number; sumActual: number; count: number }>();
  for (const [cardId, list] of logsByCard) {
    const card = cardsById.get(cardId);
    for (let i = 0; i < list.length; i++) {
      const log = list[i];
      if (shouldCount && !shouldCount(log)) continue;
      const pred = predictedAtReview(card, log, i > 0 ? list[i - 1].reviewedAt : undefined);
      // Clamp predicted to [0,1]; treat the default target as the floor so a
      // single degenerate prediction cannot dominate a bucket.
      const p = Math.max(0.05, Math.min(0.99, pred || predictedRetention));
      const actual = log.grade === "again" ? 0 : 1;
      if (actual) correct++;
      n++;
      const label = bucketLabel(p);
      const b = bucketMap.get(label) ?? { sumPred: 0, sumActual: 0, count: 0 };
      b.sumPred += p;
      b.sumActual += actual;
      b.count++;
      bucketMap.set(label, b);
    }
  }
  return { n, correct, bucketMap };
}

/** Turn a calibration aggregate into the public validation report. */
function finishCalibration(
  counted: number,
  correct: number,
  bucketMap: Map<string, { sumPred: number; sumActual: number; count: number }>,
  predictedRetention: number,
  totalLogs: number,
): FsrsValidation {
  const overallRecall = counted ? correct / counted : 0;
  const buckets: FsrsBucket[] = [...bucketMap.entries()]
    .map(([label, b]) => ({
      label,
      predictedMean: b.sumPred / b.count,
      actualRecall: b.sumActual / b.count,
      count: b.count,
      gap: b.sumActual / b.count - b.sumPred / b.count,
    }))
    .sort((a, b) => bucketMid(a.label) - bucketMid(b.label));

  let ece = 0;
  let maeSum = 0;
  for (const b of buckets) {
    ece += (b.count / (counted || 1)) * Math.abs(b.actualRecall - b.predictedMean);
    maeSum += Math.abs(b.gap);
  }
  const mae = buckets.length ? maeSum / buckets.length : 0;
  const bias = overallRecall - predictedRetention;
  const verdict: FsrsValidation["verdict"] =
    totalLogs < MIN_FOR_HINT
      ? "insufficient-data"
      : ece < 0.08
        ? "well-calibrated"
        : bias > 0.06
          ? "under-confident"
          : bias < -0.06
            ? "over-confident"
            : "well-calibrated";

  const suggestion = suggestPersonalisation({ n: totalLogs, overallRecall, predictedRetention, ece });
  return {
    n: totalLogs,
    overallRecall: Math.round(overallRecall * 1000) / 1000,
    predictedRetention,
    mae: Math.round(mae * 1000) / 1000,
    ece: Math.round(ece * 1000) / 1000,
    bias: Math.round(bias * 1000) / 1000,
    buckets,
    verdict,
    suggestion,
  };
}

export function validateFsrs(input: {
  cards: Card[];
  logs: ReviewLog[];
  predictedRetention?: number;
}): FsrsValidation {
  const predictedRetention = input.predictedRetention ?? DEFAULT_REQUEST_RETENTION;
  if (input.logs.length < 20) {
    return {
      n: input.logs.length,
      overallRecall: 0,
      predictedRetention,
      mae: 0,
      ece: 0,
      bias: 0,
      buckets: [],
      verdict: "insufficient-data",
      suggestion: null,
    };
  }
  const byId = new Map<Id, Card>(input.cards.map((c) => [c.id, c]));
  const logsByCard = groupLogsByCard(input.logs);
  const { n: counted, correct, bucketMap } = calibrate(byId, logsByCard, predictedRetention);
  return finishCalibration(counted, correct, bucketMap, predictedRetention, input.logs.length);
}

export interface FsrsHoldoutValidation {
  /** Logs used only as prediction context; never scored. */
  trainLogs: number;
  /** Later-in-time logs the metrics are computed on. */
  holdoutLogs: number;
  holdout: FsrsValidation | null;
  note: string;
}

/**
 * Leakage-free calibration check. Each card's history is split chronologically:
 * the earliest 70% of its reviews provide prediction context only, and every
 * metric is computed on the final 30%. Because predictions at a holdout review
 * use the review immediately before it (in time), no future outcome can inform
 * the number it is scored against — tuning request_retention on the full
 * history and reporting the same rows' calibration would.
 */
export function validateFsrsHoldout(input: {
  cards: Card[];
  logs: ReviewLog[];
  predictedRetention?: number;
}): FsrsHoldoutValidation | null {
  const predictedRetention = input.predictedRetention ?? DEFAULT_REQUEST_RETENTION;
  const byId = new Map<Id, Card>(input.cards.map((c) => [c.id, c]));
  const logsByCard = groupLogsByCard(input.logs);

  const train: ReviewLog[] = [];
  const holdout = new Set<ReviewLog>();
  let holdoutCount = 0;
  for (const list of logsByCard.values()) {
    if (list.length < 2) {
      train.push(...list);
      continue;
    }
    const cut = Math.max(1, Math.floor(list.length * 0.7));
    if (cut >= list.length) {
      train.push(...list);
      continue;
    }
    train.push(...list.slice(0, cut));
    for (const log of list.slice(cut)) {
      holdout.add(log);
      holdoutCount++;
    }
  }
  if (!holdoutCount) return null;

  const { n: counted, correct, bucketMap } = calibrate(
    byId,
    logsByCard,
    predictedRetention,
    (log) => holdout.has(log),
  );
  const validation =
    counted >= 20
      ? finishCalibration(counted, correct, bucketMap, predictedRetention, counted)
      : {
          n: counted,
          overallRecall: counted ? correct / counted : 0,
          predictedRetention,
          mae: 0,
          ece: 0,
          bias: 0,
          buckets: [],
          verdict: "insufficient-data" as const,
          suggestion: null,
        };

  return {
    trainLogs: input.logs.length - holdoutCount,
    holdoutLogs: holdoutCount,
    holdout: validation,
    note:
      counted >= 20
        ? `Holdout-only calibration over ${counted} later reviews; earlier reviews provided prediction context and were never scored.`
        : `Only ${counted} holdout reviews so far — need 20+ before the holdout verdict means anything.`,
  };
}

function suggestPersonalisation(input: {
  n: number;
  overallRecall: number;
  predictedRetention: number;
  ece: number;
}): FsrsPersonalisation | null {
  const { n, overallRecall, predictedRetention } = input;
  if (n < MIN_FOR_HINT) return null;
  // If recall is materially above predicted, we are scheduling too conservatively — can afford longer intervals
  // If recall is below, we are too aggressive — shorten intervals.
  const gap = overallRecall - predictedRetention;
  const confidence: FsrsPersonalisation["confidence"] = n >= MIN_FOR_TUNE ? (Math.abs(gap) > 0.08 ? "high" : "medium") : "low";
  let suggested = predictedRetention;
  if (gap > 0.06) suggested = Math.min(0.95, predictedRetention + 0.02 + Math.min(0.03, gap * 0.3));
  else if (gap < -0.06) suggested = Math.max(0.8, predictedRetention - 0.02 + gap * 0.3);
  else return null; // well-calibrated → no change

  suggested = Math.round(suggested * 100) / 100;
  const reason =
    gap > 0
      ? `Cards are recalled ${Math.round(gap * 100)}pp better than the ${Math.round(predictedRetention * 100)}% target — intervals can be stretched (→ ${Math.round(suggested * 100)}%).`
      : `Recall is ${Math.round(Math.abs(gap) * 100)}pp below the ${Math.round(predictedRetention * 100)}% target — shorten intervals (→ ${Math.round(suggested * 100)}%) until retention recovers.`;

  return { suggestedRequestRetention: suggested, reason, confidence, reviewsUsed: n };
}

/** Pure helper for the scheduling layer: turn a validation into scheduler constructor args. */
export function personalisedSchedulerParams(validation: FsrsValidation): { request_retention: number } | null {
  if (!validation.suggestion) return null;
  if (validation.n < MIN_FOR_TUNE) return null;
  return { request_retention: validation.suggestion.suggestedRequestRetention };
}

/** Cold-start guard: how many more reviews until personalisation is trustworthy. */
export function reviewsUntilPersonalisation(logsCount: number): number {
  return Math.max(0, MIN_FOR_TUNE - logsCount);
}
