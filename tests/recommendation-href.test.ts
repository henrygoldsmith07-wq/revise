import { describe, expect, it } from "vitest";
import { hrefForRecommendation } from "@/domain/recommender";

// The Today page's hero and queue rows route recommendations with this helper.
// The critical case: a "learn" recommendation is a first pass on untouched
// material — it must open the lesson, never practice questions.
describe("hrefForRecommendation", () => {
  it("sends learn recommendations to the lesson, not practice", () => {
    expect(hrefForRecommendation({ activity: "learn", subjectId: "aqa-gcse-physics", topicId: "aqa-gcse-physics.kinematics-dynamics" })).toBe(
      "/lesson?subject=aqa-gcse-physics",
    );
  });

  it("sends topic-level drill activities to practice", () => {
    for (const activity of ["flashcards", "recall", "practice", "mistakes"] as const) {
      expect(hrefForRecommendation({ activity, subjectId: "s", topicId: "s.t1" })).toBe("/practice?topic=s.t1");
    }
  });

  it("sends subject-wide activities to review", () => {
    expect(hrefForRecommendation({ activity: "paper", subjectId: "s", topicId: null })).toBe("/review");
    expect(hrefForRecommendation({ activity: "practice", subjectId: "s", topicId: null })).toBe("/review");
  });

  it("never routes a learn recommendation without a subject to practice", () => {
    expect(hrefForRecommendation({ activity: "learn", subjectId: "", topicId: "s.t1" })).toBe("/practice?topic=s.t1");
  });
});
