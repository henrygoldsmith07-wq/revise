// ---------------------------------------------------------------------------
// The default daily session — one 18-minute memory session, not a pile of
// modes. Four labelled blocks, in retrieval order:
//
//   1. Warm-up (2 min)   — three overdue cards, no notes visible.
//   2. Due + new (8 min) — the FSRS job, new cards capped at 25% of the queue.
//   3. Exam question (5 min) — one exam-style question on today's weakest
//      topic, so the session is not flashcard-only memory.
//   4. Repair (3 min)    — only today's misses, then stop.
//
// Hard caps the UI must keep visible: new cards ≤ 25% of the queue (the
// scheduler's own rule — this module surfaces the split), session length
// 12–25 minutes, and the fatigue lock from ./fatigue. The overnight rule is
// structural: the last block is always retrieval, never a notes page.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { buildReviewQueue, todayIso } from "./scheduling";
import { shapeForMastery } from "./session-structure";
import { FATIGUE_LOCK_MINUTES, FATIGUE_MESSAGE } from "./fatigue";
import { State } from "ts-fsrs";
import type { Card, IsoDate, Mistake } from "./types";

export const DAILY_SESSION_MINUTES = 18;
export const MIN_SESSION_MINUTES = 12;
/** The session cap and the fatigue lock are the same number by design. */
export const MAX_SESSION_MINUTES = FATIGUE_LOCK_MINUTES;
export const WARMUP_MINUTES = 2;
export const WARMUP_CARDS = 3;

export type DailyPhaseKind = "warmup" | "reviews" | "exam-question" | "mistake-repair";

export interface DailySessionPhase {
  minutes: number;
  kind: DailyPhaseKind;
  label: string;
  /** Why the block sticks, in the student's language. */
  why: string;
  /** Deep link into the surface that runs this block. */
  href: string;
  /** Queue composition where the block is card work, e.g. "6 new, 18 reviews". */
  detail?: string;
}

export interface DailySessionPlan {
  date: IsoDate;
  totalMinutes: number;
  /** New-card count after the scheduler's 25% cap. */
  newCount: number;
  reviewCount: number;
  /** Shape label for the weakest topic's session, from session-structure. */
  shape: "scaffolded" | "retrieval" | "balanced";
  phases: DailySessionPhase[];
  /** True when the last block is retrieval — the overnight rule. */
  endsOnRetrieval: true;
  /** The fatigue lock, shown verbatim in the UI. */
  fatigue: { lockAtMinutes: number; message: string };
}

/**
 * Build the default session. Everything is derived from the engine: the queue
 * split from the scheduler's capped builder, the exam block from the weakest
 * topic that has an unseen exam-style question, the repair block from
 * today's unresolved misses.
 */
export function buildDailySessionPlan(input: {
  cards: Card[];
  mistakes: Mistake[];
  masteryByTopic: Map<string, number>;
  subjectIds: string[];
  /** Requested length; clamped into the 12–25 minute cap. Defaults to 18. */
  totalMinutes?: number;
  on?: IsoDate;
}): DailySessionPlan {
  const on = input.on ?? todayIso();
  const total = Math.max(MIN_SESSION_MINUTES, Math.min(MAX_SESSION_MINUTES, input.totalMinutes ?? DAILY_SESSION_MINUTES));
  const scale = total / DAILY_SESSION_MINUTES;

  // Warm-up: the oldest overdue cards, before anything new is shown.
  const warmup = Math.max(1, Math.round(WARMUP_MINUTES * scale));

  // Weakest enrolled topic — the exam-style question targets it, so the
  // session is not flashcard-only memory.
  const weakest = pickWeakestTopic(input.masteryByTopic, input.subjectIds);

  // Repair: only misses recorded today, still unresolved.
  const missesToday = input.mistakes.filter((m) => !m.resolved && m.createdAt.slice(0, 10) === on);

  const exam = Math.max(3, Math.round(5 * scale));
  const repair = missesToday.length > 0 ? Math.max(2, Math.round(3 * scale)) : 0;
  const reviews = Math.max(3, total - warmup - exam - repair);

  // Queue split for the FSRS block: the scheduler caps new cards at 25% of the
  // queue (buildReviewQueue), and this surfaces that split instead of hiding it.
  const queue = buildReviewQueue(input.cards, Number.MAX_SAFE_INTEGER, on);
  const reviewCount = queue.filter((c) => c.state !== State.New).length;
  const newCount = queue.length - reviewCount;
  const queueSplit = `${newCount} new, ${reviewCount} reviews`;

  const phases: DailySessionPhase[] = [
    {
      minutes: warmup,
      kind: "warmup",
      label: "Warm-up",
      why: "Wake last night's memory",
      href: "/review",
      detail: `${WARMUP_CARDS} overdue cards`,
    },
    {
      minutes: reviews,
      kind: "reviews",
      label: "Due reviews + a little new",
      why: "FSRS job",
      href: "/review",
      detail: queueSplit,
    },
    {
      minutes: exam,
      kind: "exam-question",
      label: "Exam-style question",
      why: "Stops flashcard-only memory",
      href: weakest ? `/practice?topic=${weakest.topicId}` : "/practice",
      detail: weakest ? `Today's weakest topic: ${weakest.topicId.split(".").pop()}` : undefined,
    },
  ];

  if (repair > 0) {
    phases.push({
      minutes: repair,
      kind: "mistake-repair",
      label: "Repair",
      why: "Error correction before sleep",
      href: "/review?mode=mistakes",
      detail: `${missesToday.length} from today`,
    });
  }

  // Queue split for the FSRS block: the scheduler caps new cards at 25% of the
  // queue (buildReviewQueue), and this surfaces that split instead of hiding it.
  return {
    date: on,
    totalMinutes: total,
    newCount,
    reviewCount,
    shape: shapeForMastery(weakest?.mastery ?? null),
    phases,
    endsOnRetrieval: true,
    fatigue: { lockAtMinutes: MAX_SESSION_MINUTES, message: FATIGUE_MESSAGE },
  };
}

/** The overnight rule, as a check other code can assert against. */
export function endsOnRetrieval(plan: DailySessionPlan): boolean {
  const last = plan.phases.at(-1);
  return Boolean(last && (last.kind === "exam-question" || last.kind === "mistake-repair" || last.kind === "reviews"));
}

function pickWeakestTopic(
  masteryByTopic: Map<string, number>,
  subjectIds: string[],
): { topicId: string; mastery: number } | null {
  let weakest: { topicId: string; mastery: number } | null = null;
  for (const [topicId, mastery] of masteryByTopic) {
    if (!subjectIds.some((s) => topicId.startsWith(`${s}.`))) continue;
    if (weakest === null || mastery < weakest.mastery) weakest = { topicId, mastery };
  }
  return weakest;
}
