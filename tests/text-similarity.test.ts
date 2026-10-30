import { describe, expect, it } from "vitest";
import {
  contentTokens,
  isTemplatedReasoningMove,
  promptOverload,
  promptSignature,
  setSimilarity,
  textOverload,
} from "@/domain/text-similarity";

// The reskin-detection and novelty gates across the domain all lean on these
// primitives (physics-assessment-quality, marking-confidence, trusted-coverage,
// reskin, reasoning-signature). If a number-swapped reskin slips past
// promptSignature, or a templated reasoning move is counted as authored
// variety, several gates weaken at once — so pin the contracts here directly.

describe("promptSignature", () => {
  it("lowercases, drops stop words and strips punctuation", () => {
    expect(promptSignature("The ball falls for 2.5 s")).toBe("ball falls # s");
    expect(promptSignature("A car moves at 90 km/h")).toBe("car moves # km h");
  });

  it("strips every numeric value to the same placeholder, so a number swap is invisible", () => {
    expect(promptSignature("drops from 4 m in 2 s")).toBe(promptSignature("drops from 9 m in 5 s"));
    expect(promptSignature("a mass of 1.5e3 kg")).toBe(promptSignature("a mass of 250 kg"));
    expect(promptSignature("about 0.5 m")).toBe(promptSignature("about 12 m"));
  });

  it("normalises unicode dashes so the same range matches however it was typed", () => {
    expect(promptSignature("3−4 N")).toBe(promptSignature("3-4 N"));
  });
});

describe("contentTokens", () => {
  it("is the content-word set of the signature — stop words and values gone", () => {
    expect(contentTokens("The cat sat on the mat at 3 pm")).toEqual(new Set(["cat", "sat", "mat", "#", "pm"]));
  });

  it("is empty for text that carried no content", () => {
    expect(contentTokens("the of and").size).toBe(0);
    expect(contentTokens("").size).toBe(0);
  });
});

describe("textOverload", () => {
  it("returns 1 for identical text", () => {
    expect(textOverload("a ball dropped from rest", "a ball dropped from rest")).toBe(1);
  });

  it("returns 1 when one text is contained in the other (the shorter side is fully shared)", () => {
    expect(
      textOverload(
        "describe how the velocity changes when the resultant force is zero",
        "velocity changes when resultant force is zero",
      ),
    ).toBe(1);
  });

  it("stays near 1 for a number-swapped reskin and a light paraphrase", () => {
    expect(
      textOverload("a car brakes from 30 m/s to rest in 5 s", "a car brakes from 60 m/s to rest in 5 s"),
    ).toBe(1);
    expect(
      textOverload(
        "calculate the acceleration of a ball dropped from rest for 2.5 s",
        "find the acceleration of a ball falling from rest for 2.5 seconds",
      ),
    ).toBeGreaterThan(0.5);
  });

  it("stays low for genuinely different operations", () => {
    expect(
      textOverload(
        "photosynthesis converts light energy into chemical energy in chloroplasts",
        "momentum is conserved in every collision between two isolated objects",
      ),
    ).toBeLessThan(0.4);
  });

  it("returns 0 when either side has no content to compare", () => {
    expect(textOverload("", "a ball falls")).toBe(0);
    expect(textOverload("a ball falls", "")).toBe(0);
    expect(textOverload("the of and", "the of and")).toBe(0);
  });
});

describe("promptOverload", () => {
  it("is the legacy alias of textOverload", () => {
    expect(promptOverload).toBe(textOverload);
  });
});

describe("isTemplatedReasoningMove", () => {
  it("rejects generated filler that restates the demand label, and near-empty moves", () => {
    expect(isTemplatedReasoningMove("recall reasoning from the specification")).toBe(true);
    expect(isTemplatedReasoningMove("transfer reasoning with unfamiliar data")).toBe(true);
    expect(isTemplatedReasoningMove("")).toBe(true);
    expect(isTemplatedReasoningMove("too short")).toBe(true);
  });

  it("accepts a move that names the actual operation", () => {
    expect(isTemplatedReasoningMove("resolve forces along the slope before applying Newton's second law")).toBe(false);
    expect(isTemplatedReasoningMove("compute the resultant before applying Newton's second law")).toBe(false);
  });
});

describe("setSimilarity", () => {
  it("is Jaccard similarity of the two sets", () => {
    expect(setSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(setSimilarity(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(setSimilarity(new Set(["a", "b"]), new Set(["c", "d"]))).toBe(0);
  });

  it("returns 0 when either set is empty", () => {
    expect(setSimilarity(new Set(), new Set(["a"]))).toBe(0);
    expect(setSimilarity(new Set(["a"]), new Set())).toBe(0);
    expect(setSimilarity(new Set(), new Set())).toBe(0);
  });
});
