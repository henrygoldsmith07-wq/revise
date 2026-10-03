// ---------------------------------------------------------------------------
// Core-value outcomes. These measure whether Revise did its job (a personalised
// first step, recovered marks, proof) rather than how busy a learner was: no
// XP, raw session counts or streaks. Derived from the funnel events and the
// attempts/mistakes already stored, so it cannot drift from what happened.
// Per learner and local-first; `aggregateOutcomes` pools learners for cohort
// reporting once real data is exported, and refuses thin denominators.
// ---------------------------------------------------------------------------

import type { FunnelEvent } from "./funnel";
import type { MarkRecovery } from "./mark-recovery";
import type { Attempt, Id } from "./types";

/** Actions that are a placeholder rather than a personalised next step. */
const GENERIC_ACTIONS = new Set(["quick-check", "learn-untouched", "none"]);
const SESSION_GAP_MS = 30 * 60_000;
const DAY = 86_400_000;

export interface LearnerOutcomes {
  onboardingCompleted: boolean;
  diagnostic: { started: number; completed: number; skipped: number };
  /** Next actions shown that were personalised (not the cold-start check or a first lesson). */
  nextActionsShown: number;
  personalisedActionsShown: number;
  recommendationsShown: number;
  recommendationsAccepted: number;
  sessions: number;
  secondSession: boolean;
  marksProvenRecovered: number;
  marksLost: number;
  delayedProofsCompleted: number;
  /** Days from the first loss to each proof, for losses that were proven. */
  daysFromLossToProof: number[];
  proofBlockedBySupply: number;
}

export function sessionCount(attempts: readonly Pick<Attempt, "createdAt">[]): number {
  const times = attempts.map((a) => Date.parse(a.createdAt)).filter(Number.isFinite).sort((a, b) => a - b);
  let sessions = 0;
  let previous: number | null = null;
  for (const t of times) {
    if (previous === null || t - previous > SESSION_GAP_MS) sessions++;
    previous = t;
  }
  return sessions;
}

export function measureLearnerOutcomes(input: { events: readonly FunnelEvent[]; attempts: readonly Attempt[]; recovery: MarkRecovery; mistakeCreatedAt: ReadonlyMap<Id, string> }): LearnerOutcomes {
  const count = (type: FunnelEvent["type"]) => input.events.filter((e) => e.type === type).length;
  const actions = input.events.filter((e) => e.type === "next_action_shown");
  const sessions = sessionCount(input.attempts);
  const proven = input.recovery.items.filter((item) => item.state === "proven");
  const days = proven.flatMap((item) => {
    const lost = Date.parse(input.mistakeCreatedAt.get(item.mistakeId) ?? "");
    const at = Date.parse(item.provenAt ?? "");
    return Number.isFinite(lost) && Number.isFinite(at) && at >= lost ? [Math.round(((at - lost) / DAY) * 10) / 10] : [];
  });
  return {
    onboardingCompleted: count("onboarding_completed") > 0,
    diagnostic: { started: count("diagnostic_started"), completed: count("diagnostic_completed"), skipped: count("diagnostic_skipped") },
    nextActionsShown: actions.length,
    personalisedActionsShown: actions.filter((e) => !GENERIC_ACTIONS.has(e.detail ?? "none")).length,
    recommendationsShown: count("recommendation_displayed") + actions.length,
    recommendationsAccepted: count("recommendation_accepted"),
    sessions, secondSession: sessions >= 2,
    marksProvenRecovered: input.recovery.totals.recovered.low,
    marksLost: input.recovery.totals.previouslyLost,
    delayedProofsCompleted: proven.length,
    daysFromLossToProof: days,
    proofBlockedBySupply: count("proof_blocked_by_supply"),
  };
}

export interface CohortOutcomes {
  learners: number;
  /** Shares are null until at least `minLearners` contribute, so a tiny cohort never yields a headline. */
  onboardingCompletion: number | null;
  diagnosticCompletion: number | null;
  diagnosticSkipRate: number | null;
  personalisedNextActionShare: number | null;
  recommendationStartRate: number | null;
  secondSessionRate: number | null;
  recoveredMarks: number;
  learnersWithProof: number;
  medianDaysFromLossToProof: number | null;
  learnersBlockedBySupply: number;
  flagshipSupplyReadyShare: number | null;
}

const share = (num: number, den: number, min: number): number | null => (den >= min ? Math.round((num / den) * 1000) / 1000 : null);

export function aggregateOutcomes(learners: readonly LearnerOutcomes[], supplyReady: ReadonlyArray<boolean> = [], minLearners = 5): CohortOutcomes {
  const started = learners.reduce((n, l) => n + l.diagnostic.started, 0);
  const completed = learners.reduce((n, l) => n + l.diagnostic.completed, 0);
  const skipped = learners.reduce((n, l) => n + l.diagnostic.skipped, 0);
  const shown = learners.reduce((n, l) => n + l.nextActionsShown, 0);
  const personalised = learners.reduce((n, l) => n + l.personalisedActionsShown, 0);
  const displayed = learners.reduce((n, l) => n + l.recommendationsShown, 0);
  const accepted = learners.reduce((n, l) => n + l.recommendationsAccepted, 0);
  const days = learners.flatMap((l) => l.daysFromLossToProof).sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  const median = days.length ? (days.length % 2 ? days[mid]! : (days[mid - 1]! + days[mid]!) / 2) : null;
  return {
    learners: learners.length,
    onboardingCompletion: share(learners.filter((l) => l.onboardingCompleted).length, learners.length, minLearners),
    diagnosticCompletion: share(completed, started, minLearners),
    diagnosticSkipRate: share(skipped, started + skipped, minLearners),
    personalisedNextActionShare: share(personalised, shown, minLearners),
    recommendationStartRate: share(accepted, displayed, minLearners),
    secondSessionRate: share(learners.filter((l) => l.secondSession).length, learners.filter((l) => l.sessions >= 1).length, minLearners),
    recoveredMarks: learners.reduce((n, l) => n + l.marksProvenRecovered, 0),
    learnersWithProof: learners.filter((l) => l.delayedProofsCompleted > 0).length,
    medianDaysFromLossToProof: days.length >= minLearners ? median : null,
    learnersBlockedBySupply: learners.filter((l) => l.proofBlockedBySupply > 0).length,
    flagshipSupplyReadyShare: share(supplyReady.filter(Boolean).length, supplyReady.length, 1),
  };
}
