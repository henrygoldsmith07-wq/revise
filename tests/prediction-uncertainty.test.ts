import { describe, expect, it } from "vitest";
import { outlookRows, paperRunScores } from "@/domain/exam-outlook";
import type { Attempt } from "@/domain/types";
import type { GradePrediction } from "@/domain/grades";

function prediction(subjectId: string, confidence = 0.2): GradePrediction {
  return {
    subjectId, percent: 62, grade: "B", bestCase: "A", worstCase: "C",
    confidence, trend: 0, headroom: [],
    uncertaintySources: ["Few independently marked exam answers."],
    evidenceLevel: "limited",
    assessmentEvidence: { timedPapers: 0, independentQuestions: 1, assistedQuestions: 3, effectiveSamples: 2 },
  };
}

function attempt(id: string, opts: Partial<Attempt> = {}): Attempt {
  return {
    id, userId: "u1", questionId: "q1", subjectId: "aqa-gcse-maths", topicIds: ["t1"],
    answers: { p1: "x" }, awarded: 2, max: 2, marked: true, markedBy: "rubric",
    mode: "practice", createdAt: "2026-03-01T00:00:00.000Z",
    ...opts,
  } as Attempt;
}

describe("uncertainty-first predictions", () => {
  it("labels sparse bands provisional and counts independent evidence separately", () => {
    const rows = outlookRows([prediction("aqa-gcse-maths", 0.2)], [
      attempt("a1"),
      attempt("a2", { hintTier: "prompt" }),
      attempt("a3", { hintTier: "worked-solution" }),
    ], []);
    expect(rows[0]?.provisional).toBe(true);
    expect(rows[0]?.independentAttempts).toBe(1);
    expect(rows[0]?.attempts).toBe(3);
  });

  it("never lets assisted paper attempts become timed-paper runs", () => {
    const runs = paperRunScores([
      attempt("p1", { mode: "paper", paperRunId: "run-1", hintTier: "prompt" }),
      attempt("p2", { mode: "paper", paperRunId: "run-1" }),
    ], []);
    // Assisted members are excluded; the independent member remains but the
    // run no longer masquerades as two-question exam evidence.
    expect(runs.length).toBe(1);
    expect(runs[0]?.questionCount).toBe(1);
    const assistedOnly = paperRunScores([attempt("p4", { mode: "paper", paperRunId: "run-3", hintTier: "prompt" })], []);
    expect(assistedOnly.length).toBe(0);
    const clean = paperRunScores([attempt("p3", { mode: "paper", paperRunId: "run-2" })], []);
    expect(clean.length).toBe(1);
  });

  it("keeps prediction history frozen: outlook derives from the same band math", () => {
    const rows = outlookRows([prediction("s1", 0.9)], [attempt("a1"), attempt("a2"), attempt("a3")], []);
    // High confidence narrows the band; low confidence widens it. No point estimate.
    expect(rows[0]?.low).toBeLessThanOrEqual(rows[0]?.high ?? 0);
    expect(rows[0]?.provisional).toBe(true); // independent < 3 even with confidence high
  });
});
