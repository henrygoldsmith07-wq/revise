// ---------------------------------------------------------------------------
// Exam countdown — the strategy is not constant across the run-up.
//
// Far from an exam the right move is breadth: learn untouched topics, keep
// reviews current. As the date closes in the bottleneck becomes exam
// technique — timed papers and weak-topic retests earn more than opening new
// content. In the final days the honest strategy is the opposite of cramming:
// no new first passes, light recall, sleep. This module names those phases,
// their day boundaries, and the planner knobs each phase sets, so the
// scheduler (and the schedule UI) change behaviour as the countdown moves.
//
//   foundation     > 42 days  — learn broadly, keep cards current
//   application    15–42 days — weak-topic exam questions + recall
//   technique       4–14 days — timed papers intensify, no drift
//   final           0–3 days  — light recall only, no new content
//
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

export const APPLICATION_DAYS = 42;
export const TECHNIQUE_DAYS = 14;
export const FINAL_DAYS = 3;

export type CountdownPhase = "foundation" | "application" | "technique" | "final";

export interface CountdownGuidance {
  phase: CountdownPhase;
  /** Days to the exam (null = no exam date on the horizon). */
  days: number | null;
  /** Short pill label. */
  label: string;
  /** Plain sentence describing what the strategy is now. */
  strategy: string;
  /**
   * Planner: how often a non-opener block becomes a timed paper
   * (every Nth block; 0 = never in this phase).
   */
  paperCadence: number;
  /** Planner: whether first-pass learning on untouched topics is allowed. */
  allowFirstPass: boolean;
}

/** The strategy that applies N days out. Days ≤ 0 are exam day itself. */
export function countdownGuidance(days: number | null): CountdownGuidance {
  if (days == null) {
    return {
      phase: "foundation",
      days: null,
      label: "Foundation",
      strategy: "No exam date on the horizon — learn broadly and keep your cards current.",
      paperCadence: 0,
      allowFirstPass: true,
    };
  }
  if (days > APPLICATION_DAYS) {
    return {
      phase: "foundation",
      days,
      label: "Foundation",
      strategy: "Six or more weeks out — build breadth: learn untouched topics and keep reviews current.",
      paperCadence: 0,
      allowFirstPass: true,
    };
  }
  if (days > TECHNIQUE_DAYS) {
    return {
      phase: "application",
      days,
      label: "Application",
      strategy: "Two to six weeks out — weak-topic exam questions and blank-page recall. Keep closing gaps you can still close.",
      paperCadence: 0,
      allowFirstPass: true,
    };
  }
  if (days > FINAL_DAYS) {
    return {
      phase: "technique",
      days,
      label: "Exam technique",
      strategy: "Inside the final fortnight — timed papers and weak-topic retests. Marked questions beat opening new topics now.",
      paperCadence: days <= 7 ? 2 : 3,
      allowFirstPass: true,
    };
  }
  return {
    phase: "final",
    days,
    label: "Final days",
    strategy: "The exam is days away — light recall and due cards only. No new first passes; protect sleep and confidence.",
    paperCadence: 0,
    allowFirstPass: false,
  };
}
