// ---------------------------------------------------------------------------
// Efficacy evidence — the headline number that proves or disproves Revise.
//
// Computes marks gained per revision hour per arm, with proper readiness
// gates. The headline is "Revise produced +X marks/hour versus control" and
// it only appears when the preregistered evidence standard is met.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { analyseExperiment, EXPERIMENT_ARMS, type ExperimentAnalysis } from "./recommendation-experiment";

export interface EfficacyEvidence {
  /** The headline number: revise marks/hour minus control marks/hour. */
  effect: number | null;
  /** Per-arm breakdown for the table. */
  arms: Array<{
    arm: string;
    label: string;
    hours: number;
    marks: number;
    marksPerHour: number | null;
    delayedRetention: number | null;
    unseenTransferShare: number | null;
    participants: number;
  }>;
  readiness: string;
  gates: {
    operationallyUsable: boolean;
    descriptiveResultsReady: boolean;
    primaryOutcomeReady: boolean;
    efficacyClaimReady: boolean;
  };
  note: string;
}

const ARM_LABELS: Record<string, string> = {
  revise: "Revise recommender",
  "baseline-mastery": "Weakest-topic first",
  "baseline-overdue": "Most-overdue first",
  control: "Self-directed (control)",
};

export function computeEfficacyEvidence(analysis: ExperimentAnalysis): EfficacyEvidence {
  return {
    effect: analysis.marksPerHourEffect,
    arms: analysis.arms.map((arm) => ({
      arm: arm.arm,
      label: ARM_LABELS[arm.arm] ?? arm.arm,
      hours: arm.hoursPractised,
      marks: arm.marksEarned,
      marksPerHour: arm.practiceMarksPerHour,
      delayedRetention: arm.delayedRetention,
      unseenTransferShare: arm.unseenExposureShare,
      participants: arm.participants,
    })),
    readiness: analysis.readiness ?? "enrolling",
    gates: analysis.gates ?? {
      operationallyUsable: false,
      descriptiveResultsReady: false,
      primaryOutcomeReady: false,
      efficacyClaimReady: false,
    },
    note: analysis.note,
  };
}

/** Format the headline for display: "+3.8" or null when not ready. */
export function formatEfficacyEffect(evidence: EfficacyEvidence): string | null {
  if (!evidence.gates.efficacyClaimReady || evidence.effect == null) return null;
  const sign = evidence.effect >= 0 ? "+" : "";
  return `${sign}${evidence.effect.toFixed(1)} marks/hour`;
}

export { EXPERIMENT_ARMS };
