import { describe, expect, it } from "vitest";
import { buildPaperAutopsy, REPAIR_MAX_STEPS } from "@/domain/paper-autopsy";
import type { Attempt, Mistake, Paper, Question } from "@/domain/types";

function question(id: string, topicId: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    subjectId: "maths",
    topicIds: [topicId],
    kind: "structured",
    stem: `Stem ${id}`,
    parts: [
      { id: `${id}:a`, label: "(a)", prompt: "Part a", marks: 2, markScheme: ["a1", "a2"], modelAnswer: "m", aos: ["AO1"] },
      { id: `${id}:b`, label: "(b)", prompt: "Part b", marks: 2, markScheme: ["b1", "b2"], modelAnswer: "m", aos: ["AO2"] },
    ],
    totalMarks: 4,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "past-paper",
    paperQuestionNumber: id.slice(-1),
    createdAt: "2026-01-01T09:00:00.000Z",
    ...overrides,
  };
}

const paperQuestions = [
  question("p1", "algebra"),
  question("p2", "geometry"),
  question("p3", "stats", { kind: "calculation", specPointIds: ["sp-stats"] }),
];

const paper: Pick<Paper, "id" | "title" | "subjectId" | "questionIds"> = {
  id: "paper-1",
  title: "Summer paper",
  subjectId: "maths",
  questionIds: paperQuestions.map((q) => q.id),
};

function attempt(questionId: string, awardedA: number, awardedB: number, overrides: Partial<Attempt> = {}): Attempt {
  const q = paperQuestions.find((row) => row.id === questionId)!;
  return {
    id: `att-${questionId}`,
    userId: "u1",
    questionId,
    subjectId: "maths",
    topicIds: q.topicIds,
    answers: {},
    marked: [
      { partId: `${questionId}:a`, awarded: awardedA, max: 2, creditedPoints: [], missedPoints: awardedA < 2 ? [`${questionId} a point`] : [], comment: "" },
      { partId: `${questionId}:b`, awarded: awardedB, max: 2, creditedPoints: [], missedPoints: awardedB < 2 ? [`${questionId} b point`] : [], comment: "" },
    ],
    awarded: awardedA + awardedB,
    max: 4,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "paper",
    paperId: "paper-1",
    paperRunId: "run-1",
    createdAt: "2026-09-28T09:00:00.000Z",
    ...overrides,
  };
}

function mistake(id: string, attemptId: string, topicId: string, marksLost: number, category: Mistake["category"]): Mistake {
  return { id, userId: "u1", subjectId: "maths", topicId, attemptId, marksLost, description: "x", category, resolved: false, createdAt: "2026-09-28T09:05:00.000Z" };
}

const bank: Question[] = [
  ...paperQuestions,
  question("n-algebra-1", "algebra", { origin: "seed", difficulty: 3 }),
  question("n-algebra-2", "algebra", { origin: "seed", difficulty: 5, kind: "short", totalMarks: 1 }),
  question("n-geometry-1", "geometry", { origin: "seed" }),
  question("n-stats-1", "stats", { origin: "seed", kind: "calculation", specPointIds: ["sp-stats"] }),
  question("n-stats-2", "stats", { origin: "seed", kind: "short", totalMarks: 6 }),
  question("n-other-subject", "algebra", { origin: "seed", subjectId: "physics" }),
];

const attempts = [attempt("p1", 0, 1), attempt("p2", 2, 2), attempt("p3", 1, 0)];
const mistakes = [mistake("m1", "att-p1", "algebra", 3, "method"), mistake("m2", "att-p3", "stats", 2, "recall")];

function autopsy(overrides: Partial<Parameters<typeof buildPaperAutopsy>[0]> = {}) {
  return buildPaperAutopsy({ paper, attempts, questions: paperQuestions, mistakes, paperRunId: "run-1", bank, history: attempts, ...overrides });
}

describe("paper autopsy headline", () => {
  it("states what was lost, what has a repair and new question ready, and the first action", () => {
    const { headline } = autopsy();
    expect(headline.lost).toBe(6);
    expect(headline.lines[0]).toBe("You lost 6 marks.");
    expect(headline.recoverable).toBe(6);
    expect(headline.lines[1]).toBe("6 of them have a repair and a new question ready.");
    expect(headline.next).toMatchObject({ marks: 3, stepId: "repair-1", topicId: "algebra" });
  });
  it("counts only losses with an unseen equivalent as ready, never every lost mark", () => {
    const seenEverything = [...attempts, ...bank.filter((row) => row.id.startsWith("n-")).map((row, i) => attempt("p1", 1, 1, { id: `old-${i}`, questionId: row.id, mode: "practice", paperRunId: undefined }))];
    const { headline } = autopsy({ history: seenEverything });
    expect(headline.lost).toBe(6);
    expect(headline.recoverable).toBe(0);
    expect(headline.lines.join(" ")).not.toMatch(/ready/);
  });
  it("finds recurring weaknesses only when one cause hits two different questions", () => {
    const none = autopsy().headline;
    expect(none.recurring).toEqual({ marks: 0, patterns: 0 });
    const twice = autopsy({ mistakes: [mistake("m1", "att-p1", "algebra", 3, "method"), mistake("m2", "att-p3", "stats", 2, "method")] }).headline;
    expect(twice.recurring).toEqual({ marks: 5, patterns: 1 });
    expect(twice.lines).toContain("5 came from one recurring weakness.");
    const sameQuestion = autopsy({ mistakes: [mistake("m1", "att-p1", "algebra", 3, "method"), mistake("m3", "att-p1", "algebra", 1, "method")] }).headline;
    expect(sameQuestion.recurring.patterns).toBe(0);
  });
  it("says nothing when no marks were lost or no trusted evidence exists", () => {
    const perfect = autopsy({ attempts: [attempt("p1", 2, 2), attempt("p2", 2, 2), attempt("p3", 2, 2)], mistakes: [] }).headline;
    expect(perfect).toMatchObject({ lost: 0, lines: [], next: null });
    expect(autopsy({ attempts: attempts.map((row) => ({ ...row, markedBy: "self" as const })) }).headline.lines).toEqual([]);
  });
});

describe("paper autopsy", () => {
  it("accounts for every lost mark in each breakdown", () => {
    const result = autopsy();
    expect(result.marksLost).toBe(6);
    expect(result.byTopic.map((row) => row.key)).toEqual(["algebra", "stats"]);
    for (const rows of [result.byTopic, result.bySkill, result.byErrorType, result.byQuestionType]) {
      expect(rows.reduce((sum, row) => sum + row.marksLost, 0)).toBeCloseTo(6, 5);
    }
    expect(result.bySkill.find((row) => row.key === "AO1")?.marksLost).toBe(3);
    expect(result.bySkill.find((row) => row.key === "AO2")?.marksLost).toBe(3);
    expect(result.byErrorType.find((row) => row.key === "method")?.marksLost).toBe(3);
    expect(result.byErrorType.find((row) => row.key === "recall")?.marksLost).toBe(2);
    expect(result.byErrorType.find((row) => row.key === "unexplained")?.marksLost).toBe(1);
    expect(result.byQuestionType.find((row) => row.key === "calculation")?.marksLost).toBe(3);
  });

  it("ignores untrusted marks and other sittings", () => {
    const none = autopsy({ attempts: attempts.map((row) => ({ ...row, markedBy: "self" as const })) });
    expect(none.hasEvidence).toBe(false);
    expect(none.repairPlan).toEqual([]);
    const other = autopsy({ paperRunId: "run-2" });
    expect(other.hasEvidence).toBe(false);
  });

  it("plans repair by marks lost, with each paper question re-sat once and fresh questions unseen", () => {
    const { repairPlan } = autopsy();
    expect(repairPlan.map((step) => step.topicId)).toEqual(["algebra", "stats"]);
    expect(repairPlan[0]).toMatchObject({ id: "repair-1", marksToRecover: 3, resitIds: ["p1"] });
    expect(repairPlan[0]!.freshIds.every((id) => id.startsWith("n-algebra"))).toBe(true);
    const everyQuestion = repairPlan.flatMap((step) => step.questionIds);
    expect(new Set(everyQuestion).size).toBe(everyQuestion.length);
    expect(everyQuestion).not.toContain("p2");
    expect(everyQuestion).not.toContain("n-other-subject");
    expect(repairPlan.length).toBeLessThanOrEqual(REPAIR_MAX_STEPS);
    for (const step of repairPlan) expect(step.focus.length).toBeGreaterThan(0);
  });

  it("never offers a question the student has already attempted", () => {
    const seen = [...attempts, attempt("p1", 1, 1, { id: "old", questionId: "n-algebra-1", mode: "practice", paperRunId: undefined })];
    const { repairPlan, equivalentRetest } = autopsy({ history: seen });
    expect(repairPlan.flatMap((step) => step.freshIds)).not.toContain("n-algebra-1");
    expect(equivalentRetest.questionIds).not.toContain("n-algebra-1");
  });

  it("builds an equivalent retest of different, matched questions", () => {
    const { equivalentRetest } = autopsy();
    expect(equivalentRetest.available).toBe(true);
    const bySource = new Map(equivalentRetest.pairs.map((pair) => [pair.sourceQuestionId, pair]));
    expect(bySource.get("p1")?.equivalentQuestionId).toBe("n-algebra-1");
    expect(bySource.get("p3")?.equivalentQuestionId).toBe("n-stats-1");
    expect(bySource.get("p3")?.matchedOn).toEqual(expect.arrayContaining(["same specification statement", "same question type"]));
    const ids = equivalentRetest.questionIds;
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(paper.questionIds).not.toContain(id);
    expect(equivalentRetest.totalMarks).toBe(equivalentRetest.pairs.reduce((sum, pair) => sum + pair.equivalentMarks, 0));
  });

  it("refuses to call a retest ready when the bank cannot supply it", () => {
    const { equivalentRetest } = autopsy({ bank: paperQuestions });
    expect(equivalentRetest.available).toBe(false);
    expect(equivalentRetest.questionIds).toEqual([]);
    expect(equivalentRetest.unmatched.sort()).toEqual(["p1", "p3"]);
    expect(equivalentRetest.summary).toMatch(/not enough unseen questions/i);
  });

  it("has nothing to retest when no marks were lost", () => {
    const perfect = autopsy({ attempts: [attempt("p1", 2, 2)], mistakes: [] });
    expect(perfect.marksLost).toBe(0);
    expect(perfect.repairPlan).toEqual([]);
    expect(perfect.equivalentRetest.available).toBe(false);
    expect(perfect.equivalentRetest.summary).toMatch(/nothing to retest/i);
  });
});
