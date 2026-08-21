import { describe, expect, it } from "vitest";
import { misconceptionsForTopic } from "@/content";
import { markQuestion } from "@/domain/marking";
import {
  planRemediation,
  remediatePart,
  remediatePoint,
} from "@/domain/remediation";
import { firstIncorrectStep } from "@/domain/working-analysis";
import type { MarkedPart, Question, QuestionPart, Topic } from "@/domain/types";

const topic: Topic = {
  id: "aqa-gcse-maths.algebra",
  subjectId: "aqa-gcse-maths",
  unitId: "aqa-gcse-maths.algebra.unit",
  title: "Algebra",
  order: 0,
  intrinsicDifficulty: 2,
  summary: "Manipulating algebraic expressions.",
  keyPoints: [
    "Expand each term of the first bracket by every term of the second",
    "Check signs — the −3 in (x − 3) flips the sign of the middle term",
    "Collect like terms into a single simplified expression",
  ],
  commonErrors: [
    "Sign slip — flips a sign when subtracting",
    "Skips working steps and jumps to the final answer",
    "Forgets to collect like terms after expanding",
  ],
};

const part: QuestionPart = {
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

function markedPart(missedPoints: string[], awarded = 0, max = 3): MarkedPart {
  return {
    partId: part.id,
    awarded,
    max,
    creditedPoints: [],
    missedPoints,
    comment: "test",
  };
}

describe("remediatePoint", () => {
  it("names the authored common error when the student's working matches it", () => {
    const answer = "I flipped a sign when subtracting";
    const action = remediatePoint(part, answer, "Expands the brackets", topic, answer);
    expect(action.misconception).toContain("Sign");
    expect(action.confidence).toBeGreaterThanOrEqual(0.5);
    expect(action.action).toMatch(/sign|negative|minus/i);
    expect(action.targetKeyPoint).toContain("sign");
  });

  it("falls back to a generic examiner action when neither the topic nor the algebra explains the gap", () => {
    const action = remediatePoint(part, "the sky is blue", "x^2 - x - 6", topic);
    expect(action.misconception).toBe("Mark-scheme point missed");
    expect(action.confidence).toBeLessThan(0.5);
  });
});

describe("remediatePart", () => {
  it("produces no actions for a fully credited part", () => {
    expect(remediatePart(part, "anything", markedPart([], 3)).actions).toHaveLength(0);
  });

  it("links the first incorrect step to the remediation", () => {
    const answer = "(x+2)(x-3)\n= x^2 + 3x + 2x - 6\n= x^2 + x - 6";
    const analysis = firstIncorrectStep(part, answer);
    expect(analysis.firstIncorrect).not.toBeNull();

    const plan = remediatePart(part, answer, markedPart(["Expands the brackets"]), topic);
    expect(plan.actions.length).toBeGreaterThan(0);
    // The diagnosis quotes the failing line and the step it should have been.
    expect(plan.actions[0]!.evidence).toContain("x^2 + 3x + 2x - 6");
    expect(plan.actions[0]!.misconception).toMatch(/sign|arithmetic|method/i);
  });

  it("deduplicates identical misconceptions across missed points", () => {
    const plan = remediatePart(
      part,
      "I flipped a sign when subtracting",
      markedPart(["Expands the brackets", "x^2 - x - 6"]),
      topic,
    );
    const signActions = plan.actions.filter((a) => a.misconception.toLowerCase().includes("sign"));
    expect(signActions.length).toBeLessThanOrEqual(1);
  });
});

describe("planRemediation + markQuestion integration", () => {
  it("routes a wrong pure expression through marking → first incorrect step → remediation", () => {
    const question: Question = {
      id: "alg-q",
      subjectId: "aqa-gcse-maths",
      topicIds: ["aqa-gcse-maths.algebra"],
      kind: "structured",
      stem: "Expand (x+2)(x-3).",
      parts: [part],
      totalMarks: 3,
      calculatorAllowed: true,
      difficulty: 2,
      origin: "seed",
      source: "authored",
      verification: "checked",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const answer = "(x+2)(x-3)\n= x^2 + 3x + 2x - 6\n= x^2 + x - 6";
    const marked = markQuestion(question, { "alg-expand:0": answer });

    expect(marked.awarded).toBe(0);
    const plan = planRemediation(question, { "alg-expand:0": answer }, marked.marked, topic);
    expect(plan.headline).not.toBeNull();
    expect(plan.parts[0]!.actions.length).toBeGreaterThan(0);
    // At least one action must come from the step diagnosis (sign/arithmetic/
    // method), quoting the failing line — not just a generic restudy.
    const all = plan.parts.flatMap((p) => p.actions);
    expect(
      all.some((a) => /sign|slip|arithmetic|method/i.test(a.misconception)),
    ).toBe(true);
    expect(all.some((a) => a.evidence.includes("x^2 + 3x + 2x - 6"))).toBe(true);
  });
});

describe("misconception library integration", () => {
  const misconceptions = misconceptionsForTopic("wjec-alevel-maths.algebra");

  it("shows the library explanation when the answer matches an entry", () => {
    const action = remediatePoint(
      part,
      "I divided both sides of -2x < 6 by -2 and kept the sign, writing x < -3",
      "Solves -2x < 6 correctly",
      topic,
      undefined,
      undefined,
      misconceptions,
    );
    expect(action.misconceptionEntry?.id).toBe("seed-misconception:inequality-sign-reversal");
    expect(action.misconception).toMatch(/sign stays the same/i);
    expect(action.action).toMatch(/reverse the inequality sign/i);
  });

  it("keeps the generic fallback when no library entry matches", () => {
    const action = remediatePoint(
      part,
      "the sky is blue",
      "x^2 - x - 6",
      topic,
      undefined,
      undefined,
      misconceptions,
    );
    expect(action.misconceptionEntry).toBeUndefined();
    expect(action.misconception).toBe("Mark-scheme point missed");
  });

  it("threads the library through remediatePart", () => {
    const plan = remediatePart(
      part,
      "I divided both sides of -2x < 6 by -2 and kept the sign, writing x < -3",
      markedPart(["Solves -2x < 6 correctly"]),
      topic,
      misconceptions,
    );
    expect(plan.actions[0]?.misconceptionEntry?.id).toBe("seed-misconception:inequality-sign-reversal");
  });
});
