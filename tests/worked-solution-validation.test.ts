import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import type { Question, QuestionPart } from "@/domain/types";
import { validateWorkedSolution, validateWorkedSolutions } from "@/domain/working-analysis";

function part(overrides: Partial<QuestionPart> = {}): QuestionPart {
  return {
    id: "p",
    label: "(a)",
    prompt: "Calculate the value.",
    marks: 2,
    markScheme: ["Substitute x = 2 into the formula", "Calculate the final value 4 N"],
    modelAnswer: "Substitute x = 2 into the formula.\nCalculate the final value: 4 N.",
    ...overrides,
  };
}

function question(id: string, parts: QuestionPart[]): Question {
  return {
    id,
    subjectId: "maths",
    topicIds: ["algebra"],
    kind: "structured",
    difficulty: 3,
    stem: "Calculate the value.",
    parts,
    totalMarks: parts.reduce((total, current) => total + current.marks, 0),
    calculatorAllowed: false,
    origin: "seed",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("worked solution validation", () => {
  it("passes a model answer that covers each mark-scheme point", () => {
    const result = validateWorkedSolution(part());

    expect(result.status).toBe("pass");
    expect(result.coveredMarkSchemePoints).toBe(2);
    expect(result.markSchemeCoverage).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("fails when a numerical mark-scheme result is contradicted", () => {
    const result = validateWorkedSolution(
      part({
        markScheme: ["Correct answer 12 N"],
        modelAnswer: "Correct answer: 10 N.",
      }),
    );

    expect(result.status).toBe("fail");
    expect(result.coveredMarkSchemePoints).toBe(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "numeric-mismatch", severity: "error", pointIndex: 0 }),
    ]);
  });

  it("does not treat variables in a formula as a numerical result", () => {
    const result = validateWorkedSolution(
      part({
        markScheme: ["Uses binomial probabilities with n=12 and p=0.3"],
        modelAnswer: "Uses the binomial distribution to evaluate the upper tail.",
      }),
    );

    expect(result.status).toBe("review");
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "mark-scheme-gap", severity: "warning" }),
    ]);
  });

  it("accepts Unicode minus signs in authored numerical answers", () => {
    const result = validateWorkedSolution(
      part({
        markScheme: ["Answer -890.3 kJ mol^-1"],
        modelAnswer: "Answer −890.3 kJ mol−1.",
      }),
    );

    expect(result.status).toBe("pass");
  });

  it("flags uncovered qualitative points for author review", () => {
    const result = validateWorkedSolution(
      part({
        markScheme: ["Defines osmosis", "Explains movement through a selectively permeable membrane"],
        modelAnswer: "Osmosis is the movement of water.",
      }),
    );

    expect(result.status).toBe("review");
    expect(result.coveredMarkSchemePoints).toBe(1);
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "mark-scheme-gap", severity: "warning", pointIndex: 1 }),
    ]);
  });

  it("reports missing authored content as hard failures", () => {
    const result = validateWorkedSolution(part({ markScheme: [], modelAnswer: "" }));

    expect(result.status).toBe("fail");
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "missing-model-answer", severity: "error" }),
      expect.objectContaining({ kind: "missing-mark-scheme", severity: "error" }),
    ]);
  });

  it("aggregates part-level findings across the question bank", () => {
    const result = validateWorkedSolutions([
      question("pass", [part()]),
      question("fail", [
        part({
          id: "b",
          markScheme: ["Correct answer 12 N"],
          modelAnswer: "Correct answer: 10 N.",
        }),
      ]),
    ]);

    expect(result.status).toBe("fail");
    expect(result.questionCount).toBe(2);
    expect(result.partCount).toBe(2);
    expect(result.passedParts).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ questionId: "fail", partId: "b", kind: "numeric-mismatch" }),
    ]);
  });

  it("finds no hard answer-key contradictions in the authored seed bank", () => {
    const result = validateWorkedSolutions(seedQuestions);

    expect(result.questionCount).toBeGreaterThan(0);
    expect(result.partCount).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
  });
});
