import { describe, expect, it } from "vitest";
import { mistakesFromAttempt } from "@/domain/mistakes";
import { rootCauseOf } from "@/domain/mistake-patterns";
import type { Attempt, Question } from "@/domain/types";

const question = (prompt: string): Question => ({
  id: "q", subjectId: "phys", topicIds: ["t"], kind: "short", stem: "A trolley accelerates.", totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", parts: [{ id: "q:a", label: "(a)", prompt, marks: 3, markScheme: ["states F = ma"], modelAnswer: "F = ma" }],
}) as Question;
const attempt = (answer: string): Attempt => ({
  id: "a1", userId: "u", questionId: "q", subjectId: "phys", topicIds: ["t"], answers: { "q:a": answer },
  marked: [{ partId: "q:a", awarded: 0, max: 3, creditedPoints: [], missedPoints: ["states F = ma"], comment: "" }],
  awarded: 0, max: 3, feedback: "", markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt: "2026-09-01T10:00:00.000Z",
});

describe("diagnosis is stored on the mistake", () => {
  it("keeps the confident cause only, and never invents one", () => {
    const [draft] = mistakesFromAttempt(attempt("I don't know"), question("State the relationship between force and acceleration."), () => "m1", new Date("2026-09-01T10:00:00Z"));
    const m = draft!.mistake;
    if (m.errorCategory) {
      expect(m.errorConfidence).toBeGreaterThanOrEqual(0.7);
      expect(m.errorCategory).not.toBe("other");
    } else {
      expect(m.errorConfidence).toBeUndefined();
    }
  });
  it("does not label a typical mistake a misconception just because a keyword tag exists", () => {
    const [draft] = mistakesFromAttempt(attempt("it goes faster"), question("State the relationship between force and acceleration."), () => "m1", new Date("2026-09-01T10:00:00Z"));
    expect(draft!.mistake.misconception).toBeDefined();
    expect(rootCauseOf(draft!.mistake)).not.toBe("misunderstood-concept");
  });
});
