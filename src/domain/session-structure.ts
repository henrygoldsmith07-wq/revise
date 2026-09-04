// ---------------------------------------------------------------------------
// Session structure builder — turns a single recommendation into a
// multi-phase session plan with timed segments matched to the student's
// mastery level. A weak topic gets scaffolding (explanation → easy →
// application); a strong-but-stale topic gets retrieval and transfer only.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export interface SessionSegment {
  /** Minutes allocated to this segment. */
  minutes: number;
  kind: "warmup" | "explanation" | "easy-retrieval" | "targeted-questions" | "application" | "transfer" | "mistake-repair" | "delayed-retrieval";
  label: string;
}

export interface SessionStructure {
  topicId: Id;
  totalMinutes: number;
  segments: SessionSegment[];
  /** "scaffolded" for weak topics, "retrieval" for strong-but-stale, "balanced" otherwise. */
  shape: "scaffolded" | "retrieval" | "balanced";
}

/**
 * Build a structured session from a recommendation's context.
 *
 * Mastery drives the shape:
 *   < 0.35   scaffolded — explanation first, easy questions, build up
 *   0.35–0.7 balanced — targeted questions, some application
 *   > 0.7    retrieval — hard retrieval + transfer, skip basics
 */
/** The shape a topic's mastery earns — exposed so session UIs can label blocks. */
export function shapeForMastery(mastery: number | null): SessionStructure["shape"] {
  const m = mastery ?? 0;
  if (m < 0.35) return "scaffolded";
  if (m >= 0.7) return "retrieval";
  return "balanced";
}

export function buildSessionStructure(input: {
  topicId: Id;
  mastery: number | null;
  totalMinutes: number;
  hasMistakes?: boolean;
}): SessionStructure {  const { topicId, mastery, totalMinutes } = input;
  const m = mastery ?? 0;
  const segments: SessionSegment[] = [];

  if (m < 0.35) {
    // Scaffolded: explanation → easy retrieval → application → exam question.
    const warmup = clamp(Math.round(totalMinutes * 0.15), 1, 4);
    const explain = clamp(Math.round(totalMinutes * 0.25), 2, Math.max(2, totalMinutes - warmup - 2));
    const easy = clamp(Math.round(totalMinutes * 0.25), 2, Math.max(1, totalMinutes - warmup - explain - 2));
    const app = Math.max(2, totalMinutes - warmup - explain - easy);
    if (input.hasMistakes) {
      segments.push({ minutes: warmup, kind: "mistake-repair", label: "Fix last mistakes" });
    }
    segments.push(
      { minutes: explain, kind: "explanation", label: "Read the explanation" },
      { minutes: easy, kind: "easy-retrieval", label: "Easy retrieval questions" },
      { minutes: app, kind: "application", label: "Application questions" },
    );
    // Clamp so the sum never exceeds the budget.
    const sum1 = segments.reduce((a, sg) => a + sg.minutes, 0);
    if (sum1 > totalMinutes) {
      const last = segments[segments.length - 1];
      last.minutes = Math.max(1, last.minutes - (sum1 - totalMinutes));
    }
    return { topicId, totalMinutes, segments, shape: "scaffolded" };
  }

  if (m >= 0.7) {
    // Retrieval: warm-up → transfer question → done.
    const warm = clamp(Math.round(totalMinutes * 0.3), 2, Math.max(2, totalMinutes - 3));
    const transfer = Math.max(3, totalMinutes - warm);
    segments.push(
      { minutes: warm, kind: "warmup", label: "Quick retrieval warm-up" },
      { minutes: transfer, kind: "transfer", label: "Transfer / exam-level question" },
    );
    // Optional delayed-retrieval closer if there's room (subtract from transfer).
    if (totalMinutes >= 12) {
      const close = clamp(Math.round(totalMinutes * 0.15), 1, 3);
      const lastTransfer = segments[segments.length - 1];
      lastTransfer.minutes = Math.max(3, lastTransfer.minutes - close);
      segments.push({ minutes: close, kind: "delayed-retrieval", label: "Delayed retrieval check" });
    }
    return { topicId, totalMinutes, segments, shape: "retrieval" };
  }

  // Balanced: targeted questions → mistake repair → delayed retrieval.
  const target = clamp(Math.round(totalMinutes * 0.5), 3, totalMinutes - 3);
  const repair = input.hasMistakes ? clamp(Math.round(totalMinutes * 0.25), 2, Math.max(1, totalMinutes - target)) : 0;
  const delayed = Math.max(2, totalMinutes - target - repair);
  segments.push({ minutes: target, kind: "targeted-questions", label: "Targeted questions" });
  if (repair > 0) segments.push({ minutes: repair, kind: "mistake-repair", label: "Repair mistakes" });
  segments.push({ minutes: delayed, kind: "delayed-retrieval", label: "Delayed retrieval" });

  const balSum = segments.reduce((a, sg) => a + sg.minutes, 0);
  if (balSum > totalMinutes) {
    const last = segments[segments.length - 1];
    last.minutes = Math.max(1, last.minutes - (balSum - totalMinutes));
  }
  return { topicId, totalMinutes, segments, shape: "balanced" };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Today's review session — "15–25 minutes of due cards, then stop."
//
// The Today view must never present the whole queue as a dashboard. It sizes
// one bounded session from the day's due cards and stops: no spec-point
// totals, no "everything you owe" listing. Seconds-per-card matches the
// /review queue builder's own 2.5 cards/minute so what Today promises is
// exactly what /review runs.
// ---------------------------------------------------------------------------

/** One review card ≈ 24 s, matching buildReviewQueue's ~2.5 cards per minute. */
export const REVIEW_SECONDS_PER_CARD = 24;

export interface DueSessionSize {
  /** Cards in today's session (never more than the day's due count). */
  cards: number;
  /** Whole minutes the session will take, floored at 1. */
  minutes: number;
  /** Every enrolled card due right now, uncapped. */
  totalDue: number;
  /** True when the session is a slice of a larger due queue. */
  capped: boolean;
}

/**
 * Size today's session from the raw due count. The target is the student's
 * session length (default 20 minutes); the session never exceeds what is
 * actually due, so a light day is a light session, and the day never runs
 * longer than the target even when the queue is huge.
 */
export function sizeDueSession(
  totalDue: number,
  opts: { targetMinutes?: number } = {},
): DueSessionSize {
  const targetMinutes = clamp(Math.round(opts.targetMinutes ?? 20), 1, 60);
  const due = Math.max(0, totalDue);
  if (due === 0) return { cards: 0, minutes: 0, totalDue: 0, capped: false };
  const maxCards = Math.max(1, Math.round((targetMinutes * 60) / REVIEW_SECONDS_PER_CARD));
  const cards = Math.min(due, maxCards);
  const minutes = Math.max(1, Math.round((cards * REVIEW_SECONDS_PER_CARD) / 60));
  return { cards, minutes, totalDue: due, capped: cards < due };
}
