import { describe, expect, it } from "vitest";
import { calculateCalculationMastery } from "@/domain/calculation-mastery";
import type { Attempt, Mistake, Question } from "@/domain/types";

const DATE = "2026-01-01T00:00:00.000Z";

function question(
  id: string,
  kind: Question["kind"] = "calculation",
  calculatorAllowed = true,
  topicIds = ["topic-1"],
): Question {
  return {
    id,
    subjectId: "subject-1",
    topicIds,
    kind,
    stem: id,
    parts: [],
    totalMarks: 10,
    calculatorAllowed,
    difficulty: 3,
    origin: "seed",
    createdAt: DATE,
  };
}

function attempt(id: string, questionId: string, awarded: number, index: number): Attempt {
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
    createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

function mistake(id: string, questionId: string, marksLost: number, category: Mistake["category"], misconception?: Mistake["misconception"]): Mistake {
  return {
    id,
    userId: "user-1",
    subjectId: "subject-1",
    topicId: "topic-1",
    questionId,
    marksLost,
    description: "A calculation mark was lost",
    category,
    misconception,
    resolved: false,
    createdAt: DATE,
  };
}

describe("calculation mastery", () => {
  it("filters to calculation questions and weights accuracy by marks", () => {
    const report = calculateCalculationMastery({
      questions: [question("calc"), question("essay", "structured")],
      attempts: [
        attempt("a1", "calc", 8, 1),
        attempt("a2", "calc", 6, 2),
        attempt("a3", "calc", 10, 3),
        attempt("a4", "calc", 4, 4),
        attempt("a5", "calc", 8, 5),
        attempt("a6", "essay", 0, 6),
      ],
      mistakes: [],
    });

    expect(report.attempts).toBe(5);
    expect(report.marksAwarded).toBe(36);
    expect(report.marksAvailable).toBe(50);
    expect(report.accuracy).toBeCloseTo(0.72, 3);
    expect(report.reliable).toBe(true);
    expect(report.status).toBe("developing");
    expect(report.calculator.attempts).toBe(5);
  });

  it("reports calculator context, topic splits and error patterns", () => {
    const report = calculateCalculationMastery({
      questions: [question("allowed", "calculation", true), question("no-calc", "calculation", false), question("other", "short")],
      attempts: [
        attempt("a1", "allowed", 10, 1),
        attempt("a2", "no-calc", 5, 2),
        attempt("a3", "allowed", 8, 3),
        attempt("a4", "no-calc", 6, 4),
        attempt("a5", "allowed", 9, 5),
      ],
      mistakes: [
        mistake("m1", "no-calc", 2, "arithmetic", "significant-figures"),
        mistake("m2", "no-calc", 1, "arithmetic"),
        mistake("m3", "other", 4, "method"),
      ],
    });

    expect(report.calculator.accuracy).toBeCloseTo(0.9, 3);
    expect(report.noCalculator.accuracy).toBeCloseTo(0.55, 3);
    expect(report.errorPatterns[0]).toMatchObject({ key: "significant-figures", marksLost: 2, occurrences: 1 });
    expect(report.errorPatterns[1]).toMatchObject({ key: "arithmetic", marksLost: 1, occurrences: 1 });
    expect(report.errorPatterns).toHaveLength(2);
  });

  it("splits multi-topic marks and exposes a recent trend only with a comparison window", () => {
    const multiTopic = question("multi", "calculation", true, ["topic-1", "topic-2"]);
    const report = calculateCalculationMastery({
      questions: [multiTopic],
      attempts: [
        ...Array.from({ length: 5 }, (_, i) => attempt(`early-${i}`, "multi", 0, i)),
        ...Array.from({ length: 5 }, (_, i) => attempt(`late-${i}`, "multi", 10, i + 5)),
      ],
      mistakes: [],
    });

    expect(report.recent.accuracy).toBe(1);
    expect(report.previous.accuracy).toBe(0);
    expect(report.trend).toBe(1);
    expect(report.byTopic).toHaveLength(2);
    expect(report.byTopic[0].marksAvailable).toBe(50);
    expect(report.byTopic[0].marksAwarded).toBe(25);
    expect(report.byTopic[0].attempts).toBe(10);
  });

  it("does not compare an incomplete previous window", () => {
    const report = calculateCalculationMastery({
      questions: [question("calc")],
      attempts: Array.from({ length: 6 }, (_, i) => attempt(`a-${i}`, "calc", i < 5 ? 0 : 10, i)),
      mistakes: [],
    });

    expect(report.previous.attempts).toBe(0);
    expect(report.trend).toBeNull();
  });

  it("does not call a small sample secure", () => {
    const report = calculateCalculationMastery({
      questions: [question("calc")],
      attempts: [attempt("a1", "calc", 10, 1)],
      mistakes: [],
    });

    expect(report.reliable).toBe(false);
    expect(report.status).toBe("insufficient");
    expect(report.nextAction).toMatch(/4 more/i);
  });
});
