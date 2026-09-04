// ---------------------------------------------------------------------------
// Worked-example fading — full worked → completion → faded → independent.
//
// Worked examples are the fastest way to teach a new method; solving problems
// is the fastest way to prove it stuck. The fade walks the gap between them:
// the student first studies a complete solution, then completes a mostly-
// given one, then fills larger gaps, then solves alone. The level is chosen
// from the capability evidence, and each completed level feeds back into it.
//
// Deterministic: the fade blanks steps by rule, never by model.
// ---------------------------------------------------------------------------

import type { CapabilityProfile } from "./capability-mastery";
import { capabilityState } from "./capability-mastery";

export const FADE_LEVELS = ["full", "completion", "faded", "independent"] as const;
export type FadeLevel = (typeof FADE_LEVELS)[number];

export interface WorkedExample {
  /** Ordered solution steps; each is shown, hinted, or hidden by the fade. */
  steps: string[];
  /** The final answer the steps reach. */
  answer: string;
}

export interface FadedExample {
  level: FadeLevel;
  /** Steps the student still sees. */
  shown: string[];
  /** Steps the student must produce; empty at `full`. */
  toProduce: number;
  /** What a correct production should contain, verbatim from the example. */
  expected: string[];
}

/** The fade level the evidence supports for this capability. Cuts are the
 * fade's own instrument: unknown → study the whole solution, thin-or-weak
 * evidence → complete a mostly-given one, solid-but-unproven → fill the gaps,
 * secure → solve alone. */
export function fadeLevelFor(profile: CapabilityProfile, capability: "application" | "transfer"): FadeLevel {
  const evidence = profile[capability];
  const state = capabilityState(evidence);
  if (state === "unknown") return "full";
  const score = evidence.score ?? 0;
  if (score < 0.6) return "completion";
  if (score < 0.85) return "faded";
  return "independent";
}

/**
 * Apply the fade: `full` shows every step; `completion` hides only the final
 * step; `faded` hides the middle (keeping the opening move and the answer);
 * `independent` hides everything but the problem.
 */
export function fadeExample(example: WorkedExample, level: FadeLevel): FadedExample {
  const steps = example.steps;
  if (level === "full") {
    return { level, shown: steps, toProduce: 0, expected: [] };
  }
  if (level === "independent") {
    return { level, shown: [], toProduce: steps.length, expected: steps };
  }
  if (level === "completion") {
    return { level, shown: steps.slice(0, -1), toProduce: 1, expected: [steps[steps.length - 1]] };
  }
  if (steps.length <= 2) {
    // Nothing in the middle to hide; drop to completion semantics.
    return { level: "completion", shown: steps.slice(0, -1), toProduce: 1, expected: [steps[steps.length - 1]] };
  }
  return {
    level,
    shown: [steps[0]],
    toProduce: steps.length - 2,
    expected: steps.slice(1, -1),
  };
}

/** Promotion: after a strong independent attempt the fade loosens one level. */
export function promoteFade(level: FadeLevel, independentScore: number): FadeLevel {
  if (independentScore < 0.7) return level;
  const index = FADE_LEVELS.indexOf(level);
  return FADE_LEVELS[Math.min(FADE_LEVELS.length - 1, index + 1)];
}

/** Demotion: after a failed independent attempt, scaffold one level tighter. */
export function demoteFade(level: FadeLevel, independentScore: number): FadeLevel {
  if (independentScore >= 0.5) return level;
  const index = FADE_LEVELS.indexOf(level);
  return FADE_LEVELS[Math.max(0, index - 1)];
}
