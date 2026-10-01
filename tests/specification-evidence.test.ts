import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { buildSpecificationMap, classifyEvidence, STALE_AFTER_DAYS } from "@/domain/specification-evidence";
import type { Attempt, Question, SpecPoint, Topic, Unit } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const day = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const point = (id: string): SpecPoint => ({ id, ref: id.toUpperCase(), text: `Statement ${id}`, aos: ["AO1"] });
const unit: Unit = { id: "u1", subjectId: "maths", title: "Unit 1", order: 1 };
const topics: Topic[] = [
  { id: "t1", subjectId: "maths", unitId: "u1", title: "Topic one", order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [point("sp1"), point("sp2"), point("sp3")] },
  { id: "t2", subjectId: "maths", unitId: "u1", title: "Topic two", order: 2, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [point("sp4")] },
];

function question(id: string, specPointIds: string[], overrides: Partial<Question> = {}): Question {
  return {
    id,
    subjectId: "maths",
    topicIds: ["t1"],
    kind: "short",
    stem: id,
    parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["x", "y"], modelAnswer: "m", specPointIds }],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T09:00:00.000Z",
    ...overrides,
  };
}

function attempt(id: string, q: Question, awarded: number, daysAgo = 1, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    userId: "u1",
    questionId: q.id,
    subjectId: "maths",
    topicIds: q.topicIds,
    answers: {},
    marked: [{ partId: `${q.id}:a`, awarded, max: 2, creditedPoints: [], missedPoints: [], comment: "" }],
    awarded,
    max: 2,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: day(daysAgo),
    ...overrides,
  };
}

const qs = ["q1", "q2", "q3", "q4"].map((id) => question(id, ["sp1"]));
const bank = [...qs, question("q-sp2", ["sp2"])];

function evidenceFor(attempts: Attempt[], id = "sp1") {
  const map = buildSpecificationMap({ subjectId: "maths", attempts, questions: bank, now: NOW, units: [unit], topics });
  return map.units[0]!.topics.flatMap((topic) => topic.points).find((row) => row.specPointId === id)!;
}

describe("classifyEvidence", () => {
  const base = { distinctQuestions: 3, independentAttempts: 3, marksAvailable: 8, accuracy: 0.9, daysSinceTested: 3 };
  it("needs several distinct, unaided, recent answers before anything is secure", () => {
    expect(classifyEvidence(base)).toEqual({ strength: "established", status: "secure" });
    expect(classifyEvidence({ ...base, distinctQuestions: 2 }).status).toBe("developing");
    expect(classifyEvidence({ ...base, independentAttempts: 2 }).status).toBe("developing");
    expect(classifyEvidence({ ...base, marksAvailable: 6 }).status).toBe("developing");
    expect(classifyEvidence({ ...base, daysSinceTested: STALE_AFTER_DAYS + 1 }).status).toBe("stale");
  });
  it("separates weak from thin and untested", () => {
    expect(classifyEvidence({ ...base, accuracy: 0.3 }).status).toBe("weak");
    expect(classifyEvidence({ distinctQuestions: 1, independentAttempts: 1, marksAvailable: 2, accuracy: 1, daysSinceTested: 0 })).toEqual({ strength: "thin", status: "insufficient" });
    expect(classifyEvidence({ distinctQuestions: 0, independentAttempts: 0, marksAvailable: 0, accuracy: null, daysSinceTested: null })).toEqual({ strength: "untested", status: "no-evidence" });
  });
});

describe("specification map", () => {
  it("reports no evidence, and whether a question exists, before any attempt", () => {
    expect(evidenceFor([])).toMatchObject({ status: "no-evidence", attempts: 0, questionsAvailable: 4, accuracy: null });
    expect(evidenceFor([], "sp3")).toMatchObject({ status: "no-evidence", questionsAvailable: 0 });
  });

  it("does not call a single perfect answer secure", () => {
    const row = evidenceFor([attempt("a1", qs[0]!, 2)]);
    expect(row).toMatchObject({ status: "insufficient", strength: "thin", distinctQuestions: 1, marksGained: 2, marksAvailable: 2 });
  });

  it("is secure only with several distinct questions, enough marks, answered unaided", () => {
    const four = [0, 1, 2, 3].map((i) => attempt(`a${i}`, qs[i]!, 2, i + 1));
    expect(evidenceFor(four)).toMatchObject({ status: "secure", strength: "established", distinctQuestions: 4, independentAttempts: 4, marksAvailable: 8 });
    const tooFewMarks = four.slice(0, 3);
    expect(evidenceFor(tooFewMarks)).toMatchObject({ status: "developing", strength: "building" });
    const sameQuestionRepeated = [0, 1, 2, 3].map((i) => attempt(`r${i}`, qs[0]!, 2, i + 1));
    expect(evidenceFor(sameQuestionRepeated).status).toBe("insufficient");
    const hinted = four.map((row) => ({ ...row, hintTier: "cue" as const }));
    expect(evidenceFor(hinted)).toMatchObject({ status: "developing", independentAttempts: 0 });
  });

  it("marks strong results stale once they are old, and flags weak ones", () => {
    const old = [0, 1, 2, 3].map((i) => attempt(`o${i}`, qs[i]!, 2, STALE_AFTER_DAYS + 5 + i));
    expect(evidenceFor(old).status).toBe("stale");
    const weak = [0, 1, 2].map((i) => attempt(`w${i}`, qs[i]!, 0));
    expect(evidenceFor(weak).status).toBe("weak");
  });

  it("ignores untrusted marks, recall attempts for independence, and other subjects", () => {
    const self = [0, 1, 2].map((i) => attempt(`s${i}`, qs[i]!, 2, 1, { markedBy: "self" }));
    expect(evidenceFor(self).status).toBe("no-evidence");
    const otherSubject = [attempt("x", qs[0]!, 2, 1, { subjectId: "physics" })];
    expect(evidenceFor(otherSubject).attempts).toBe(0);
  });

  it("rolls statements up by topic and unit and names the thinnest topic", () => {
    const map = buildSpecificationMap({ subjectId: "maths", attempts: [0, 1, 2, 3].map((i) => attempt(`a${i}`, qs[i]!, 2, i + 1)), questions: bank, now: NOW, units: [unit], topics });
    expect(map.rollup.total).toBe(4);
    expect(map.rollup.byStatus.secure).toBe(1);
    expect(map.rollup.byStatus["no-evidence"]).toBe(3);
    expect(map.rollup.withQuestions).toBe(2);
    expect(map.units[0]!.topics.map((row) => row.rollup.total)).toEqual([3, 1]);
    expect(map.thinnestTopic).toEqual({ topicId: "t1", lacking: 2 });
  });

  it("skips topics and units with no statements", () => {
    const map = buildSpecificationMap({ subjectId: "maths", attempts: [], questions: bank, now: NOW, units: [unit, { ...unit, id: "empty", order: 2 }], topics: [...topics, { ...topics[0]!, id: "bare", specPoints: undefined }] });
    expect(map.units).toHaveLength(1);
    expect(map.units[0]!.topics.map((row) => row.topic.id)).toEqual(["t1", "t2"]);
  });

  it("builds from the shipped curriculum and question bank", () => {
    const map = buildSpecificationMap({ subjectId: "wjec-alevel-physics", attempts: [], questions: seedQuestions, now: NOW });
    expect(map.rollup.total).toBeGreaterThan(50);
    expect(map.rollup.byStatus["no-evidence"]).toBe(map.rollup.total);
    expect(map.rollup.withQuestions).toBeGreaterThan(0);
  });
});
