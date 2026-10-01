import { describe, expect, it } from "vitest";
import {
  buildMarksAtRisk,
  buildRecoverySession,
  RECOVERY_MARK_BUDGET,
  RECOVERY_MAX_QUESTIONS,
  RECOVERY_MIN_MARK_BUDGET,
} from "@/domain/marks-at-risk";
import type { Attempt, Mistake, Question } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function question(id: string, topicId: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    subjectId: "maths",
    topicIds: [topicId],
    kind: "structured",
    stem: `Stem ${id}`,
    parts: [{ id: `${id}:a`, label: "", prompt: "Answer.", marks: 3, markScheme: ["a", "b", "c"], modelAnswer: "model" }],
    totalMarks: 3,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T09:00:00.000Z",
    ...overrides,
  };
}

function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "u1",
    subjectId: "maths",
    topicId: "algebra",
    questionId: "q-algebra-1",
    attemptId: `attempt-${id}`,
    marksLost: 2,
    description: "Lost a mark",
    category: "method",
    resolved: false,
    createdAt: "2026-09-25T09:00:00.000Z",
    ...overrides,
  };
}

function attempt(id: string, questionId: string, topicId: string, awarded: number, max: number, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    userId: "u1",
    questionId,
    subjectId: "maths",
    topicIds: [topicId],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: "2026-09-28T09:00:00.000Z",
    ...overrides,
  };
}

const bank: Question[] = [
  question("q-algebra-1", "algebra", { kind: "calculation" }),
  question("q-algebra-2", "algebra"),
  question("q-algebra-3", "algebra", { difficulty: 5 }),
  question("q-geometry-1", "geometry", { kind: "short", totalMarks: 2 }),
  question("q-geometry-2", "geometry"),
  question("q-stats-1", "stats", { subjectId: "biology" }),
];

describe("marks at risk", () => {
  it("counts only open lost marks and says so when there is no evidence", () => {
    const empty = buildMarksAtRisk({ mistakes: [], attempts: [], questions: bank, now: NOW });
    expect(empty.totalMarks).toBe(0);
    expect(empty.evidence).toBe("none");
    expect(empty.headline).toMatch(/nothing to estimate/i);

    const report = buildMarksAtRisk({
      mistakes: [mistake("m1"), mistake("m2", { resolved: true, marksLost: 5 }), mistake("m3", { marksLost: 0 })],
      attempts: [attempt("attempt-m1", "q-algebra-1", "algebra", 1, 3)],
      questions: bank,
      now: NOW,
    });
    expect(report.totalMarks).toBe(2);
    expect(report.openMistakes).toBe(1);
    expect(report.evidence).toBe("thin");
  });

  it("says plainly when every lost mark has been repaired", () => {
    const report = buildMarksAtRisk({
      mistakes: [mistake("m1", { resolved: true })],
      attempts: [attempt("a1", "q-algebra-1", "algebra", 3, 3)],
      questions: bank,
      now: NOW,
    });
    expect(report.totalMarks).toBe(0);
    expect(report.headline).toMatch(/no open lost marks/i);
  });

  it("breaks the total down by topic, skill, error type, question type and paper", () => {
    const report = buildMarksAtRisk({
      mistakes: [
        mistake("m1", { marksLost: 3, ao: "AO2", category: "method", questionId: "q-algebra-1" }),
        mistake("m2", { marksLost: 1, ao: "AO1", category: "recall", topicId: "geometry", questionId: "q-geometry-1", attemptId: "attempt-m2" }),
        mistake("m3", { marksLost: 2, category: "recall", topicId: "geometry", questionId: "q-geometry-2", attemptId: "attempt-m3" }),
      ],
      attempts: [
        attempt("attempt-m1", "q-algebra-1", "algebra", 0, 3, { paperId: "p1", paperSpecId: "paper-1" }),
        attempt("attempt-m2", "q-geometry-1", "geometry", 1, 2),
        attempt("attempt-m3", "q-geometry-2", "geometry", 1, 3),
      ],
      questions: bank,
      papers: [{ id: "p1", title: "Summer 2025 Paper 1" }],
      now: NOW,
    });

    expect(report.totalMarks).toBe(6);
    // Equal marks: the topic with more separate losses ranks first.
    expect(report.topics.map((row) => [row.topicId, row.marks])).toEqual([["geometry", 3], ["algebra", 3]]);
    expect(report.skills.find((row) => row.key === "AO2")?.marks).toBe(3);
    expect(report.skills.find((row) => row.key === "unclassified")?.marks).toBe(2);
    expect(report.errorTypes.find((row) => row.key === "recall")?.marks).toBe(3);
    expect(report.questionTypes.map((row) => row.label)).toEqual(expect.arrayContaining(["Calculation", "Short answer", "Structured"]));
    expect(report.papers.find((row) => row.key === "paper:p1")?.label).toBe("Summer 2025 Paper 1");
    expect(report.papers.find((row) => row.key === "practice")?.marks).toBe(3);
    for (const rows of [report.topics, report.skills, report.errorTypes, report.questionTypes, report.papers]) {
      expect(rows.reduce((sum, row) => sum + row.marks, 0)).toBeCloseTo(6, 5);
      expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeGreaterThan(0.99);
    }
  });

  it("flags a pattern as recurring only when it repeats", () => {
    const report = buildMarksAtRisk({
      mistakes: [
        mistake("m1", { misconception: "units", marksLost: 1 }),
        mistake("m2", { misconception: "units", marksLost: 2, questionId: "q-algebra-2" }),
        mistake("m3", { misconception: "terminology", marksLost: 1 }),
      ],
      attempts: [],
      questions: bank,
      now: NOW,
    });
    expect(report.recurring).toHaveLength(1);
    expect(report.recurring[0]).toMatchObject({ key: "tag:units", count: 2, marks: 3, questionCount: 2 });
  });

  it("flags a pattern that has cost marks across several paper sittings, and ranks it first", () => {
    const report = buildMarksAtRisk({
      mistakes: [
        mistake("m1", { misconception: "terminology", marksLost: 1, attemptId: "p1" }),
        mistake("m2", { misconception: "terminology", marksLost: 1, attemptId: "p2" }),
        mistake("m3", { misconception: "units", marksLost: 3, attemptId: "p3" }),
        mistake("m4", { misconception: "units", marksLost: 3, attemptId: "p3" }),
      ],
      attempts: [
        attempt("p1", "q-algebra-1", "algebra", 0, 3, { mode: "paper", paperRunId: "run-a" }),
        attempt("p2", "q-algebra-2", "algebra", 0, 3, { mode: "paper", paperRunId: "run-b" }),
        attempt("p3", "q-algebra-3", "algebra", 0, 3, { mode: "paper", paperRunId: "run-a" }),
      ],
      questions: bank,
      now: NOW,
    });
    expect(report.recurring.map((row) => [row.key, row.paperCount])).toEqual([["tag:terminology", 2], ["tag:units", 1]]);
  });

  it("measures the recent loss rate from trusted attempts only", () => {
    const report = buildMarksAtRisk({
      mistakes: [mistake("m1")],
      attempts: [
        attempt("a1", "q-algebra-1", "algebra", 1, 3),
        attempt("a2", "q-algebra-2", "algebra", 3, 3),
        attempt("a3", "q-algebra-3", "algebra", 0, 3, { markedBy: "self" }),
        attempt("a4", "q-algebra-2", "algebra", 0, 3, { createdAt: "2026-01-01T09:00:00.000Z" }),
      ],
      questions: bank,
      now: NOW,
    });
    expect(report.topics[0]).toMatchObject({ topicId: "algebra", marksAttempted: 6, lossRate: 0.333 });
  });

  it("scopes to enrolled subjects", () => {
    const mistakes = [mistake("m1"), mistake("m2", { subjectId: "biology", topicId: "stats", questionId: "q-stats-1", marksLost: 4 })];
    expect(buildMarksAtRisk({ mistakes, attempts: [], questions: bank, subjectIds: ["maths"], now: NOW }).totalMarks).toBe(2);
    expect(buildMarksAtRisk({ mistakes, attempts: [], questions: bank, subjectId: "biology", now: NOW }).totalMarks).toBe(4);
  });
});

describe("recover these marks", () => {
  const mistakes = [
    mistake("m1", { marksLost: 3, questionId: "q-algebra-1" }),
    mistake("m2", { marksLost: 1, topicId: "geometry", questionId: "q-geometry-1", attemptId: "attempt-m2" }),
  ];

  it("re-sits the questions behind open losses, then adds unseen questions on the same topics", () => {
    const attempts = [attempt("attempt-m1", "q-algebra-1", "algebra", 0, 3), attempt("attempt-m2", "q-geometry-1", "geometry", 1, 2), attempt("seen", "q-algebra-2", "algebra", 3, 3)];
    const session = buildRecoverySession({ mistakes, attempts, questions: bank });

    expect(session.resitIds).toEqual(["q-algebra-1", "q-geometry-1"]);
    expect(session.freshIds).toEqual(expect.arrayContaining(["q-algebra-3", "q-geometry-2"]));
    expect(session.freshIds).not.toContain("q-algebra-2");
    expect(session.freshIds).not.toContain("q-stats-1");
    expect(session.questionIds).toEqual([...session.resitIds, ...session.freshIds]);
    expect(session.recoverableMarks).toBe(4);
    expect(session.coveredMarks).toBe(4);
    expect(session.topics[0]).toEqual({ topicId: "algebra", marks: 3 });
  });

  it("respects the question cap and mark budget", () => {
    const capped = buildRecoverySession({ mistakes, attempts: [], questions: bank, maxQuestions: 2 });
    expect(capped.questionIds).toHaveLength(2);
    const budgeted = buildRecoverySession({ mistakes, attempts: [], questions: bank, markBudget: 5 });
    expect(budgeted.totalMarks).toBeLessThanOrEqual(5);
    expect(budgeted.questionIds.length).toBeGreaterThanOrEqual(1);
  });

  it("sizes the session to what is open when no budget is given", () => {
    const small = buildRecoverySession({ mistakes: [mistake("m1", { marksLost: 1 })], attempts: [], questions: bank });
    expect(small.totalMarks).toBeLessThanOrEqual(RECOVERY_MIN_MARK_BUDGET + 3);
    expect(small.questionIds.length).toBeLessThan(RECOVERY_MAX_QUESTIONS);
    const many = buildRecoverySession({ mistakes: Array.from({ length: 12 }, (_, i) => mistake(`b${i}`, { marksLost: 3 })), attempts: [], questions: bank });
    expect(many.totalMarks).toBeLessThanOrEqual(RECOVERY_MARK_BUDGET);
  });

  it("is empty, with an honest headline, when nothing is open", () => {
    const session = buildRecoverySession({ mistakes: [mistake("m1", { resolved: true })], attempts: [], questions: bank });
    expect(session.questionIds).toEqual([]);
    expect(session.headline).toMatch(/nothing to recover/i);
  });

  it("keeps to the chosen subject", () => {
    const session = buildRecoverySession({ mistakes: [...mistakes, mistake("m3", { subjectId: "biology", topicId: "stats", questionId: "q-stats-1" })], attempts: [], questions: bank, subjectId: "maths" });
    expect(session.questionIds).not.toContain("q-stats-1");
  });
});
