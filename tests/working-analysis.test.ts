import { describe, expect, it } from "vitest";
import {
  analyseAttemptWorking,
  consistentWithModel,
  firstIncorrectStep,
  splitSteps,
  stepSimilarity,
} from "@/domain/working-analysis";
import type { Question, QuestionPart } from "@/domain/types";

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

  it("accepts an equivalent unsimplified final expression as a valid result", () => {
    const analysis = firstIncorrectStep(expandPart, "(x+2)(x-3)\n= x^2 - 3x + 2x - 6");
    expect(analysis.consistency).toBe("alternative-valid");
    expect(analysis.consistentWithModel).toBe(true);
    expect(analysis.firstIncorrect).toBeNull();
  });

  it("reports working-runs-out for a blank answer", () => {
    const analysis = firstIncorrectStep(expandPart, "");
    expect(analysis.consistentWithModel).toBe(false);
    expect(analysis.firstIncorrect!.reason).toBe("working-runs-out");
    expect(analysis.firstIncorrect!.expected).toContain("(x+2)(x-3)");
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

describe("alternative methods and uncertainty", () => {
  it("accepts a different route when it reaches an equivalent final result", () => {
    const part: QuestionPart = {
      ...expandPart,
      id: "kinematics",
      marks: 1,
      markScheme: ["v = 14 m/s"],
      modelAnswer: "v = u + at\nv = 2 + 3 × 4\nv = 14 m/s",
    };
    const answer = "a = (v - u) / t\nv = 14 m/s";
    const analysis = firstIncorrectStep(part, answer);

    expect(analysis.consistency).toBe("alternative-valid");
    expect(analysis.consistentWithModel).toBe(true);
    expect(analysis.firstIncorrect).toBeNull();
    expect(analysis.confidence).toBe("medium");

    const question: Question = {
      id: "q-alt",
      subjectId: "wjec-alevel-physics",
      topicIds: ["motion"],
      kind: "calculation",
      stem: part.prompt,
      parts: [part],
      totalMarks: 1,
      calculatorAllowed: true,
      difficulty: 3,
      origin: "seed",
      createdAt: "2026-09-24T00:00:00Z",
    };
    const marked = [{
      partId: part.id,
      awarded: 1,
      max: 1,
      creditedPoints: part.markScheme,
      missedPoints: [],
      comment: "",
    }];
    const [evidence] = analyseAttemptWorking(question, { [part.id]: answer }, marked);
    expect(evidence?.consistency).toBe("alternative-valid");
    expect(evidence?.firstErrorKind).toBe("none");
    expect(evidence?.firstIncorrectStep).toBeNull();
  });

  it("reports skipped model steps as uncertain when no final result proves the route", () => {
    const part: QuestionPart = {
      ...expandPart,
      modelAnswer: "Set up equation\nSubstitute values\nCalculate result",
    };
    const analysis = firstIncorrectStep(part, "Set up equation");
    expect(analysis.consistency).toBe("uncertain");
    expect(analysis.confidence).toBe("low");
    expect(analysis.firstIncorrect?.reason).toBe("missing-expected-step");
  });

  it("keeps contradictory working as a high-confidence diagnosis", () => {
    const part: QuestionPart = { ...expandPart, modelAnswer: "F = 6 N" };
    const analysis = firstIncorrectStep(part, "F = 6 N\nF = 8 N");
    expect(analysis.consistency).toBe("inconsistent");
    expect(analysis.confidence).toBe("high");
    expect(analysis.firstIncorrect?.reason).toBe("contradictory-working");
  });

  it("does not claim a cause when the answer is blank", () => {
    const analysis = firstIncorrectStep(expandPart, "");
    expect(analysis.consistency).toBe("uncertain");
    expect(analysis.confidence).toBe("low");
  });
});
describe("consistentWithModel", () => {
  it("accepts a model route and a proven equivalent final result", () => {
    expect(
      consistentWithModel(expandPart, "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6"),
    ).toBe(true);
    expect(consistentWithModel(expandPart, "(x+2)(x-3)\n= x^2 + x - 6")).toBe(false);
  });
});
