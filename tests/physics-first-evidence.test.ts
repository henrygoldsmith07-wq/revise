import { describe, expect, it } from "vitest";
import { wjecPhysicsDeepQuestions } from "@/content/questions/wjec-physics-deep";
import { wjecPhysicsCapabilities, wjecCapabilities, physicsCapabilityIdForSpecPoint } from "@/content/capabilities";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { auditLearningDepth } from "@/domain/learning-depth";
import { applyHumanVerification, buildPhysicsReviewQueue, physicsContentReadiness, humanVerifiedPhysicsQuestion } from "@/domain/physics-content-review";
import { answerLooksCopied, independentAttempt } from "@/domain/learning-evidence";
import { calibrateInterventions, durableOutcomeScore, effectivenessFor } from "@/domain/intervention-calibration";
import { deriveSkillEvidence, smallestUnprovenCapability, validateCapabilityGraph } from "@/domain/capability-graph";
import { markPart } from "@/domain/marking";
import type { Attempt, InterventionOutcomeRecord } from "@/domain/types";

const physicsQuestions = wjecPhysicsDeepQuestions;

function outcome(i: number): InterventionOutcomeRecord {
  const at = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
  return {
    id: `intervention-${i}`,
    userId: "learner",
    subjectId: "wjec-alevel-physics",
    topicId: "wjec-alevel-physics.kinematics-dynamics",
    capabilityId: "phys.kinematics-dynamics.sp-01",
    kind: "guided",
    priorState: "weak",
    plannedMinutes: 3,
    actualMinutes: 3,
    support: "scaffold",
    immediate: { awarded: 1, max: 1, independent: false, attemptId: `a-${i}`, at },
    transfer: { awarded: 2, max: 2, independent: true, questionId: `q-t-${i}`, attemptId: `t-${i}`, at },
    delayedRetention: { awarded: 2, max: 2, independent: true, questionId: `q-d-${i}`, attemptId: `d-${i}`, at },
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
      .toBe(physicsCapabilityIdForSpecPoint(points[0]!.id));
  });

  it("provides two distinct families for every demand on every specification statement", () => {
    const audit = auditLearningDepth(wjecPhysics.topics, physicsQuestions, wjecCapabilities);
    expect(audit.statements).toBe(108);
    expect(audit.statementsWithFullDepth).toBe(108);
    expect(audit.rows.every((row) => row.gaps.length === 0)).toBe(true);
    expect(new Set(physicsQuestions.map((question) => question.id)).size).toBe(physicsQuestions.length);
    for (const row of audit.rows) {
      for (const demand of ["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"] as const) {
        const stems = physicsQuestions
          .filter((question) => question.specPointIds?.includes(row.specPointId) && question.learning?.demand === demand)
          .map((question) => question.stem);
        expect(new Set(stems).size, `${row.specPointId}:${demand}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps Physics content out of the trusted release gate until all checks pass", () => {
    const question = physicsQuestions[0]!;
    expect(humanVerifiedPhysicsQuestion(question)).toBe(false);
    expect(buildPhysicsReviewQueue(physicsQuestions).length).toBe(physicsQuestions.length);
    const approved = applyHumanVerification(question, {
      status: "approved",
      reviewerId: "reviewer-1",
      reviewedAt: "2026-09-08T12:00:00.000Z",
      checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true },
    });
    expect(humanVerifiedPhysicsQuestion(approved)).toBe(true);
    expect(buildPhysicsReviewQueue([{ ...approved, humanVerification: { ...approved.humanVerification!, reviewerId: undefined } }])).toHaveLength(1);
    const readiness = physicsContentReadiness({ topics: wjecPhysics.topics, questions: physicsQuestions, nodes: wjecCapabilities });
    expect(readiness.ready).toBe(false);
    expect(readiness.gaps).toHaveLength(0);
  });

  it("keeps every generated calculation answer reachable by the shipped rubric", () => {
    const calculations = physicsQuestions.filter((question) => question.learning?.demand === "calculation");
    expect(calculations).toHaveLength(216);
    for (const question of calculations) {
      for (const part of question.parts) expect(markPart(part, part.modelAnswer).awarded, question.id).toBe(part.marks);
    }
  });

  it("keeps every generated answer aligned with its authored mark scheme", () => {
    // The full calculation inventory is checked above. For prose demands,
    // exercise both variants for every topic/demand shape; markPart's prose
    // matcher is deliberately more expensive than the structural audit.
    const samples = new Map<string, (typeof physicsQuestions)[number]>();
    for (const question of physicsQuestions) {
      const demand = question.learning?.demand;
      if (!demand || demand === "calculation") continue;
      const variant = question.id.endsWith("-1") ? "1" : "0";
      samples.set(`${question.topicIds[0]}:${demand}:${variant}`, question);
    }
    for (const question of samples.values()) {
      for (const part of question.parts) {
        expect(markPart(part, part.modelAnswer).awarded, `${question.id}:${part.id}`).toBe(part.marks);
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
    const rows = [outcome(1), outcome(2), outcome(3)];
    expect(durableOutcomeScore(rows[0]!)).toBeGreaterThan(0);
    const calibration = calibrateInterventions(rows).get("guided:phys.kinematics-dynamics.sp-01")!;
    expect(calibration.reliable).toBe(true);
    expect(calibration.sampleSize).toBe(3);
    expect(effectivenessFor("guided", "phys.kinematics-dynamics.sp-01", calibrateInterventions(rows)).calibrated).toBe(true);
    const incomplete = { ...rows[0]!, delayedRetention: undefined };
    expect(durableOutcomeScore(incomplete)).toBeNull();
    expect(calibrateInterventions([incomplete])).toHaveLength(0);
  });
});
