import { describe, expect, it } from "vitest";
import type { FunnelEvent } from "@/domain/funnel";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { aggregateOutcomes, measureLearnerOutcomes, sessionCount } from "@/domain/product-outcomes";
import { flagshipAttempt as attempt, flagshipBank as bank, flagshipMistake as mistake } from "./helpers-recovery";

const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
const ev = (type: FunnelEvent["type"], h: number, detail?: string): FunnelEvent => ({ anonId: "u1", type, at: at(h), ...(detail ? { detail } : {}) });

describe("core-value outcomes", () => {
  const lost = attempt("p1", "q-a1", 0, 3, "2026-09-18T08:00:00.000Z");
  const m = mistake("m1", { createdAt: "2026-09-18T09:00:00.000Z", attemptId: "p1" });
  const attempts = [lost, attempt("a1", "q-a2", 3, 3, "2026-09-25T09:00:00.000Z"), attempt("a2", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z")];
  const recovery = buildMarkRecovery({ mistakes: [m], attempts, questions: bank, now: new Date("2026-10-03T12:00:00Z") });

  it("measures proof, recovered marks and time from loss to proof, not activity", () => {
    const o = measureLearnerOutcomes({
      events: [ev("onboarding_completed", 1), ev("diagnostic_started", 2), ev("diagnostic_completed", 3), ev("next_action_shown", 4, "quick-check"), ev("next_action_shown", 5, "mission"), ev("recommendation_accepted", 6, "x"), ev("proof_blocked_by_supply", 7, "algebra")],
      attempts, recovery, mistakeCreatedAt: new Map([[m.id, m.createdAt]]),
    });
    expect(o).toMatchObject({ onboardingCompleted: true, diagnostic: { started: 1, completed: 1, skipped: 0 }, nextActionsShown: 2, personalisedActionsShown: 1, recommendationsAccepted: 1, delayedProofsCompleted: 1, proofBlockedBySupply: 1 });
    expect(o.marksProvenRecovered).toBe(3);
    expect(o.daysFromLossToProof).toEqual([12]);
  });

  it("counts sessions by 30-minute gaps", () => {
    expect(sessionCount([{ createdAt: at(1) }, { createdAt: at(1.2) }, { createdAt: at(3) }])).toBe(2);
  });

  it("refuses headline shares for a tiny cohort", () => {
    const one = measureLearnerOutcomes({ events: [ev("onboarding_completed", 1)], attempts: [], recovery, mistakeCreatedAt: new Map() });
    expect(aggregateOutcomes([one], [false])).toMatchObject({ learners: 1, onboardingCompletion: null, flagshipSupplyReadyShare: 0 });
    expect(aggregateOutcomes(Array(5).fill(one), [true, true, false, false, false]).onboardingCompletion).toBe(1);
  });

  it("does not treat repeated events from one learner as a cohort denominator", () => {
    const one = measureLearnerOutcomes({ events: Array.from({ length: 20 }, () => ev("diagnostic_started", 1)), attempts: [], recovery, mistakeCreatedAt: new Map() });
    expect(aggregateOutcomes([one]).diagnosticCompletion).toBeNull();
  });
});
