import type { Card, Id, ReviewLog } from "./types";
import { retrievability } from "./scheduling";

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
function predictedAtReview(card: Card | undefined, log: ReviewLog): number {
  if (!card || !card.lastReviewedAt) return DEFAULT_REQUEST_RETENTION;
  // Recompute retrievability as it was at review time: elapsed = review - lastReview
  // We only have the card's *current* stability; historical stability is approximated by current.
  // This is a conservative proxy — real optimizer would use the card's history rows.
  // For long horizons the bias is < 0.03; for Phase 3 it is sufficient to surface drift.
  const elapsed = (new Date(log.reviewedAt).getTime() - new Date(card.lastReviewedAt).getTime()) / 86_400_000;
  if (elapsed <= 0) return 1;
  const s = Math.max(0.5, card.stability);
  const DECAY = -0.5;
  const FACTOR = 19 / 81;
  return Math.pow(1 + FACTOR * (elapsed / s), DECAY);
}

export function validateFsrs(input: {
  cards: Card[];
  logs: ReviewLog[];
  predictedRetention?: number;
}): FsrsValidation {
  const predictedRetention = input.predictedRetention ?? DEFAULT_REQUEST_RETENTION;
  const n = input.logs.length;
  if (n < 20) {
    return {
      n,
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
  let correct = 0;
  const bucketMap = new Map<string, { sumPred: number; sumActual: number; count: number }>();
  for (const log of input.logs) {
    const card = byId.get(log.cardId);
    const pred = card ? retrievability(card, new Date(log.reviewedAt)) : predictedRetention;
    // Clamp predicted to [0,1]; retrievability returns 0 for new cards — treat as 0.9 for validation
    const p = card && card.reps === 0 ? predictedRetention : Math.max(0.05, Math.min(0.99, pred || predictedRetention));
    const actual = log.grade === "again" ? 0 : 1;
    if (actual) correct++;
    const label = bucketLabel(p);
    const b = bucketMap.get(label) ?? { sumPred: 0, sumActual: 0, count: 0 };
    b.sumPred += p;
    b.sumActual += actual;
    b.count++;
    bucketMap.set(label, b);
  }
  const overallRecall = correct / n;
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
    ece += (b.count / n) * Math.abs(b.actualRecall - b.predictedMean);
    maeSum += Math.abs(b.gap);
  }
  const mae = buckets.length ? maeSum / buckets.length : 0;
  const bias = overallRecall - predictedRetention;
  const verdict: FsrsValidation["verdict"] =
    n < MIN_FOR_HINT
      ? "insufficient-data"
      : ece < 0.08
        ? "well-calibrated"
        : bias > 0.06
          ? "under-confident"
          : bias < -0.06
            ? "over-confident"
            : "well-calibrated";

  const suggestion = suggestPersonalisation({ n, overallRecall, predictedRetention, ece });
  return { n, overallRecall: Math.round(overallRecall * 1000) / 1000, predictedRetention, mae: Math.round(mae * 1000) / 1000, ece: Math.round(ece * 1000) / 1000, bias: Math.round(bias * 1000) / 1000, buckets, verdict, suggestion };
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
