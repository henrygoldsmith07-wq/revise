import { describe, expect, it } from "vitest";
import { analysePaperWeakness } from "@/domain/paper-weakness";
import type { Attempt, Mistake, Paper, Question } from "@/domain/types";

const paper: Pick<Paper, "id" | "title" | "subjectId" | "questionIds"> = {
  id: "paper-1",
  title: "Summer paper",
  subjectId: "maths",
  questionIds: ["q1", "q2"],
};

const questions: Question[] = [
  {
    id: "q1",
    subjectId: "maths",
    topicIds: ["algebra"],
    paperQuestionNumber: "1",
    kind: "structured",
    stem: "Solve the equation.",
    parts: [],
    totalMarks: 4,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2025-06-01T09:00:00.000Z",
  },
  {
    id: "q2",
    subjectId: "maths",
    topicIds: ["geometry"],
    paperQuestionNumber: "2",
    kind: "structured",
    stem: "Find the angle.",
    parts: [],
    totalMarks: 3,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2025-06-01T09:00:00.000Z",
  },
];

function attempt(id: string, questionId: string, awarded: number, max: number, paperRunId = "run-1"): Attempt {
  return {
    id,
    userId: "u1",
    questionId,
    subjectId: "maths",
    topicIds: questionId === "q1" ? ["algebra"] : ["geometry"],
    answers: {},
    marked: [
      {
        partId: `${questionId}:part`,
        awarded,
        max,
        creditedPoints: awarded ? ["Correct method"] : [],
        missedPoints: awarded < max ? ["States the required relationship"] : [],
        comment: "",
      },
    ],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "paper",
    paperId: "paper-1",
    paperRunId,
    createdAt: "2025-06-02T09:00:00.000Z",
  };
}

function mistake(overrides: Partial<Mistake>): Mistake {
  return {
    id: "m1",
    userId: "u1",
    subjectId: "maths",
    topicId: "algebra",
    attemptId: "a1",
    marksLost: 2,
    description: "Dropped method marks",
    category: "method",
    command: "explain",
    resolved: false,
    createdAt: "2025-06-02T09:00:00.000Z",
    ...overrides,
  };
}

describe("post-paper weakness analysis", () => {
  it("scopes the report to one paper sitting and ranks lost marks by topic", () => {
    const report = analysePaperWeakness({
      paper,
      questions,
      attempts: [
        attempt("a1", "q1", 2, 4),
        attempt("a2", "q2", 3, 3),
        attempt("old", "q1", 0, 4, "older-run"),
        { ...attempt("practice", "q2", 0, 3), mode: "practice", paperRunId: undefined },
      ],
      mistakes: [mistake({})],
      paperRunId: "run-1",
    });

    expect(report.attempts).toBe(2);
    expect(report.marksGained).toBe(5);
    expect(report.marksAvailable).toBe(7);
    expect(report.marksLost).toBe(2);
    expect(report.accuracy).toBe(0.714);
    expect(report.topics[0]).toMatchObject({ topicId: "algebra", marksLost: 2, accuracy: 0.5, openMistakeCount: 1 });
    expect(report.recommendations[0]?.topicId).toBe("algebra");
    expect(report.questions[0]).toMatchObject({ questionId: "q1", label: "Question 1", marksLost: 2 });
    expect(report.causes).toEqual([{ label: "method", marksLost: 2 }]);
    expect(report.commands).toEqual([{ label: "explain", marksLost: 2 }]);
  });

  it("reports a clean paper without inventing weakness", () => {
    const report = analysePaperWeakness({
      paper,
      questions,
      attempts: [attempt("a1", "q1", 4, 4), attempt("a2", "q2", 3, 3)],
      paperRunId: "run-1",
    });

    expect(report.marksLost).toBe(0);
    expect(report.recommendations).toHaveLength(0);
    expect(report.headline).toContain("No dropped marks");
  });
});
