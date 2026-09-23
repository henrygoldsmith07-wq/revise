import { describe, expect, it } from "vitest";
import { wjecMathsQualityQuestions } from "@/content/questions/wjec-maths-quality";
import { wjecBiologyQualityQuestions } from "@/content/questions/wjec-biology-quality";
import { wjecChemistryQualityQuestions } from "@/content/questions/wjec-chemistry-quality";
import { wjecCapabilities, reviewedWjecTopicEdges } from "@/content/capabilities";
import { wjecDepthCurricula } from "@/content/wjec-subject-capabilities";
import { auditPhysicsAssessmentQuality } from "@/domain/physics-assessment-quality";
import { humanVerifiedWjecQuestion, physicsContentFingerprint, trustedAssessmentContent } from "@/domain/physics-content-review";
import { buildPhysicsReviewPacketTemplate, importPhysicsReviewPacket, buildPhysicsPrerequisiteReviewTemplate, importPhysicsPrerequisiteReviews } from "@/domain/physics-validation-intake";
import { deriveSkillEvidence, smallestUnprovenCapability, validateCapabilityGraph } from "@/domain/capability-graph";
import { isTransferQuestion, trustedAssessmentAttempt } from "@/domain/learning-evidence";
import { createInterventionOutcome, durableOutcomeScore } from "@/domain/intervention-calibration";
import { markPart } from "@/domain/marking";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import type { Attempt, Question } from "@/domain/types";

const banks = [wjecMathsQualityQuestions, wjecBiologyQualityQuestions, wjecChemistryQualityQuestions];
function attempt(question: Question): Attempt {
  return { id: "test-attempt", userId: "test-user", subjectId: question.subjectId, questionId: question.id,
    topicIds: question.topicIds, answers: {}, marked: question.parts.map(p => ({ partId: p.id, awarded: p.marks, max: p.marks,
      creditedPoints: p.markScheme, missedPoints: [], comment: "TEST ONLY" })), awarded: question.totalMarks, max: question.totalMarks,
    feedback: "", markedBy: "rubric", elapsedMs: 120000, mode: "practice", createdAt: "2026-09-10T12:00:00Z" };
}

for (const [i, questions] of banks.entries()) {
  const curriculum = wjecDepthCurricula[i]!;
  const subjectId = questions[0]!.subjectId;
  describe(subjectId, () => {
    it("has a valid capability for every internal statement and two complete draft areas", () => {
      expect(validateCapabilityGraph(wjecCapabilities)).toEqual([]);
      for (const point of curriculum.topics.flatMap(t => t.specPoints ?? [])) {
        expect(wjecCapabilities.some(n => n.subjectId === subjectId && n.specPointIds.includes(point.id))).toBe(true);
      }
      const audit = auditPhysicsAssessmentQuality({ subjectId, topics: curriculum.topics, questions, nodes: wjecCapabilities,
        trustedQuestion: humanVerifiedWjecQuestion });
      expect(questions).toHaveLength(28);
      expect(audit.capabilityCoverage.filter(row => row.complete)).toHaveLength(2);
      expect(audit.issues.filter(issue => issue.kind !== "unreviewed")).toEqual([]);
      expect(audit.approvedQuestions).toBe(0);
      expect(audit.releaseReady).toBe(false);
    });

    it("still offers draft questions in an adaptive practice session", () => {
      const topic = curriculum.topics.find(t => t.id === questions[0]!.topicIds[0])!;
      const plan = buildAdaptiveSession({ topics: [topic], questions, cards: [], reviewLogs: [],
        attempts: [], mistakes: [], mastery: [], exams: [], subjectIds: [subjectId], now: new Date("2026-09-10T12:00:00Z") });
      expect(plan).not.toBeNull();
      const chosen = plan!.steps.flatMap(step => step.questionIds ?? []);
      expect(chosen.length).toBeGreaterThan(0);
      expect(chosen.every(id => questions.some(q => q.id === id && !trustedAssessmentContent(q)))).toBe(true);
    });

    it("round-trips review packets and invalidates changed versions", () => {
      const rows = buildPhysicsReviewPacketTemplate(questions, subjectId);
      const pending = importPhysicsReviewPacket(JSON.stringify({ formatVersion: 1, rows }), questions, subjectId);
      expect(pending.errors).toEqual([]);
      expect(pending.reviewQueue).toHaveLength(28);
      const row = rows[0]!;
      row.review = { ...row.review, status: "approved", reviewerId: "test-only", reviewerRole: "teacher",
        reviewerQualification: "Synthetic test attestation, not a real reviewer", reviewedAt: "2026-09-10T12:00:00Z",
        checks: { question: true, marking: true, workedSolution: true, specificationMapping: true, capabilityMapping: true, examRealism: true } };
      const approved = importPhysicsReviewPacket(JSON.stringify([row]), questions, subjectId);
      expect(approved.errors).toEqual([]);
      expect(humanVerifiedWjecQuestion(approved.updatedQuestions[0]!)).toBe(true);
      expect(trustedAssessmentContent({ ...approved.updatedQuestions[0]!, stem: "Edited after approval" })).toBe(false);
      const stale = importPhysicsReviewPacket(JSON.stringify([{ ...row, fingerprint: "stale" }]), questions, subjectId);
      expect(stale.approvedQuestionIds).toEqual([]);
      expect(stale.errors.length).toBeGreaterThan(0);
      expect(importPhysicsReviewPacket(JSON.stringify([row]), questions, "wjec-alevel-physics").approvedQuestionIds).toEqual([]);
    });

    it("does not turn draft successes into trusted capability or calibration evidence", () => {
      const question = questions[0]!;
      const a = attempt(question);
      expect(trustedAssessmentContent(question)).toBe(false);
      expect(trustedAssessmentAttempt(a, question, [], questions)).toBe(false);
      expect(isTransferQuestion(questions.find(q => q.learning?.demand === "transfer")!, question)).toBe(false);
      const capabilityId = question.parts[0]!.capabilityIds![0]!;
      const evidence = deriveSkillEvidence(wjecCapabilities, questions, [a]);
      expect(evidence.get(capabilityId)?.independentFamilies).toBe(0);
      const outcome = createInterventionOutcome({ userId: a.userId, subjectId, question, attempt: a,
        context: { id: "step", chainId: "chain", capabilityId, topicId: question.topicIds[0]!,
          kind: "guided", priorState: "weak", priorAccuracy: 0.25, plannedMinutes: 2, support: "scaffold" } });
      expect(outcome.immediate.trusted).toBe(false);
      expect(durableOutcomeScore(outcome)).toBeNull();
    });

    it("keeps proposed prerequisite edges out of trusted diagnosis", () => {
      const rows = buildPhysicsPrerequisiteReviewTemplate(wjecCapabilities, subjectId);
      const row = rows.find(r => r.rationale)!;
      expect(row).toBeDefined();
      expect(reviewedWjecTopicEdges(subjectId)).toEqual([]);
      const evidence = deriveSkillEvidence(wjecCapabilities, questions, []);
      expect(smallestUnprovenCapability([row.targetId], wjecCapabilities, evidence, { trustedOnly: true })?.id).toBe(row.targetId);
      const pending = importPhysicsPrerequisiteReviews(JSON.stringify(rows), wjecCapabilities, subjectId);
      expect(pending.approvedEdges).toEqual([]);
      const approvedRow = { ...row, review: { status: "approved", reviewerId: "test-only", reviewerRole: "teacher",
        reviewerQualification: "Test fixture only", reviewedAt: "2026-09-10T12:00:00Z", edgeFingerprint: row.edgeFingerprint } };
      expect(importPhysicsPrerequisiteReviews(JSON.stringify([approvedRow]), wjecCapabilities, subjectId).approvedEdges).toHaveLength(1);
    });

    it("keeps fingerprints distinct and authored answers reachable without claiming marking validity", () => {
      expect(new Set(questions.map(physicsContentFingerprint)).size).toBe(28);
      for (const q of questions) for (const p of q.parts) {
        expect(markPart(p, "").awarded).toBe(0);
        expect(markPart(p, p.modelAnswer).awarded).toBe(p.marks);
      }
    });
  });
}

describe("subject content arithmetic checks", () => {
  const answer = (bank: Question[], suffix: string) => bank.find(q => q.id.endsWith(suffix))!.parts[0]!.modelAnswer;
  it("checks conditional denominators and reconstructed optimum geometry", () => {
    expect((0.5 * 0.5 ** 2) / (0.5 * 0.5 ** 2 + 0.5 * 0.75 ** 2)).toBeCloseTo(4 / 13, 12);
    expect(answer(banks[0]!, "latent-source")).toContain("4/13");
    const area = (r: number) => 2 * Math.PI * r * r + 256 * Math.PI / r;
    expect(Math.PI * 4 ** 2 * 8).toBeCloseTo(128 * Math.PI, 12);
    expect(area(4)).toBeLessThan(area(3.99));
    expect(area(4)).toBeLessThan(area(4.01));
  });
  it("checks signed osmotic changes and correct initial-rate units", () => {
    expect((2.22 - 2.40) / 2.40 * 100).toBeCloseTo(-7.5, 10);
    expect(answer(banks[1]!, "percent-mass")).toContain("-7.5%");
    expect(16 / 20 * 60).toBe(48);
    expect(-0.80 + 0.40).toBeCloseTo(-0.40, 12);
  });
  it("checks hydrate mass balance and the physical equilibrium root", () => {
    const carbonate = 0.1 * 0.010 / 2 * 10;
    expect((1.430 - carbonate * 106) / 18 / carbonate).toBeCloseTo(10, 10);
    expect(answer(banks[2]!, "hydrate-assay")).toContain("x = 10");
    expect(0.5 / (1 - 0.5) ** 2).toBe(2);
    expect((0.6 / 2) / ((0.4 / 2) * (0.2 / 2))).toBeCloseTo(15, 12);
  });
});
