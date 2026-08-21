import { describe, expect, it } from "vitest";
import { assessExplanation, explanationBandLabel } from "@/domain/explanation-mastery";

const topic = {
  id: "forces",
  keyPoints: [
    "Force equals mass times acceleration, F = ma.",
    "Weight is the force caused by a gravitational field.",
    "Resultant force changes an object's velocity.",
  ],
};

describe("explanation mastery", () => {
  it("marks the core ideas secure when the explanation covers them", () => {
    const result = assessExplanation(
      topic,
      "Force equals mass times acceleration, so F = ma. Weight is the force caused by a gravitational field. A resultant force changes an object's velocity.",
    );

    expect(result.secureCount).toBe(3);
    expect(result.developingCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.score).toBe(1);
    expect(result.band).toBe("secure");
  });

  it("separates developing ideas from ideas that were not explained", () => {
    const result = assessExplanation(topic, "Force equals mass times acceleration. Weight is a force.");

    expect(result.points.map((point) => point.status)).toEqual(["secure", "developing", "missing"]);
    expect(result.band).toBe("starting");
  });

  it("does not award coverage to an empty explanation", () => {
    const result = assessExplanation(topic, "   ");

    expect(result.answerWordCount).toBe(0);
    expect(result.score).toBe(0);
    expect(result.points.every((point) => point.status === "missing")).toBe(true);
    expect(explanationBandLabel(result.band)).toBe("Start with the core ideas");
  });
});
