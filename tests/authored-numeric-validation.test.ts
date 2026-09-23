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
