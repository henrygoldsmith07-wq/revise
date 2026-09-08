import { describe, expect, it } from "vitest";
import {
  accuracyImproved,
  createLearningLoop,
  IMPROVEMENT_EPSILON,
  IMPROVEMENT_FLOOR,
  masteryImproved,
  recordSubsequentAssessment,
} from "@/domain/learning-loop";
import type { Recommendation } from "@/domain/types";

function rec(): Recommendation {
  return {
    activity: "practice",
    subjectId: "subj",
    topicId: "t1",
    minutes: 20,
    reason: "Weak topic",
    score: 1,
    explanation: {
      recoverableMarks: 1,
      marksPerHour: 2,
      lastEvidencePercent: 40,
      daysSinceRetrieval: 1,
      daysToExam: 30,
      paperLabel: null,
      factors: { examGain: 1, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
    },
    factors: { examGain: 1, urgency: 1, weakness: 1, forgetting: 1, uncertainty: 1 },
  };
}

describe("learning-loop effectiveness calculation", () => {
  it("defines improvement explicitly: a real gain must clear the baseline plus a noise epsilon", () => {
    // 0.60 → 0.61 is measurement wobble, not improvement.
    expect(accuracyImproved(0.6, 0.61)).toBe(false);
    expect(accuracyImproved(0.6, 0.6 + IMPROVEMENT_EPSILON)).toBe(true);
    expect(accuracyImproved(0.3, 0.4)).toBe(true);
  });

  it("never calls a regression improvement, regardless of the floor", () => {
    expect(accuracyImproved(0.9, 0.7)).toBe(false);
    expect(accuracyImproved(0.6, 0.4)).toBe(false);
  });

  it("keeps an unknown baseline unknown until the first evidence clears the floor", () => {
    expect(accuracyImproved(null, 0.4)).toBe(false); // a gap is proven, not a gain
    expect(accuracyImproved(null, 0.55)).toBe(true); // directional first evidence
    expect(IMPROVEMENT_FLOOR).toBe(0.55);
  });

  it("does not call a single noisy high answer effective without rising mastery", () => {
    const loop = recordSubsequentAssessment(
      createLearningLoop({
        id: "loop",
        subjectId: "subj",
        topicId: "t1",
        masteryAtDetection: 0.8,
        accuracyAtDetection: null,
        recommendation: rec(),
      }),
      { awarded: 9, max: 10, masteryAfter: 0.8 },
    );
    // Accuracy looks strong, but mastery did not rise — no effective claim.
    expect(loop.subsequentPerformance.improved).toBe(true);
    expect(loop.effective).toBe(false);
    expect(masteryImproved(0.8, 0.8)).toBe(false);
    expect(masteryImproved(0.8, null)).toBe(true); // mastery unmeasured stays open
  });

  it("records a genuine gain with rising mastery as effective", () => {
    const loop = recordSubsequentAssessment(
      createLearningLoop({
        id: "loop",
        subjectId: "subj",
        topicId: "t1",
        masteryAtDetection: 0.3,
        accuracyAtDetection: 0.4,
        recommendation: rec(),
      }),
      { awarded: 8, max: 10, masteryAfter: 0.6 },
    );
    expect(loop.subsequentPerformance.improved).toBe(true);
    expect(loop.effective).toBe(true);
  });

  it("keeps small samples honest: improvement stays directional, not a verdict", () => {
    // One strong attempt after one weak baseline is directional; nothing in
    // the loop record turns it into more than that.
    const loop = recordSubsequentAssessment(
      createLearningLoop({
        id: "loop",
        subjectId: "subj",
        topicId: "t1",
        masteryAtDetection: 0.4,
        accuracyAtDetection: 0.2,
        attemptsAtDetection: 1,
        recommendation: rec(),
      }),
      { awarded: 9, max: 10, masteryAfter: 0.62 },
    );
    expect(loop.subsequentPerformance.improved).toBe(true);
    expect(loop.effective).toBe(true);
    expect(loop.subsequentPerformance.accuracy).toBe(0.9);
  });
});
