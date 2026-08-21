import { describe, expect, it } from "vitest";
import { markingConfidence, masteryConfidence, misconceptionConfidence, recommendationConfidence, retentionPredictionConfidence } from "@/domain/confidence";

describe("confidence handling", () => {
  it("marking confidence — high/moderate/low/insufficient", () => {
    expect(markingConfidence({ evidenceStrengths: ["strong","strong","strong"] }).level).toBe("high");
    expect(markingConfidence({ evidenceStrengths: ["partial","partial"] }).level).toBe("moderate");
    expect(markingConfidence({ evidenceStrengths: ["none","none"] }).level).toBe("low");
    expect(markingConfidence({ evidenceStrengths: [] }).level).toBe("insufficient-evidence");
  });

  it("mastery confidence — insufficient when trials <3, low when <8", () => {
    expect(masteryConfidence({ trials: 1, intervalWidth: 0.9 }).level).toBe("insufficient-evidence");
    expect(masteryConfidence({ trials: 5, intervalWidth: 0.6 }).level).toBe("low");
    expect(masteryConfidence({ trials: 12, intervalWidth: 0.15 }).level).toBe("high");
    expect(masteryConfidence({ trials: 10, intervalWidth: 0.3 }).level).toBe("moderate");
  });

  it("misconception confidence — single is low, 3+ high", () => {
    expect(misconceptionConfidence({ occurrences: 0 }).level).toBe("insufficient-evidence");
    expect(misconceptionConfidence({ occurrences: 1 }).level).toBe("low");
    expect(misconceptionConfidence({ occurrences: 3 }).level).toBe("high");
  });

  it("recommendation confidence — thin evidence is low/insufficient", () => {
    expect(recommendationConfidence({ cardsTotal: 0, attempts: 0 }).level).toBe("insufficient-evidence");
    expect(recommendationConfidence({ cardsTotal: 1, attempts: 1 }).level).toBe("low");
    expect(recommendationConfidence({ cardsTotal: 8, attempts: 5, retention: 0.7 }).level).toBe("high");
  });

  it("retention prediction confidence — needs 5 reviews", () => {
    expect(retentionPredictionConfidence({ reviews: 2 }).level).toBe("insufficient-evidence");
    expect(retentionPredictionConfidence({ reviews: 7 }).level).toBe("low");
    expect(retentionPredictionConfidence({ reviews: 12 }).level).toBe("moderate");
    expect(retentionPredictionConfidence({ reviews: 25 }).level).toBe("high");
  });

  it("avoids fake precision — insufficient returns null score", () => {
    expect(markingConfidence({ evidenceStrengths: [] }).score).toBeNull();
    expect(masteryConfidence({ trials: 1, intervalWidth: 1 }).score).toBeNull();
  });
});
