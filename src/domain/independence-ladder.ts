// ---------------------------------------------------------------------------
// Exam independence ladder — guided → independent → timed → mixed → full.
//
// Capability without exam conditions is a lab result. The ladder walks a topic
// from heavily supported practice to the real thing, and each rung is promoted
// by evidence, never by time served. Deterministic rules throughout.
// ---------------------------------------------------------------------------

import type { CapabilityProfile } from "./capability-mastery";
import { capabilityState } from "./capability-mastery";

export const LADDER_STAGES = ["guided", "independent", "timed", "mixed", "full"] as const;
export type LadderStage = (typeof LADDER_STAGES)[number];

export const LADDER_LABELS: Record<LadderStage, string> = {
  guided: "Guided — hints available, no clock",
  independent: "Independent — no hints, no clock",
  timed: "Timed — the clock is real",
  mixed: "Mixed — topics interleaved, method choice is yours",
  full: "Full exam conditions",
};

/** What each stage takes away, for the explanation UI. */
export const LADDER_REMOVALS: Record<LadderStage, string> = {
  guided: "nothing yet",
  independent: "hints",
  timed: "hints + unlimited time",
  mixed: "hints + time + topic certainty",
  full: "everything but the paper",
};

export interface LadderInput {
  /** Minutes of exam time the whole paper gives. */
  paperMinutes: number;
}

/** The stage a topic's evidence supports right now. */
export function stageFor(profile: CapabilityProfile, focus: "application" | "transfer" | "recall"): LadderStage {
  const evidence = profile[focus];
  const state = capabilityState(evidence);
  if (state === "unknown" || state === "emerging") return "guided";
  const score = evidence.score ?? 0;
  if (score < 0.6) return "guided";
  if (score < 0.8) return "timed";
  return "full";
}

/**
 * Promotion: the rung above opens when the current rung has been *passed*,
// i.e. recent unaided work clears the bar. Never time-based.
 */
export function promoteStage(stage: LadderStage, recentUnaidedScore: number, attempts: number): LadderStage {
  if (attempts < 3 || recentUnaidedScore < 0.7) return stage;
  const index = LADDER_STAGES.indexOf(stage);
  return LADDER_STAGES[Math.min(LADDER_STAGES.length - 1, index + 1)];
}

/** Demotion: a weak rung under real conditions steps back down one. */
export function demoteStage(stage: LadderStage, recentUnaidedScore: number, attempts: number): LadderStage {
  if (attempts < 2 || recentUnaidedScore >= 0.5) return stage;
  const index = LADDER_STAGES.indexOf(stage);
  return LADDER_STAGES[Math.max(0, index - 1)];
}

/** The minute budget for one session at this stage of the ladder. */
export function stageSessionMinutes(stage: LadderStage, input: LadderInput): number {
  switch (stage) {
    case "guided":
      return Math.min(12, input.paperMinutes);
    case "independent":
      return Math.min(18, input.paperMinutes);
    case "timed":
      return Math.min(25, Math.round(input.paperMinutes / 3));
    case "mixed":
      return Math.min(40, Math.round(input.paperMinutes / 2));
    case "full":
      return input.paperMinutes;
  }
}
