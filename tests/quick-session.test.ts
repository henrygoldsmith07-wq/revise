import { describe, expect, it } from "vitest";
import {
  parseQuickSessionMinutes,
  quickSessionMarkBudget,
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
  it("accepts only the supported sprint lengths", () => {
    for (const minutes of [5, 10, 20, 30, 45, 60]) expect(parseQuickSessionMinutes(String(minutes))).toBe(minutes);
    for (const bad of ["15", "0", "-5", "10.5", "abc", "", null]) expect(parseQuickSessionMinutes(bad)).toBeNull();
    expect(quickSessionQuestionLimit(5)).toBe(2);
    expect(quickSessionQuestionLimit(10)).toBe(4);
    expect(quickSessionQuestionLimit(20)).toBe(8);
    expect(quickSessionQuestionLimit(30)).toBe(12);
    expect(quickSessionQuestionLimit(45)).toBe(18);
    expect(quickSessionQuestionLimit(60)).toBe(24);
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

  describe("longer sprints", () => {
    const bank: Question[] = Array.from({ length: 30 }, (_, i) => ({
      ...questions[0]!,
      id: `long-${String(i).padStart(2, "0")}`,
      topicIds: [`topic-${i % 3}`],
      totalMarks: 4,
      parts: [{ id: `long-${i}-part`, label: "", prompt: "Answer.", marks: 4, markScheme: ["point"], modelAnswer: "answer" }],
    }));
    const mastery = new Map([["topic-0", 0.1], ["topic-1", 0.4], ["topic-2", 0.9]]);

    it("fits the mark budget rather than the question cap", () => {
      const picked = selectQuickSessionQuestions(bank, [], mastery, 20);
      const marks = picked.reduce((sum, question) => sum + question.totalMarks, 0);
      expect(marks).toBeLessThanOrEqual(quickSessionMarkBudget(20));
      expect(picked.length).toBeLessThanOrEqual(quickSessionQuestionLimit(20));
      expect(picked.length).toBe(5);
    });

    it("interleaves topics, weakest first, instead of one chapter", () => {
      const picked = selectQuickSessionQuestions(bank, [], mastery, 30);
      expect(picked.slice(0, 3).map((question) => question.topicIds[0])).toEqual(["topic-0", "topic-1", "topic-2"]);
      expect(new Set(picked.map((question) => question.topicIds[0])).size).toBe(3);
    });

    it("always offers at least one question, even when it exceeds the budget", () => {
      const big = [{ ...bank[0]!, totalMarks: 40 }];
      expect(selectQuickSessionQuestions(big, [], mastery, 20)).toHaveLength(1);
    });

    it("keeps the fixed small queue for sprints up to ten minutes", () => {
      expect(selectQuickSessionQuestions(bank, [], mastery, 10)).toHaveLength(4);
    });
  });
});
