// ---------------------------------------------------------------------------
// Adaptive time budget — the hard invariant behind the 20-minute promise.
//
// Every generated session satisfies `totalMinutes <= targetMinutes`
// (clamped to 12–25), and every replan respects the *remaining* budget.
// Budgeting lives here — not in the UI — so the domain model itself refuses
// to over-promise: construction fits, replanning trims, and an explicit
// assertion lets tests pin the invariant instead of eyeballing minutes.
//
// Delayed retrieval is structural: it is never dropped to fit, only shrunk
// to a 1-minute (or, with nothing left, 0-minute) schedule-later action, and
// it disappears solely once recorded as scheduled.
// ---------------------------------------------------------------------------

import type { AdaptiveStepKind } from "./adaptive-session";

/** Kinds executed as one markable question pass (also the only retestable kinds). */
export const QUESTION_STEP_KINDS: ReadonlySet<AdaptiveStepKind> = new Set([
  "supported-practice",
  "independent-application",
  "transfer",
  "misconception-repair",
  "prerequisite-repair",
]);

export const ADAPTIVE_SESSION_MINUTES = 20;
export const ADAPTIVE_SESSION_MIN_MINUTES = 12;
export const ADAPTIVE_SESSION_MAX_MINUTES = 25;

/** Marks ratio a question attempt needs to count as a pass. */
export const ADAPTIVE_PASS_RATIO = 0.7;
/** Question attempts per topic before the tutor closes instead of looping. */
export const ADAPTIVE_MAX_QUESTION_ATTEMPTS = 5;
/** Times the same retrieval card may fail before teaching replaces retrying. */
export const ADAPTIVE_MAX_RETRIEVAL_FAILS = 2;
/** Misconception-repair attempts per session (each one is an independent retest). */
export const ADAPTIVE_MAX_REPAIR_ATTEMPTS = 2;

/** Minutes a rebuilt mid-session step claims from the remaining budget. */
export const REBUILT_STEP_MINUTES: Record<AdaptiveStepKind, number> = {
  "overdue-retrieval": 2,
  "misconception-repair": 3,
  explanation: 2,
  "supported-practice": 4,
  "independent-application": 4,
  transfer: 4,
  "prerequisite-repair": 3,
  "delayed-retrieval": 1,
};

export interface BudgetedStep {
  kind: AdaptiveStepKind;
  minutes: number;
}

export function stepMinutesTotal(steps: readonly BudgetedStep[]): number {
  return steps.reduce((sum, step) => sum + step.minutes, 0);
}

/**
 * Throw when a step list exceeds its budget. Construction and replanning fit
 * by design, so a throw means a builder regressed — surfaced in tests and
 * development rather than silently over-promising session length.
 */
export function assertBudgetNotExceeded(
  steps: readonly BudgetedStep[],
  budgetMinutes: number,
  context: string,
): void {
  const total = stepMinutesTotal(steps);
  if (total - budgetMinutes > 1e-9) {
    throw new Error(
      `Adaptive budget exceeded in ${context}: ${total} minutes against a ${budgetMinutes}-minute budget ` +
        `(${steps.map((step) => `${step.kind}:${step.minutes}`).join(", ")}).`,
    );
  }
  for (const step of steps) {
    if (!Number.isFinite(step.minutes) || step.minutes < 0) {
      throw new Error(`Adaptive budget: step ${step.kind} has invalid minutes ${step.minutes} in ${context}.`);
    }
  }
}

/**
 * Minutes already spent in a run. Prefers measured wall-clock time and falls
 * back to planned minutes — one shared definition so initial planning and
 * replanning cannot disagree about the remaining budget.
 */
export function spentMinutes(records: ReadonlyArray<{ minutes: number; elapsedMs: number }>): number {
  return records.reduce((sum, record) => sum + (record.elapsedMs > 0 ? record.elapsedMs / 60_000 : Math.max(0, record.minutes)), 0);
}

export function remainingMinutes(targetMinutes: number, spent: number): number {
  return Math.max(0, targetMinutes - spent);
}

export function clampTargetMinutes(value: number | undefined): number {
  return Math.max(
    ADAPTIVE_SESSION_MIN_MINUTES,
    Math.min(ADAPTIVE_SESSION_MAX_MINUTES, Math.round(value ?? ADAPTIVE_SESSION_MINUTES)),
  );
}

/** Fit an initial plan to its target: pad the evidence rung when short, shave flexible rungs when over. */
export function fitToBudget(steps: BudgetedStep[], target: number): void {
  if (!steps.length) return;
  let total = stepMinutesTotal(steps);
  if (total < target) {
    const preferred =
      steps.find((step) => step.kind === "independent-application") ??
      steps.find((step) => step.kind === "supported-practice") ??
      steps.find((step) => step.kind === "transfer") ??
      steps.find((step) => step.kind === "explanation") ??
      steps[steps.length - 1];
    preferred.minutes += target - total;
    total = target;
  }
  if (total <= target) return;

  // Keep every block visible, but shave time from the most flexible blocks
  // first. Delayed retrieval retains at least one minute even on a short test
  // budget, so the overnight rule cannot disappear by accident.
  const order: AdaptiveStepKind[] = [
    "independent-application",
    "supported-practice",
    "transfer",
    "explanation",
    "misconception-repair",
    "overdue-retrieval",
    "delayed-retrieval",
  ];
  let over = total - target;
  for (const kind of order) {
    const step = steps.find((candidate) => candidate.kind === kind);
    if (!step || over <= 0) continue;
    const minimum = kind === "delayed-retrieval" ? 1 : 1;
    const shave = Math.min(over, Math.max(0, step.minutes - minimum));
    step.minutes -= shave;
    over -= shave;
  }
}
