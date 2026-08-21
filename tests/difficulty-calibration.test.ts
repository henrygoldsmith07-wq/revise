import { describe, expect, it } from "vitest";
import { calibrateDifficulty, traceQuestion, traceQuestions } from "@/domain/knowledge-tracing";
import type { QuestionTrace } from "@/domain/knowledge-tracing";
import type { Attempt, Question } from "@/domain/types";

const NOW = "2026-01-01T00:00:00.000Z";

function question(id: string, difficulty: 1 | 2 | 3 | 4 | 5): Question {
  return {
    id,
    subjectId: "subject-1",
    topicIds: ["topic-1"],
    kind: "short",
    stem: id,
    parts: [],
    totalMarks: 10,
    calculatorAllowed: false,
    difficulty,
    origin: "seed",
    createdAt: NOW,
  };
}

function attempt(id: string, questionId: string, awarded: number): Attempt {
  return {
    id,
    userId: "user-1",
    questionId,
    subjectId: "subject-1",
    topicIds: ["topic-1"],
    answers: {},
    marked: [],
    awarded,
    max: 10,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: NOW,
  };
}

function traces(): QuestionTrace[] {
  const hard = question("q-hard", 2);
  const easy = question("q-easy", 4);
  const attemptsByQuestion = new Map([
    [hard.id, Array.from({ length: 5 }, (_, i) => attempt(`hard-${i}`, hard.id, 0))],
    [easy.id, Array.from({ length: 5 }, (_, i) => attempt(`easy-${i}`, easy.id, 10))],
  ]);
  return traceQuestions({ questions: [hard, easy], attemptsByQuestion });
}

describe("difficulty calibration", () => {
  it("keeps sparse item estimates at the authored prior", () => {
    const row = traceQuestion({
      question: question("q-1", 3),
      attempts: [attempt("a-1", "q-1", 0)],
    });

    expect(row.reliable).toBe(false);
    expect(row.empiricalDifficulty).toBe(3);
    expect(row.narrative).toMatch(/not yet reliable/i);
  });

  it("calibrates harder and easier item traces after the evidence threshold", () => {
    const rows = traces();
    expect(rows.find((row) => row.questionId === "q-hard")?.gap).toBeGreaterThan(0);
    expect(rows.find((row) => row.questionId === "q-easy")?.gap).toBeLessThan(0);
    expect(rows.every((row) => row.reliable)).toBe(true);
  });

  it("aggregates traces by authored level with deterministic status", () => {
    const report = calibrateDifficulty([...traces(), traceQuestion({ question: question("q-unattempted", 2), attempts: [] })]);

    expect(report.status).toBe("drifting");
    expect(report.totalAttempts).toBe(10);
    expect(report.reliableQuestions).toBe(2);
    expect(report.driftingQuestions).toBe(2);
    expect(report.levels.map((row) => row.level)).toEqual([2, 4]);
    expect(report.levels[0].attempts).toBe(5);
    expect(report.levels[1].attempts).toBe(5);
  });
});
