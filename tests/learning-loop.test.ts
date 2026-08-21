import { describe, expect, it } from "vitest";
import { createLearningLoop, learningLoopStats, markAccepted, markCompleted, recordSubsequentAssessment } from "@/domain/learning-loop";
import type { Recommendation } from "@/domain/types";

function rec(topicId: string): Recommendation {
  return {
    activity: "practice",
    subjectId: "subj",
    topicId,
    minutes: 20,
    reason: "Weak topic — practice",
    score: 42,
    explanation: { recoverableMarks: 3, marksPerHour: 9, lastEvidencePercent: 40, daysSinceRetrieval: 5, daysToExam: 14, paperLabel: null, factors: { examGain: 3, urgency: 1.2, weakness: 1.5, forgetting: 1.1, uncertainty: 1 } },
    factors: { examGain: 3, urgency: 1.2, weakness: 1.5, forgetting: 1.1, uncertainty: 1 },
  };
}

describe("closed learning loop", () => {
  it("stores why recommendation generated, evidence, predicted benefit", () => {
    const loop = createLearningLoop({ id: "loop1", subjectId: "subj", topicId: "t1", masteryAtDetection: 0.35, accuracyAtDetection: 0.4, attemptsAtDetection: 3, recommendation: rec("t1") });
    expect(loop.weaknessEvidence.masteryAtDetection).toBe(0.35);
    expect(loop.recommendation.predictedBenefit).toBe(3);
    expect(loop.recommendation.explanation).toBeDefined();
    expect(loop.events).toHaveLength(2);
  });

  it("tracks accepted → completed → subsequent performance → mastery updated → effectiveness", () => {
    let loop = createLearningLoop({ id: "loop1", subjectId: "subj", topicId: "t1", masteryAtDetection: 0.3, accuracyAtDetection: 0.3, recommendation: rec("t1") });
    loop = markAccepted(loop, true);
    expect(loop.accepted).toBe(true);
    loop = markCompleted(loop, true);
    expect(loop.completed).toBe(true);
    loop = recordSubsequentAssessment(loop, { awarded: 8, max: 10, masteryAfter: 0.65 });
    expect(loop.subsequentPerformance.accuracy).toBeCloseTo(0.8);
    expect(loop.masteryAfter).toBe(0.65);
    expect(loop.effective).toBe(true);
    expect(loop.events.some((e) => e.stage === "assessed")).toBe(true);
  });

  it("stats report acceptance/completion/effectiveness", () => {
    let l1 = createLearningLoop({ id: "l1", subjectId: "subj", topicId: "t1", masteryAtDetection: 0.3, recommendation: rec("t1") });
    l1 = markAccepted(l1, true);
    l1 = markCompleted(l1, true);
    l1 = recordSubsequentAssessment(l1, { awarded: 8, max: 10, masteryAfter: 0.7 });
    const l2 = createLearningLoop({ id: "l2", subjectId: "subj", topicId: "t2", masteryAtDetection: 0.3, recommendation: rec("t2") });
    const stats = learningLoopStats([l1, l2]);
    expect(stats.total).toBe(2);
    expect(stats.acceptanceRate).toBeCloseTo(0.5);
    expect(stats.effectivenessRate).toBe(1);
  });

  it("ineffective when no improvement", () => {
    let loop = createLearningLoop({ id: "loop1", subjectId: "subj", topicId: "t1", masteryAtDetection: 0.5, accuracyAtDetection: 0.6, recommendation: rec("t1") });
    loop = markAccepted(loop, true);
    loop = markCompleted(loop, true);
    loop = recordSubsequentAssessment(loop, { awarded: 4, max: 10, masteryAfter: 0.45 });
    expect(loop.effective).toBe(false);
  });
});
