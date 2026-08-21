import { easeFactor } from "./browser";
import { isDue, retrievability, todayIso, MASTERED_STABILITY_DAYS } from "./scheduling";
import type { Card, Id, IsoDate, RecallGrade, ReviewLog } from "./types";

// ---------------------------------------------------------------------------
// Per-card and per-deck statistics.
//
// The number that matters most here is **true retention** — the share of
// reviews the student actually got right — because it is the only honest check
// on whether FSRS's 90% target is being met in practice. If true retention is
// far below target the intervals are too long; far above and they are too
// short and time is being wasted. Predicted retrievability is a model output;
// true retention is measurement.
// ---------------------------------------------------------------------------

export interface CardStats {
  cardId: Id;
  /** SM-2-shaped ease derived from FSRS difficulty, for familiarity. */
  ease: number;
  difficulty: number;
  stability: number;
  reps: number;
  lapses: number;
  /** Current interval in days (last review → due). */
  intervalDays: number;
  /** Predicted probability of recall right now. */
  retention: number;
  /** Share of this card's own reviews that were not "again". */
  trueRetention: number | null;
  /** Median seconds spent per review. Median, because one interrupted review
   *  otherwise dominates the mean. */
  medianSeconds: number | null;
  totalSeconds: number;
  firstReviewedAt: string | null;
  lastReviewedAt: string | null;
  /** Ordered oldest → newest, for the sparkline. */
  history: { reviewedAt: string; grade: RecallGrade; seconds: number }[];
  state: "new" | "learning" | "review" | "mastered" | "leech" | "suspended" | "buried";
}

export function cardState(card: Card, on: IsoDate = todayIso()): CardStats["state"] {
  if (card.suspended) return "suspended";
  if (card.buriedUntil && card.buriedUntil > on) return "buried";
  if (card.lapses >= 4) return "leech";
  if (card.reps === 0) return "new";
  if (card.stability >= MASTERED_STABILITY_DAYS) return "mastered";
  if (card.stability < 7) return "learning";
  return "review";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function cardStats(card: Card, logs: ReviewLog[], now: Date = new Date()): CardStats {
  const own = logs
    .filter((l) => l.cardId === card.id)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));

  const intervalDays = card.lastReviewedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(`${card.due}T00:00:00Z`).getTime() - new Date(card.lastReviewedAt).getTime()) /
            86_400_000,
        ),
      )
    : 0;

  const seconds = own.map((l) => l.elapsedMs / 1000);
  const recalled = own.filter((l) => l.grade !== "again").length;

  return {
    cardId: card.id,
    ease: easeFactor(card),
    difficulty: card.difficulty,
    stability: card.stability,
    reps: card.reps,
    lapses: card.lapses,
    intervalDays,
    retention: retrievability(card, now),
    trueRetention: own.length ? recalled / own.length : null,
    medianSeconds: median(seconds),
    totalSeconds: seconds.reduce((a, b) => a + b, 0),
    firstReviewedAt: own[0]?.reviewedAt ?? null,
    lastReviewedAt: own[own.length - 1]?.reviewedAt ?? card.lastReviewedAt,
    history: own.map((l) => ({ reviewedAt: l.reviewedAt, grade: l.grade, seconds: l.elapsedMs / 1000 })),
    state: cardState(card),
  };
}

export interface DeckStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  review: number;
  mastered: number;
  leeches: number;
  suspended: number;
  buried: number;
  /** Mean of the per-card FSRS ease. */
  averageEase: number;
  averageStability: number;
  averageDifficulty: number;
  /** Measured across every review log in scope, not per card. */
  trueRetention: number | null;
  reviewsTotal: number;
  /** Hours of review time recorded. */
  hoursStudied: number;
  gradeMix: Record<RecallGrade, number>;
}

export function deckStats(cards: Card[], logs: ReviewLog[], on: IsoDate = todayIso()): DeckStats {
  const ids = new Set(cards.map((c) => c.id));
  const scoped = logs.filter((l) => ids.has(l.cardId));
  const gradeMix: Record<RecallGrade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const log of scoped) gradeMix[log.grade]++;

  const counted = { new: 0, learning: 0, review: 0, mastered: 0, leech: 0, suspended: 0, buried: 0 };
  for (const card of cards) counted[cardState(card, on)]++;

  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const recalled = scoped.filter((l) => l.grade !== "again").length;

  return {
    total: cards.length,
    due: cards.filter((c) => isDue(c, on)).length,
    new: counted.new,
    learning: counted.learning,
    review: counted.review,
    mastered: counted.mastered,
    leeches: counted.leech,
    suspended: counted.suspended,
    buried: counted.buried,
    averageEase: Math.round(mean(cards.map(easeFactor)) * 100) / 100,
    averageStability: Math.round(mean(cards.map((c) => c.stability)) * 10) / 10,
    averageDifficulty: Math.round(mean(cards.map((c) => c.difficulty)) * 10) / 10,
    trueRetention: scoped.length ? recalled / scoped.length : null,
    reviewsTotal: scoped.length,
    hoursStudied: Math.round((scoped.reduce((a, l) => a + l.elapsedMs, 0) / 3_600_000) * 10) / 10,
    gradeMix,
  };
}

/**
 * How the measured retention compares with the 90% FSRS targets, in words.
 * Students cannot act on a bare percentage; they can act on "intervals are too
 * long".
 */
export function retentionVerdict(trueRetention: number | null, reviews: number): string {
  if (trueRetention == null || reviews < 20) {
    return "Not enough reviews yet to judge whether your intervals are right.";
  }
  const percent = Math.round(trueRetention * 100);
  if (trueRetention < 0.8) {
    return `${percent}% recall — below the 90% target. You are seeing cards too late; expect more lapses until stability catches up.`;
  }
  if (trueRetention < 0.87) {
    return `${percent}% recall — slightly under the 90% target, which is normal while a deck is still young.`;
  }
  if (trueRetention <= 0.94) {
    return `${percent}% recall — right on the 90% target. Your intervals are well calibrated.`;
  }
  return `${percent}% recall — above target. You are reviewing more often than you need to, which costs time without adding retention.`;
}
