import { it, expect } from "vitest";
import { diagnoseAttemptErrors } from "../src/domain/error-diagnosis-plan";
import type { Question } from "../src/domain/types";
it("prioritizes a multipart part command over a calculate stem", () => {
  const question = { stem: "Calculate the change.", parts: [{ id: "b", label: "(b)", prompt: "Explain the reason.", marks: 2, markScheme: ["reason"] }] } as Question;
  let command: string | null = null;
  diagnoseAttemptErrors({ question, answers: { b: "a proposed reason" }, marked: [{ partId: "b", awarded: 0, max: 2, creditedPoints: [], missedPoints: ["reason"], comment: "" }], classify: (signal) => {
    command = signal.command;
    return { category: "reasoning", confidence: 0.8, reasons: ["missing link"], provenance: "classifier-dev", gated: false };
  } });
  expect(command).toBe("explain");
});
