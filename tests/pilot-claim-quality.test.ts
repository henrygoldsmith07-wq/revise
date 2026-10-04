import { describe, expect, it } from "vitest";
import { buildPilotReport, pilotLearnerEvidence, type PilotLearner } from "@/domain/pilot-evidence";
import { privatePilotExport } from "@/domain/pilot-export";
import { recoveryClaim, productLearningClaimAllowed, BLOCKED_PROOF_COPY } from "@/domain/claim-gates";
import { productQualityReport } from "@/domain/product-quality";
import { markingEvidenceReport } from "@/domain/marking-evidence";
import { flagshipReadiness } from "@/domain/flagship-readiness";
import { bank, attempt, mistake } from "./helpers-recovery";
import { gateFor, SUBJECT } from "./helpers-review";
import type { FunnelEvent } from "@/domain/funnel";

const ev = (type: FunnelEvent["type"], day: number, detail?: string): FunnelEvent => ({ anonId: "u1", type, at: `2026-09-${String(day).padStart(2, "0")}T08:00:00Z`, ...(detail ? { detail } : {}) });
const events = [ev("onboarding_completed", 18), ev("diagnostic_started", 19), ev("diagnostic_completed", 20), ev("recommendation_displayed", 20, "action:adaptive:algebra"), { ...ev("recommendation_accepted", 20, "action:adaptive:algebra"), at: "2026-09-20T08:59:00Z" }];
const lost = attempt("lost", "q-a1", 0, 3, "2026-09-20T09:00:00Z");
const m = mistake("m", { attemptId: lost.id, createdAt: lost.createdAt });
const repaired = attempt("repair", "q-a2", 3, 3, "2026-09-21T09:00:00Z", { retestMistakeId: m.id, hintTier: "cue" });
const independent = attempt("independent", "q-a3", 3, 3, "2026-09-22T09:00:00Z", { retestMistakeId: m.id });
const learner = (extra: Partial<PilotLearner> = {}): PilotLearner => ({ anonId: "u1", source: "learner-pilot", consented: true, capturedAt: "2026-10-01T09:00:00Z", events, attempts: [lost, repaired, independent], mistakes: [m], ...extra });

describe("learner-level pilot evidence", () => {
  it("tracks the actual ordered journey and separate supported/pr proven marks", () => {
    const r = pilotLearnerEvidence(learner(), bank);
    expect(r.stages.repaired).not.toBeNull();
    expect(r.stages["independent-practice"]).not.toBeNull();
    expect(r.stages["proven-recovery"]).toBeNull();
    expect(r.marksProvenRecovered).toBe(0);
    expect(r.marksRepairedInPractice).toBe(3);
  });
  it("marks content-blocked progress separately from behavioural dropout", () => {
    const r = buildPilotReport([learner()], bank.slice(0, 3));
    expect(r.proof.learnersBlockedBySupply).toBe(1);
    const row = r.funnel.find(f => f.step === "independent-practice")!;
    expect(row.supplyBlocked).toBe(1);
    expect(row.behaviouralDropoff).toBe(0);
  });
  it("repeated impressions and proofs from one learner cannot satisfy cohort minimums", () => {
    const noisy = learner({ events: [...events, ...Array.from({ length: 100 }, () => ev("recommendation_displayed", 20, "action:adaptive:algebra"))] });
    expect(buildPilotReport([noisy], bank).operational.recommendationStart.value).toBeNull();
    expect(buildPilotReport([noisy], bank).operational.recommendationStart.denominator).toBe(1);
    expect(() => buildPilotReport([noisy, noisy], bank)).toThrow(/Duplicate learner/);
    expect(() => buildPilotReport([noisy], bank, 1)).toThrow(/Minimum pilot/);
  });
  it("does not call immature retention windows failure or fabricate missing steps", () => {
    const early = learner({ capturedAt: "2026-09-21T10:00:00Z", events: [], attempts: [lost] });
    const report = buildPilotReport([early], bank);
    expect(report.retention.day1.denominator).toBe(0);
    expect(report.retention.day7.denominator).toBe(0);
    expect(report.funnel.every(f => f.reached === 0)).toBe(true);
  });
  it("rejects mixed-account observations and redacts private exported content", () => {
    expect(() => pilotLearnerEvidence(learner({ events: [{ ...events[0]!, anonId: "another" }] }), bank)).toThrow(/Mixed-owner/);
    const payload = privatePilotExport({ userId: "u1", anonId: "pilot-alias", capturedAt: learner().capturedAt, events: [...events, { ...events[0]!, anonId: "other" }], attempts: [{ ...lost, answers: { a: "private answer" }, feedback: "private feedback" }], mistakes: [{ ...m, description: "private diagnosis" }] });
    expect(JSON.stringify(payload)).not.toMatch(/private answer|private feedback|private diagnosis|"u1"|"other"/);
    expect(payload.learners[0]!.events).toHaveLength(events.length);
  });
});

describe("claim and quality gates", () => {
  it("help, insufficient delay, repeated questions and unreviewed marks cannot be Proven", () => {
    const input = { mistake: m, questions: bank, now: new Date("2026-10-01T12:00:00Z") };
    for (const a of [repaired, { ...independent, questionId: "q-a1" }, { ...independent, markedBy: "self" as const }]) {
      expect(recoveryClaim({ ...input, attempts: [lost, a] }).provenMarksRecovered).toBe(0);
    }
    const delayed = attempt("proof", "q-a4", 3, 3, "2026-09-26T09:00:00Z");
    expect(recoveryClaim({ ...input, attempts: [lost, repaired, independent, delayed] })).toMatchObject({ label: "Proven", provenMarksRecovered: 3 });
    expect(BLOCKED_PROOF_COPY).toContain("You improved");
    expect(BLOCKED_PROOF_COPY).not.toMatch(/supply|family|count|Proven|insufficient evidence/i);
  });
  it("does not permit product-wide claims from synthetic or observational cohorts", () => {
    const common = { genuineLearners: 1000, requiredLearners: 100, preregistered: true, independentEvaluation: true, effectLowerBound: 0.1 };
    expect(productLearningClaimAllowed({ ...common, design: "observational" })).toBe(false);
    expect(productLearningClaimAllowed({ ...common, design: "synthetic" })).toBe(false);
    expect(productLearningClaimAllowed({ ...common, design: "controlled", effectLowerBound: -0.1 })).toBe(false);
  });
  it("ranks genuine missing evidence, preserves unverified staging and never reports fabricated outcomes", () => {
    const content = flagshipReadiness({ topics: [], questions: [], gate: gateFor([]), subjectId: SUBJECT });
    const quality = productQualityReport({ content: [content], pilot: buildPilotReport([], bank), marking: markingEvidenceReport([]) });
    expect(quality.marking.genuineIndependentAnswers).toBe(0);
    expect(quality.pilot.learning.marksProvenRecovered).toBe(0);
    expect(quality.reliability).toMatchObject({ status: "EXTERNALLY UNVERIFIED", syncFailures: null });
    expect(quality.claimStatus.productLearningImprovement).toBe("NOT VALIDATED");
    expect(quality.blockers.map(b => b.rank)).toEqual([1, 2, 3]);
  });
});
