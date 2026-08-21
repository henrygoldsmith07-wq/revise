import { describe, expect, it } from "vitest";
import { validateDistractorQuality } from "@/domain/distractor-quality";
import { validateQuestion } from "@/domain/question-validation";
import type { Attempt, Question } from "@/domain/types";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-distractor-1",
    subjectId: "subject",
    topicIds: ["topic-1"],
    kind: "mcq",
    stem: "Which answer is correct?",
    options: ["Correct answer", "Plausible alternative", "Another alternative", "Final alternative"],
    correctIndex: 0,
    parts: [
      {
        id: "q-distractor-1-a",
        label: "",
        prompt: "Choose one.",
        marks: 1,
        markScheme: ["Correct option"],
        modelAnswer: "Correct answer",
        learningClaims: ["identify the correct answer"],
      },
    ],
    totalMarks: 1,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    createdAt: "2026-08-18T09:00:00.000Z",
    ...overrides,
  };
}

function attempt(userId: string, selectedIndex: number, createdAt: string, questionId = "q-distractor-1"): Attempt {
  return {
    id: `${userId}-${createdAt}`,
    userId,
    questionId,
    subjectId: "subject",
    topicIds: ["topic-1"],
    answers: { "q-distractor-1-a": String(selectedIndex) },
    marked: [],
    awarded: selectedIndex === 0 ? 1 : 0,
    max: 1,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 10_000,
    mode: "practice",
    createdAt,
  };
}

describe("validateDistractorQuality", () => {
  it("reports a clean structural MCQ without pretending it has response evidence", () => {
    const report = validateDistractorQuality({ question: question() });

    expect(report.applicable).toBe(true);
    expect(report.optionCount).toBe(4);
    expect(report.distractorCount).toBe(3);
    expect(report.responseCount).toBe(0);
    expect(report.reliable).toBe(false);
    expect(report.status).toBe("unmeasured");
    expect(report.issues).toEqual([]);
    expect(report.options.map((option) => option.status)).toEqual([
      "correct",
      "unmeasured",
      "unmeasured",
      "unmeasured",
    ]);
  });

  it("catches blank and case-insensitive duplicate options", () => {
    const report = validateDistractorQuality({
      question: question({ options: ["Correct answer", "Wrong", " wrong ", " "] }),
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate-option", "blank-option"]),
    );
    expect(report.ok).toBe(false);
    expect(report.status).toBe("needs-review");
  });

  it("uses the latest valid response per learner and flags an unused distractor once reliable", () => {
    const attempts = [
      attempt("u-1", 3, "2026-08-01T09:00:00.000Z"),
      attempt("u-1", 0, "2026-08-02T09:00:00.000Z"),
      attempt("u-2", 0, "2026-08-02T09:00:00.000Z"),
      attempt("u-3", 1, "2026-08-02T09:00:00.000Z"),
      attempt("u-4", 2, "2026-08-02T09:00:00.000Z"),
      attempt("u-5", 0, "2026-08-02T09:00:00.000Z"),
    ];
    const report = validateDistractorQuality({ question: question(), attempts, minResponses: 5 });

    expect(report.responseCount).toBe(5);
    expect(report.reliable).toBe(true);
    expect(report.options.map((option) => option.selectionCount)).toEqual([3, 1, 1, 0]);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "unattractive-distractor",
      severity: "warning",
    }));
    expect(report.options[3].status).toBe("unused");
  });

  it("flags a distractor chosen more often than the keyed answer", () => {
    const attempts = [
      attempt("u-1", 1, "2026-08-03T09:00:00.000Z"),
      attempt("u-2", 1, "2026-08-03T09:00:00.000Z"),
      attempt("u-3", 1, "2026-08-03T09:00:00.000Z"),
      attempt("u-4", 1, "2026-08-03T09:00:00.000Z"),
      attempt("u-5", 0, "2026-08-03T09:00:00.000Z"),
      attempt("u-6", 0, "2026-08-03T09:00:00.000Z"),
    ];
    const report = validateDistractorQuality({ question: question(), attempts, minResponses: 5 });

    expect(report.options[1].selectionRate).toBeCloseTo(4 / 6, 5);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "overselected-distractor",
      severity: "warning",
    }));
    expect(report.status).toBe("needs-review");
    expect(report.ok).toBe(true);
  });

  it("ignores empty answers instead of coercing them to option A", () => {
    const incomplete = attempt("u-1", 0, "2026-08-04T09:00:00.000Z");
    incomplete.answers["q-distractor-1-a"] = "";

    const report = validateDistractorQuality({ question: question(), attempts: [incomplete] });

    expect(report.responseCount).toBe(0);
    expect(report.options[0].selectionCount).toBe(0);
    expect(report.status).toBe("unmeasured");
  });

  it("does not apply distractor checks to non-MCQs", () => {
    const report = validateDistractorQuality({ question: question({ kind: "short", options: undefined, correctIndex: undefined }) });

    expect(report.applicable).toBe(false);
    expect(report.status).toBe("not-applicable");
    expect(report.issues).toEqual([]);
  });

  it("stores the distractor report and its blocking issues in question validation", () => {
    const report = validateQuestion(
      question({ options: ["Correct answer", "Wrong", " wrong ", "Final alternative"] }),
      [],
      { now: new Date("2026-08-18T10:00:00.000Z") },
    );

    expect(report.distractorQuality?.status).toBe("needs-review");
    expect(report.distractorQuality?.issues[0].code).toBe("duplicate-option");
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "duplicate-option", severity: "error" }));
    expect(report.ok).toBe(false);
  });
});
