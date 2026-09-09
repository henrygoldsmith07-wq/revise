import { describe, expect, it } from "vitest";
import { wjecPhysicsDeepQuestions } from "@/content/questions/wjec-physics-deep";
import { wjecPhysicsCapabilities, wjecCapabilities, physicsCapabilityIdForSpecPoint } from "@/content/capabilities";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { auditLearningDepth } from "@/domain/learning-depth";
import { applyHumanVerification, buildPhysicsReviewQueue, physicsContentReadiness, humanVerifiedPhysicsQuestion, physicsContentFingerprint } from "@/domain/physics-content-review";
import { answerLooksCopied, independentAttempt } from "@/domain/learning-evidence";
import { calibrateInterventions, durableOutcomeScore, effectivenessFor } from "@/domain/intervention-calibration";
import { deriveSkillEvidence, smallestUnprovenCapability, validateCapabilityGraph } from "@/domain/capability-graph";
import type { Attempt, InterventionOutcomeRecord } from "@/domain/types";

const physicsQuestions = wjecPhysicsDeepQuestions;

function outcome(i: number): InterventionOutcomeRecord {
  const at = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
  return {
    id: `intervention-${i}`,
    userId: `learner-${i % 5}`,
    evidenceVersion: 2,
    priorAccuracy: 0.25,
    timeMeasured: true,
    immediateFamilyId: `q-i-${i}`,
    subjectId: "wjec-alevel-physics",
    topicId: "wjec-alevel-physics.kinematics-dynamics",
    capabilityId: "phys.kinematics-dynamics.sp-01",
    kind: "guided",
    priorState: "weak",
    plannedMinutes: 3,
    actualMinutes: 3,
    support: "scaffold",
    immediate: { awarded: 1, max: 1, independent: false, attemptId: `a-${i}`, at },
    transfer: { awarded: 2, max: 2, independent: true, trusted: true, familyId: `q-t-${i}`, questionId: `q-t-${i}`, attemptId: `t-${i}`, at: new Date(Date.parse(at) + 60000).toISOString() },
    delayedRetention: { awarded: 2, max: 2, independent: true, trusted: true, familyId: `q-d-${i}`, questionId: `q-d-${i}`, attemptId: `d-${i}`, at: new Date(Date.parse(at) + 8 * 86400000).toISOString() },
    createdAt: at,
    updatedAt: at,
  };
}

describe("Physics-first coverage and evidence", () => {
  it("maps every WJEC Physics statement to a capability and validates the graph", () => {
    const statements = wjecPhysics.topics.flatMap((topic) => topic.specPoints ?? []);
    expect(wjecPhysicsCapabilities).toHaveLength(statements.length);
    expect(validateCapabilityGraph(wjecCapabilities)).toEqual([]);
    for (const statement of statements) {
      expect(wjecPhysicsCapabilities.some((node) => node.specPointIds.includes(statement.id))).toBe(true);
      expect(physicsCapabilityIdForSpecPoint(statement.id)).toMatch(/^phys\./);
    }
    const firstTopic = wjecPhysics.topics[0]!;
    const points = firstTopic.specPoints!;
    const evidence = deriveSkillEvidence(wjecCapabilities, physicsQuestions, []);
    expect(smallestUnprovenCapability([physicsCapabilityIdForSpecPoint(points[2]!.id)], wjecCapabilities, evidence)?.id)
      .toBe(physicsCapabilityIdForSpecPoint(points[4]!.id));
  });

  it("reports real gaps instead of manufacturing full depth from templates", () => {
    const audit = auditLearningDepth(wjecPhysics.topics, physicsQuestions, wjecCapabilities);
    expect(audit.statements).toBe(108);
    expect(audit.statementsWithFullDepth).toBeLessThan(108);
    expect(audit.rows.some((row) => row.gaps.length > 0)).toBe(true);
    expect(new Set(physicsQuestions.map((question) => question.id)).size).toBe(physicsQuestions.length);
    expect(new Set(physicsQuestions.map((q) => q.learning?.demand)).size).toBe(7);
    expect(physicsQuestions.some((q) => /wjec-physics-depth-/.test(q.id))).toBe(false);
  });

  it("keeps Physics content out of the trusted release gate until all checks pass", () => {
    const question = physicsQuestions[0]!;
    expect(humanVerifiedPhysicsQuestion(question)).toBe(false);
    expect(buildPhysicsReviewQueue(physicsQuestions).length).toBe(physicsQuestions.length);
    const approved = applyHumanVerification(question, {
      status: "approved",
      reviewerId: "reviewer-1",
      reviewedAt: "2026-09-08T12:00:00.000Z",
      contentFingerprint: physicsContentFingerprint(question),
      checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
    });
    expect(humanVerifiedPhysicsQuestion(approved)).toBe(true);
    expect(buildPhysicsReviewQueue([{ ...approved, humanVerification: { ...approved.humanVerification!, reviewerId: undefined } }])).toHaveLength(1);
    const readiness = physicsContentReadiness({ topics: wjecPhysics.topics, questions: physicsQuestions, nodes: wjecCapabilities });
    expect(readiness.ready).toBe(false);
    expect(readiness.gaps.length).toBeGreaterThan(0);
  });

  it("provides explicit working for each calculation draft", () => {
    const calculations = physicsQuestions.filter((question) => question.learning?.demand === "calculation");
    expect(calculations.length).toBeGreaterThan(8);
    for (const question of calculations) {
      for (const part of question.parts) expect(part.modelAnswer, question.id).toContain("=");
    }
  });

  it("supplies explicit mark points and real capability mappings for review", () => {
    for (const question of physicsQuestions) {
      for (const part of question.parts) {
        expect(part.markScheme).toHaveLength(part.marks);
        expect(part.modelAnswer.length).toBeGreaterThan(30);
        for (const id of part.capabilityIds ?? []) expect(wjecCapabilities.some((node) => node.id === id)).toBe(true);
        expect(part.prompt).not.toMatch(/connects the capability|a fresh observation related to|work through the unfamiliar transfer/i);
      }
    }
  }, 30_000);

  it("does not treat copied answers as independent evidence", () => {
    const question = physicsQuestions.find((candidate) => candidate.learning?.demand === "explanation")!;
    const part = question.parts[0]!;
    const attempt: Attempt = {
      id: "copied-attempt", userId: "learner", questionId: question.id, subjectId: question.subjectId, topicIds: question.topicIds,
      answers: { [part.id]: part.modelAnswer }, marked: [{ partId: part.id, awarded: part.marks, max: part.marks, creditedPoints: part.markScheme, missedPoints: [], comment: "" }],
      awarded: part.marks, max: part.marks, feedback: "", markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt: "2026-09-08T12:00:00.000Z",
      copiedAnswer: true,
    };
    expect(answerLooksCopied(question, attempt.answers)).toBe(true);
    expect(independentAttempt(attempt)).toBe(false);
  });

  it("uses only complete delayed chains when calibrating intervention effects", () => {
    const rows = Array.from({ length: 20 }, (_, i) => outcome(i));
    expect(durableOutcomeScore(rows[0]!)).toBeGreaterThan(0);
    const calibration = calibrateInterventions(rows).get("guided:phys.kinematics-dynamics.sp-01")!;
    expect(calibration.reliable).toBe(true);
    expect(calibration.sampleSize).toBe(20);
    expect(calibrateInterventions(rows.slice(0, 3)).values().next().value?.reliable).toBe(false);
    expect(effectivenessFor("guided", "phys.kinematics-dynamics.sp-01", calibrateInterventions(rows)).calibrated).toBe(true);
    const incomplete = { ...rows[0]!, delayedRetention: undefined };
    expect(durableOutcomeScore(incomplete)).toBeNull();
    expect(calibrateInterventions([incomplete])).toHaveLength(0);
  });
});
