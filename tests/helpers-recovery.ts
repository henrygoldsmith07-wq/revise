import type { Attempt, Mistake, Question } from "@/domain/types";

export function question(id: string, topicId: string, overrides: Partial<Question> = {}): Question {
  return {
    id, subjectId: "maths", topicIds: [topicId], kind: "structured", stem: `Stem ${id}`,
    parts: [{ id: `${id}:a`, label: "", prompt: "Answer.", marks: 3, markScheme: ["a", "b", "c"], modelAnswer: "model" }],
    totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T09:00:00.000Z", ...overrides,
  };
}

export function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id, userId: "u1", subjectId: "maths", topicId: "algebra", questionId: "q-a1", attemptId: `att-${id}`, marksLost: 3,
    description: "Lost marks", category: "method", resolved: false, createdAt: "2026-09-20T09:00:00.000Z", ...overrides,
  };
}

export function attempt(id: string, questionId: string, awarded: number, max: number, createdAt: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id, userId: "u1", questionId, subjectId: "maths", topicIds: ["algebra"], answers: {}, marked: [], awarded, max, feedback: "",
    markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt, ...overrides,
  };
}

export const bank: Question[] = ["q-a1", "q-a2", "q-a3", "q-a4", "q-a5"].map((id) => question(id, "algebra"))
  .concat(["q-g1", "q-g2", "q-g3"].map((id) => question(id, "geometry")));
