import { describe, expect, it } from "vitest";
import { buildMistakePatterns, patternRepaired, rootCauseOf } from "@/domain/mistake-patterns";
import type { Attempt, Mistake, Question } from "@/domain/types";

const mk = (id: string, o: Partial<Mistake> = {}): Mistake => ({
  id, userId: "u", subjectId: "s", topicId: "t1", questionId: `q-${id}`, marksLost: 2, description: "", category: "communication",
  resolved: false, createdAt: "2026-09-01T10:00:00.000Z", ...o,
} as Mistake);
const q = (id: string, family: string): Question => ({
  id, subjectId: "s", topicIds: ["t1"], kind: "short", stem: id, totalMarks: 2, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", learning: { familyId: family } as Question["learning"],
  parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["a"], modelAnswer: "m" }],
}) as Question;
const att = (id: string, questionId: string, awarded: number, o: Partial<Attempt> = {}): Attempt => ({
  id, userId: "u", questionId, subjectId: "s", topicIds: ["t1"], answers: {}, marked: [], awarded, max: 2, feedback: "",
  markedBy: "rubric", elapsedMs: 1, mode: "practice", createdAt: "2026-09-10T10:00:00.000Z", ...o,
});

describe("root causes", () => {
  it("maps working errors, misconceptions and categories", () => {
    expect(rootCauseOf(mk("a", { workingErrorKind: "unit-error" }))).toBe("unit-error");
    expect(rootCauseOf(mk("a", { misconception: "units" }))).toBe("unit-error");
    expect(rootCauseOf(mk("a", { misconception: "conceptual" }))).toBe("misunderstood-concept");
    expect(rootCauseOf(mk("a", { misconceptionEntryId: "lib-1" }))).toBe("misunderstood-concept");
    expect(rootCauseOf(mk("a", { category: "communication", command: "evaluate" }))).toBe("poor-evaluation");
    expect(rootCauseOf(mk("a", { category: "communication", command: "explain" }))).toBe("insufficient-explanation");
    expect(rootCauseOf(mk("a", { category: "unclassified", timing: "rushed" }))).toBe("timing");
    expect(rootCauseOf(mk("a", { category: "recall" }), { prerequisiteWeakTopics: new Set(["t1"]) })).toBe("prerequisite-weakness");
  });
});

describe("root cause from real mistake data", () => {
  it("does not read the default 'other' tag as a misconception", () => {
    expect(rootCauseOf(mk("a", { misconception: "other", category: "recall" }))).toBe("missing-knowledge");
    expect(rootCauseOf(mk("a", { misconception: "other", category: "method" }))).toBe("wrong-method");
  });
  it("prefers a confident stored diagnosis over keyword tags", () => {
    expect(rootCauseOf(mk("a", { misconception: "units", errorCategory: "command-word", category: "method" }))).toBe("command-word-error");
    expect(rootCauseOf(mk("a", { errorCategory: "application", category: "recall" }))).toBe("poor-application");
    expect(rootCauseOf(mk("a", { errorCategory: "knowledge-gap", category: "method" }))).toBe("missing-knowledge");
  });
  it("routes command-word and application causes to different interventions", () => {
    const patterns = buildMistakePatterns({
      mistakes: [mk("1", { errorCategory: "command-word", questionId: "x1" }), mk("2", { errorCategory: "command-word", questionId: "x2", createdAt: "2026-09-04T10:00:00.000Z" }),
        mk("3", { errorCategory: "application", questionId: "x3" })],
      attempts: [], questions: [],
    });
    expect(patterns.find((row) => row.cause === "command-word-error")).toMatchObject({ intervention: "technique-intervention", recurring: true });
    expect(patterns.find((row) => row.cause === "poor-application")?.intervention).toBe("independent-set");
  });
});

describe("mistake patterns", () => {
  const mistakes = [
    mk("1", { questionId: "qa", createdAt: "2026-09-01T10:00:00.000Z" }),
    mk("2", { questionId: "qb", createdAt: "2026-09-03T10:00:00.000Z", marksLost: 3 }),
    mk("3", { questionId: "qc", topicId: "t2", createdAt: "2026-09-05T10:00:00.000Z" }),
    mk("4", { category: "arithmetic", questionId: "qd" }),
  ];
  it("groups recurring causes across questions, topics and dates", () => {
    const [first] = buildMistakePatterns({ mistakes, attempts: [], questions: [] });
    expect(first).toMatchObject({ cause: "insufficient-explanation", questions: 3, marksLost: 7, recurring: true, repaired: false, intervention: "technique-intervention" });
    expect(first!.topics).toEqual(["t1", "t2"]);
    expect(first!.headline).toBe("You have lost 7 marks across 3 questions through correct ideas without enough explanation or linking.");
  });
  it("does not call a single occurrence recurring", () => {
    const only = buildMistakePatterns({ mistakes: [mk("1")], attempts: [], questions: [] });
    expect(only[0]!.recurring).toBe(false);
  });
  it("ignores zero-mark rows and other subjects", () => {
    expect(buildMistakePatterns({ mistakes: [mk("1", { marksLost: 0 }), mk("2", { subjectId: "x" })], attempts: [], questions: [], subjectId: "s" })).toEqual([]);
  });
});

describe("repair needs a different question later", () => {
  const resolved = [mk("1", { questionId: "qa", resolved: true }), mk("2", { questionId: "qb", resolved: true })];
  const bank = [q("qa", "fam-a"), q("qb", "fam-b"), q("same-family", "fam-a"), q("fresh", "fam-z")];
  it("is not repaired while any mistake is open", () => {
    expect(patternRepaired([resolved[0]!, mk("3", { questionId: "qc" })], [att("a", "fresh", 2)], bank)).toBe(false);
  });
  it("ignores a retry of the same question or the same family", () => {
    expect(patternRepaired(resolved, [att("a", "qa", 2)], bank)).toBe(false);
    expect(patternRepaired(resolved, [att("a", "same-family", 2)], bank)).toBe(false);
  });
  it("ignores hinted, low-scoring or earlier successes", () => {
    expect(patternRepaired(resolved, [att("a", "fresh", 2, { hintTier: "cue" })], bank)).toBe(false);
    expect(patternRepaired(resolved, [att("a", "fresh", 1)], bank)).toBe(false);
    expect(patternRepaired(resolved, [att("a", "fresh", 2, { createdAt: "2026-08-01T00:00:00.000Z" })], bank)).toBe(false);
  });
  it("accepts an independent later success on a different family", () => {
    expect(patternRepaired(resolved, [att("a", "fresh", 2)], bank)).toBe(true);
  });
});
