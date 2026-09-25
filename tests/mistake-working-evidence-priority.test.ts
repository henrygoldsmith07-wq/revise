import { describe, expect, it } from "vitest";
import { classifyMistake } from "../src/domain/mistake-classification";
import type { Attempt, Mistake, Question, QuestionPart } from "../src/domain/types";

const part: QuestionPart = {
  id: "p1",
  label: "(a)",
  prompt: "Calculate the kinetic energy of the object.",
  marks: 4,
  markScheme: ["substitutes into E = 1/2 mv²", "answer = 25 J"],
  modelAnswer: "E = 1/2 × 2 × 5² = 25 J",
};

const question: Question = {
  id: "q1",
  subjectId: "wjec-alevel-physics",
  topicIds: ["energy"],
  kind: "short",
  stem: part.prompt,
  parts: [part],
  totalMarks: 4,
  calculatorAllowed: true,
  difficulty: 3,
  origin: "seed",
  createdAt: "2026-09-24T00:00:00Z",
};

const attempt: Attempt = {
  id: "a1",
  userId: "local",
  questionId: question.id,
  subjectId: question.subjectId,
  topicIds: question.topicIds,
  answers: { p1: "E = 1/2 × 2 × 5² = 25" },
  marked: [{
    partId: "p1",
    awarded: 3,
    max: 4,
    creditedPoints: ["substitutes into E = 1/2 mv²"],
    missedPoints: ["answer = 25 J"],
    comment: "Unit missing",
  }],
  awarded: 3,
  max: 4,
  feedback: "",
  markedBy: "rubric",
  elapsedMs: 12_000,
  mode: "practice",
  createdAt: "2026-09-24T00:00:00Z",
};

function mistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: "m1",
    userId: "local",
    subjectId: question.subjectId,
    topicId: "energy",
    questionId: question.id,
    attemptId: attempt.id,
    partId: part.id,
    point: "answer = 25 J",
    marksLost: 1,
    description: "Dropped the unit",
    category: "arithmetic",
    resolved: false,
    createdAt: "2026-09-24T00:00:00Z",
    ...overrides,
  };
}

describe("working evidence priority", () => {
  it("keeps a diagnosed unit error as calculation even when the attempt was rushed", () => {
    const result = classifyMistake({
      mistake: mistake({
        timing: "rushed",
        secondsSpent: 12,
        workingErrorKind: "unit-error",
        firstIncorrectStep: 2,
      }),
      question,
      part,
      attempt,
    });

    expect(result.klass).toBe("calculation");
    expect(result.confidence).toBe("high");
    expect(result.reasons).toContain("the working analysis identified a unit error");
    expect(result.reasons).toContain("the first incorrect working step was step 3");
  });

  it("still uses timing when the working analysis found no concrete calculation error", () => {
    const result = classifyMistake({
      mistake: mistake({
        timing: "rushed",
        secondsSpent: 12,
        workingErrorKind: "none",
      }),
      question,
      part,
      attempt,
    });

    expect(result.klass).toBe("timing");
    expect(result.confidence).toBe("high");
  });
});
