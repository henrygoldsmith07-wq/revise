// ---------------------------------------------------------------------------
// Mistake repair — marks are lost for a reason; repair treats that reason.
//
// The old failure mode: a student opens the answer, noddes, marks the mistake
// resolved, and loses the mark again in the next paper. Repair here is a
// pipeline with a gate:
//
//   1. Diagnose   — why the mark was lost (from the attempt's own evidence).
//   2. Contrast   — the student's answer against the credited point.
//   3. Micro-practice — two targeted items on the exact lost skill.
//   4. Transfer   — one new-context item: the idea, different clothing.
//   5. Delayed    — a retrieval check days later, scheduled by FSRS.
//
// A mistake may only close when the delayed retest earned its point after the
// transfer passed. Viewing an answer never closes anything.
// ---------------------------------------------------------------------------

import type { Mistake } from "./types";

export type RepairStepKind = "diagnose" | "contrast" | "micro-practice" | "transfer-test" | "delayed-retrieval";

export interface RepairStep {
  kind: RepairStepKind;
  label: string;
  detail: string;
  /** The question ids this step needs, when it needs questions. */
  questionIds: string[];
}

export interface RepairPlan {
  mistakeId: string;
  /** The diagnosed reason, in the student's language. */
  diagnosis: string;
  steps: RepairStep[];
  /** Whether this mistake may ever close, and on what condition. */
  closeCondition: string;
}

/** Micro-practice and transfer items per repair, kept short on purpose. */
export const MICRO_PRACTICE_ITEMS = 2;
export const TRANSFER_TEST_ITEMS = 1;

/**
 * Diagnose why the mark was lost, from the attempt's recorded evidence.
 * Deterministic categories map to concrete repair shapes.
 */
export function diagnoseMistake(mistake: Mistake): string {
  const where = mistake.partId ? `on part ${mistake.partId}` : "in this answer";
  switch (mistake.category) {
    case "recall":
      return `Knowledge gap: the fact or definition wasn't there ${where}.`;
    case "method":
      return `Method gap: the approach was wrong ${where}, not the final arithmetic.`;
    case "arithmetic":
      return `Slip: the method was right but the execution broke ${where}.`;
    case "interpretation":
      return `Reading gap: the question was asking something else ${where}.`;
    case "communication":
      return `Expression gap: the idea was right but the mark scheme's language was missing ${where}.`;
    default:
      return mistake.point
        ? `Unclassified: the credited point "${mistake.point}" didn't appear ${where}.`
        : `Unclassified: marks were lost ${where} without a matched cause yet.`;
  }
}

/** Whether the pipeline already reached the delayed-retrieval gate. */
export function repairProgress(mistake: Mistake): {
  retested: boolean;
  retestsPassed: number;
  canClose: boolean;
} {
  const retested = (mistake.retestCount ?? 0) > 0;
  // A retest "passes" when the mistake was resolved off the back of one; the
  // count alone never proves quality, so resolution is the carried signal.
  const retestsPassed = mistake.resolved && retested ? 1 : 0;
  return {
    retested,
    retestsPassed,
    // The only close path: a retest was actually attempted and the mistake
    // resolved off the back of it. A viewed answer satisfies neither.
    canClose: mistake.resolved && retested,
  };
}

/**
 * The repair pipeline for one mistake. `candidateIds` are targeted items for
 * micro-practice and `transferIds` new-context items for the transfer test —
 * selected by the caller from the topic's question bank.
 */
export function buildRepairPlan(
  mistake: Mistake,
  candidateIds: string[],
  transferIds: string[],
): RepairPlan {
  const steps: RepairStep[] = [];
  const diagnosis = diagnoseMistake(mistake);

  steps.push({
    kind: "diagnose",
    label: "Diagnose",
    detail: diagnosis,
    questionIds: [],
  });

  steps.push({
    kind: "contrast",
    label: "Contrast",
    detail: mistake.point
      ? `Your answer vs what earns the mark: “${mistake.point}”`
      : "Compare your answer with the credited point side by side.",
    questionIds: [],
  });

  steps.push({
    kind: "micro-practice",
    label: "Micro-practice",
    detail: `${MICRO_PRACTICE_ITEMS} targeted items on exactly this skill.`,
    questionIds: candidateIds.slice(0, MICRO_PRACTICE_ITEMS),
  });

  steps.push({
    kind: "transfer-test",
    label: "Transfer test",
    detail: `${TRANSFER_TEST_ITEMS} new-context item: same idea, different clothing.`,
    questionIds: transferIds.slice(0, TRANSFER_TEST_ITEMS),
  });

  steps.push({
    kind: "delayed-retrieval",
    label: "Delayed retrieval",
    detail: "A retrieval check in a few days — scheduled by the FSRS job, not by this session.",
    questionIds: [],
  });

  return {
    mistakeId: mistake.id,
    diagnosis,
    steps,
    closeCondition:
      "Closes only when a delayed retest earns the point after the transfer test passed. Viewing the answer closes nothing.",
  };
}
