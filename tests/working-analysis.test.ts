import { describe, expect, it } from "vitest";
import {
  consistentWithModel,
  firstIncorrectStep,
  splitSteps,
  stepSimilarity,
} from "@/domain/working-analysis";
import type { QuestionPart } from "@/domain/types";

const expandPart: QuestionPart = {
  id: "alg-expand:0",
  label: "(a)",
  prompt: "Expand (x+2)(x-3).",
  marks: 3,
  markScheme: ["Expands the brackets", "Collects like terms", "x^2 - x - 6"],
  modelAnswer: "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6",
  learningClaims: [
    "expands two linear brackets",
    "collects like terms",
    "states the simplified quadratic",
  ],
  aos: ["AO2"],
  specPointIds: ["aqa-gcse-maths.algebra.sp-01"],
};

describe("splitSteps", () => {
  it("splits on newlines, =>, semicolons and connective words", () => {
    expect(splitSteps("a\nb => c; d then e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns an empty list for blank input", () => {
    expect(splitSteps("   \n  ")).toEqual([]);
  });
});

describe("stepSimilarity", () => {
  it("scores a proven-equal expression as a perfect match", () => {
    expect(stepSimilarity("x^2 - 3x + 2x - 6", "= x^2 - 3x + 2x - 6")).toBe(1);
  });

  it("scores a proven-different expression low, despite shared digits", () => {
    // Both contain 2 and 6, but the polynomial differs — this must NOT look like a match.
    expect(stepSimilarity("x^2 + x - 6", "x^2 - x - 6")).toBeLessThan(0.5);
  });

  it("falls back to keyword overlap for prose steps", () => {
    expect(stepSimilarity("I expanded the brackets", "Expands the brackets")).toBeGreaterThan(0.6);
  });
});

describe("firstIncorrectStep", () => {
  it("accepts working that matches the model throughout", () => {
    const analysis = firstIncorrectStep(
      expandPart,
      "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6",
    );
    expect(analysis.consistentWithModel).toBe(true);
    expect(analysis.firstIncorrect).toBeNull();
  });

  it("pinpoints the first step where a sign error is introduced", () => {
    const analysis = firstIncorrectStep(
      expandPart,
      "(x+2)(x-3)\n= x^2 + 3x + 2x - 6\n= x^2 + x - 6",
    );
    expect(analysis.consistentWithModel).toBe(false);
    expect(analysis.firstIncorrect).not.toBeNull();
    expect(analysis.firstIncorrect!.stepIndex).toBe(1);
    expect(analysis.firstIncorrect!.studentStep).toContain("3x + 2x");
    expect(analysis.firstIncorrect!.reason).toBe("content-mismatch");
  });

  it("reports the skipped final step when working runs out early", () => {
    const analysis = firstIncorrectStep(expandPart, "(x+2)(x-3)\n= x^2 - 3x + 2x - 6");
    expect(analysis.consistentWithModel).toBe(false);
    expect(analysis.firstIncorrect!.reason).toBe("missing-expected-step");
    expect(analysis.firstIncorrect!.expected).toContain("x^2 - x - 6");
  });

  it("reports working-runs-out for a blank answer", () => {
    const analysis = firstIncorrectStep(expandPart, "");
    expect(analysis.consistentWithModel).toBe(false);
    expect(analysis.firstIncorrect!.reason).toBe("working-runs-out");
    expect(analysis.firstIncorrect!.expected).toContain("x^2 - x - 6");
  });

  it("uses learning claims as model steps when the model answer is a single line", () => {
    const part: QuestionPart = {
      ...expandPart,
      modelAnswer: "x^2 - x - 6",
      learningClaims: ["expands the brackets", "collects like terms", "states x^2 - x - 6"],
    };
    const analysis = firstIncorrectStep(part, "I expanded the brackets");
    expect(analysis.modelSteps).toHaveLength(3);
    expect(analysis.firstIncorrect!.reason).toBe("missing-expected-step");
  });
});

describe("consistentWithModel", () => {
  it("is true only when every step matches", () => {
    expect(
      consistentWithModel(expandPart, "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6"),
    ).toBe(true);
    expect(consistentWithModel(expandPart, "(x+2)(x-3)\n= x^2 + x - 6")).toBe(false);
  });
});
