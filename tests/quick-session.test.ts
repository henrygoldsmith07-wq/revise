import { describe, expect, it } from "vitest";
import {
  parseQuickSessionMinutes,
  quickSessionQuestionLimit,
  selectQuickSessionQuestions,
} from "@/domain/quick-session";
import type { Attempt, Question } from "@/domain/types";

const questions: Question[] = ["q1", "q2", "q3", "q4", "q5"].map((id, index) => ({
  id,
  subjectId: "subject",
  topicIds: [index < 3 ? "weak-topic" : "strong-topic"],
  kind: "short",
  stem: `Question ${id}`,
  parts: [{ id: `${id}-part`, label: "", prompt: "Answer.", marks: index + 1, markScheme: ["point"], modelAnswer: "answer" }],
  totalMarks: index + 1,
  calculatorAllowed: true,
  difficulty: 3,
  origin: "seed",
  createdAt: "2026-08-18T09:00:00.000Z",
}));

function attempt(questionId: string): Attempt {
  return {
    id: `attempt-${questionId}`,
    userId: "local",
    questionId,
    subjectId: "subject",
    topicIds: ["weak-topic"],
    answers: {},
    marked: [],
    awarded: 0,
    max: 1,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1_000,
    mode: "practice",
    createdAt: "2026-08-18T09:00:00.000Z",
  };
}

describe("quick question sessions", () => {
  it("accepts only the two supported time budgets", () => {
    expect(parseQuickSessionMinutes("5")).toBe(5);
    expect(parseQuickSessionMinutes("10")).toBe(10);
    expect(parseQuickSessionMinutes("15")).toBeNull();
    expect(quickSessionQuestionLimit(5)).toBe(2);
    expect(quickSessionQuestionLimit(10)).toBe(4);
  });

  it("prioritises unseen and weaker questions while keeping a short queue", () => {
    const selected = selectQuickSessionQuestions(
      questions,
      [attempt("q1")],
      new Map([
        ["weak-topic", 0.2],
        ["strong-topic", 0.8],
      ]),
      5,
    );

    expect(selected.map((question) => question.id)).toEqual(["q2", "q3"]);
  });

  it("uses the larger queue for ten minutes without repeating a marked question first", () => {
    const selected = selectQuickSessionQuestions(questions, [attempt("q1")], new Map(), 10);

    expect(selected).toHaveLength(4);
    expect(selected.map((question) => question.id)).not.toContain("q1");
  });
});
