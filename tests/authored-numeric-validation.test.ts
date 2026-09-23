import { describe, expect, it } from "vitest";
import type { QuestionPart } from "@/domain/types";
import { validateWorkedSolution } from "@/domain/working-analysis";

function part(markScheme: string, modelAnswer: string): QuestionPart {
  return {
    id: "authored-numeric",
    label: "(a)",
    prompt: "Calculate the value.",
    marks: 1,
    markScheme: [markScheme],
    modelAnswer,
  };
}

describe("authored numeric validation", () => {
  it("accepts an authored decimal equivalent of an exact surd answer", () => {
    const result = validateWorkedSolution(part("Correct answer √2 or approximately 1.414", "The answer is 1.414."));
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("accepts a coefficient multiplied by a surd as its decimal equivalent", () => {
    const result = validateWorkedSolution(part("Correct answer 2√2", "The answer is approximately 2.828."));
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("does not concatenate a radical coefficient with the evaluated radical", () => {
    const result = validateWorkedSolution(part("Correct answer 2√2", "The answer is 21.414."));
    expect(result.status).toBe("fail");
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "numeric-mismatch", severity: "error" }),
    ]);
  });

  it("ignores exponents inside symbolic rms radicals when checking the final authored value", () => {
    const result = validateWorkedSolution(
      part("c_rms = √⟨c²⟩ = 1.37×10³ m s⁻¹", "Therefore c_rms = 1.37×10³ m s⁻¹."),
    );
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("keeps symbolic rms radicals from inventing a required numeric 2", () => {
    const result = validateWorkedSolution(
      part("c_rms = √⟨c²⟩ ≈ 500 m s⁻¹", "The root-mean-square speed is approximately 500 m s⁻¹."),
    );
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("ignores exponents inside parenthesised symbolic radicals", () => {
    const result = validateWorkedSolution(
      part("Magnitude = √(x² + y²) = 5.0 N", "The magnitude is 5.0 N."),
    );
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("ignores exponents inside square-bracket symbolic radicals", () => {
    const result = validateWorkedSolution(
      part("r = √[a² + b²] = 13 cm", "Therefore r = 13 cm."),
    );
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("accepts an authored decimal equivalent of a pi answer", () => {
    const result = validateWorkedSolution(part("Correct answer 2π", "The value is approximately 6.283."));
    expect(result.issues.filter((issue) => issue.kind === "numeric-mismatch")).toEqual([]);
  });

  it("still rejects a genuine authored numerical contradiction", () => {
    const result = validateWorkedSolution(part("Correct answer 12 N", "The answer is 10 N."));
    expect(result.status).toBe("fail");
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "numeric-mismatch", severity: "error" }),
    ]);
  });
});