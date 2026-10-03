// ---------------------------------------------------------------------------
// Two kinds of "evidence that Revise works", kept apart on purpose.
//
//   engineering validation   fixtures, synthetic trajectories and benchmarks.
//                            They show the code does what it says. They say
//                            nothing about whether students improve.
//   real-world evidence      human-marked answers, completed learner outcome
//                            chains, delayed retention, predicted-vs-actual
//                            paper scores. Only this can support an efficacy claim.
//
// Nothing synthetic is ever counted in the real-world report.
// ---------------------------------------------------------------------------

import { durableOutcomeScore } from "./intervention-calibration";
import { humanReviewedPaperAttempt } from "./learning-evidence";
import { missionChains } from "./effectiveness";
import type { PaperOutcomeRecord } from "./paper-outcome";
import type { Attempt, InterventionOutcomeRecord, Mistake, Question } from "./types";

export type EvidenceClass = "engineering-validation" | "real-world-evidence";

export const EVIDENCE_CLASS_LABEL: Record<EvidenceClass, string> = {
  "engineering-validation": "Engineering validation",
  "real-world-evidence": "Real-world educational evidence",
};

export const EVIDENCE_CLASS_NOTE: Record<EvidenceClass, string> = {
  "engineering-validation": "Fixtures and synthetic runs. They show the software behaves as designed, not that students improve.",
  "real-world-evidence": "Taken from real learners' answers and outcomes. Only this can support a claim that Revise works.",
};

/** Where each validation source in the product belongs. */
export const EVIDENCE_SOURCE_CLASS: Record<string, EvidenceClass> = {
  "examiner-benchmark": "engineering-validation",
  "paper-import-benchmark": "engineering-validation",
  "recommender-tournament": "engineering-validation",
  "adversarial-marking": "engineering-validation",
  "large-history-fixture": "engineering-validation",
  "recommendation-audit": "real-world-evidence",
  "grade-prediction-reality": "real-world-evidence",
  "double-marked-corpus": "real-world-evidence",
  "outcome-chains": "real-world-evidence",
};

export interface RealWorldCount { key: string; label: string; count: number; needed: number; enough: boolean }

export interface RealWorldEvidence {
  rows: RealWorldCount[];
  /** True only when every kind of real-world evidence has reached its minimum. */
  sufficient: boolean;
  statement: string;
}

const MIN = { humanMarked: 30, durableChains: 20, delayed: 20, missionChains: 10, paperOutcomes: 5 } as const;

export function realWorldEvidence(input: {
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  questions: readonly Question[];
  interventionOutcomes: readonly InterventionOutcomeRecord[];
  paperOutcomes: readonly PaperOutcomeRecord[];
}): RealWorldEvidence {
  const row = (key: string, label: string, count: number, needed: number): RealWorldCount => ({ key, label, count, needed, enough: count >= needed });
  const rows = [
    row("human-marked", "Human-marked answers", input.attempts.filter(humanReviewedPaperAttempt).length, MIN.humanMarked),
    row("durable-chains", "Complete outcome chains (immediate, transfer, delayed)", input.interventionOutcomes.filter((o) => durableOutcomeScore(o) !== null).length, MIN.durableChains),
    row("delayed", "Delayed-retention outcomes", input.interventionOutcomes.filter((o) => o.delayedRetention).length, MIN.delayed),
    row("mission-chains", "Mission chains proven on a different question after a delay", missionChains(input).filter((c) => c.durable).length, MIN.missionChains),
    row("paper-outcomes", "Predicted-versus-actual paper scores", input.paperOutcomes.length, MIN.paperOutcomes),
  ];
  const sufficient = rows.every((r) => r.enough);
  const short = rows.filter((r) => !r.enough);
  return {
    rows, sufficient,
    statement: sufficient ? "Enough real-world evidence exists to start judging efficacy."
      : `Real-world evidence is still limited: ${short.map((r) => `${r.label.toLowerCase()} (${r.count} of ${r.needed})`).join("; ")}. Benchmarks and fixtures do not count towards this.`,
  };
}
