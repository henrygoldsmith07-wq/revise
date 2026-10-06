import { describe, expect, it } from "vitest";
import {
  MOCK_MIN_MARKS,
  MOCK_RECENT_WINDOW_DAYS,
  buildGeneratedPaper,
  generateMockPaper,
} from "@/domain/mock-generator";
import { PHYSICS_SUBJECT_ID } from "@/domain/content-trust";
import type { Attempt, Mistake, Question, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2026-10-06T09:00:00.000Z");
const SUBJECT = "mock-subject";
const TOPIC_A = `${SUBJECT}.algebra`;
const TOPIC_B = `${SUBJECT}.geometry`;

function topic(id: string, title: string, order: number): Topic {
  return {
    id,
    subjectId: SUBJECT,
    unitId: `${SUBJECT}.unit-1`,
    title,
    order,
    intrinsicDifficulty: 2,
    summary: "Test topic.",
    keyPoints: [],
    commonErrors: [],
  };
}

function question(
  id: string,
  topicIds: string[],
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds,
    kind: "structured",
    stem: `Question ${id}.`,
    parts: [],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function attempt(
  id: string,
  questionId: string,
  topicIds: string[],
  awarded: number,
  max: number,
  createdAt: string,
): Attempt {
  return {
    id,
    userId: "local",
    questionId,
    subjectId: SUBJECT,
    topicIds,
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "ai",
    elapsedMs: 30_000,
    mode: "practice",
    createdAt,
  };
}

function mistake(id: string, topicId: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "local",
    subjectId: SUBJECT,
    topicId,
    marksLost: 2,
    resolved: false,
    description: "Lost a mark on this topic.",
    category: "recall",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function mastery(topicId: string, value: number): TopicMastery {
  return {
    topicId,
    subjectId: SUBJECT,
    mastery: value,
    retention: value,
    confidence: 1,
    cardsTotal: 10,
    cardsDue: 0,
    attempts: 5,
    accuracy: value,
    lastStudiedAt: "2026-10-01T00:00:00.000Z",
    weak: value < 0.6,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe("generateMockPaper", () => {
  it("aims more marks at the measured weak topic than the strong one", () => {
    // Equal supply: ten 2-mark questions on each topic.
    const questions = [
      ...Array.from({ length: 10 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 10 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.2), mastery(TOPIC_B, 0.9)],
      attempts: [],
      targetMarks: 12,
      now: NOW,
    });

    const algebra = mock.topics.find((t) => t.topicId === TOPIC_A)!;
    const geometry = mock.topics.find((t) => t.topicId === TOPIC_B)!;
    expect(algebra.evidence).toBe("mastery");
    expect(algebra.marks).toBeGreaterThan(geometry.marks);
    expect(mock.totalMarks).toBeGreaterThan(0);
    expect(new Set(mock.questionIds).size).toBe(mock.questionIds.length);
    // Fresh questions win: none of the picks has been sat before.
    expect(mock.picks.every((p) => p.reason.includes("unattempted"))).toBe(true);
  });

  it("falls back to trusted accuracy when mastery is missing", () => {
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 6 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    // Weak accuracy on topic A, nothing measured on topic B.
    const attempts = [
      attempt("at1", "a0", [TOPIC_A], 0, 4, daysAgo(3)),
      attempt("at2", "a1", [TOPIC_A], 1, 4, daysAgo(4)),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [],
      attempts,
      targetMarks: 8,
      now: NOW,
    });

    const algebra = mock.topics.find((t) => t.topicId === TOPIC_A)!;
    expect(algebra.evidence).toBe("accuracy");
    const geometry = mock.topics.find((t) => t.topicId === TOPIC_B)!;
    expect(algebra.weakness).toBeGreaterThan(geometry.weakness);
    expect(algebra.marks).toBeGreaterThanOrEqual(geometry.marks);
  });

  it("deprefers recently sat questions and says so", () => {
    const questions = [
      question("old", [TOPIC_A], { difficulty: 2 }),
      question("fresh-recent", [TOPIC_A], { difficulty: 2 }),
    ];
    const attempts = [
      attempt("at-old", "old", [TOPIC_A], 0, 2, daysAgo(MOCK_RECENT_WINDOW_DAYS + 5)),
      attempt("at-recent", "fresh-recent", [TOPIC_A], 2, 2, daysAgo(2)),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [],
      attempts,
      targetMarks: 2,
      now: NOW,
    });

    expect(mock.questionIds).toEqual(["old"]);
    expect(mock.picks[0]!.reason).toContain("not recently");
    expect(mock.notes.some((note) => note.includes("deprioritised"))).toBe(true);
  });

  it("covers an unmeasured syllabus evenly and states the baseline", () => {
    const questions = [
      ...Array.from({ length: 5 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 5 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [],
      attempts: [],
      targetMarks: 8,
      now: NOW,
    });

    const algebra = mock.topics.find((t) => t.topicId === TOPIC_A)!;
    const geometry = mock.topics.find((t) => t.topicId === TOPIC_B)!;
    expect(algebra.evidence).toBe("none");
    expect(geometry.evidence).toBe("none");
    expect(Math.abs(algebra.marks - geometry.marks)).toBeLessThanOrEqual(2);
    expect(mock.notes.some((note) => note.includes("baseline"))).toBe(true);
    expect(mock.headline).toContain("baseline");
  });

  it("tops up honestly when weak-topic supply runs out", () => {
    const questions = [
      question("weak-1", [TOPIC_A]), // only 2 marks of supply on the weak topic
      ...Array.from({ length: 8 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.1), mastery(TOPIC_B, 0.9)],
      attempts: [],
      targetMarks: 12,
      now: NOW,
    });

    expect(mock.questionIds).toContain("weak-1");
    // The bank can still reach the target via top-up — the honest signal is
    // the note plus the fact that the weak topic kept only its thin supply.
    expect(mock.totalMarks).toBe(mock.targetMarks);
    const algebra = mock.topics.find((t) => t.topicId === TOPIC_A)!;
    expect(algebra.marks).toBe(2);
    expect(mock.notes.some((note) => note.includes("top") && note.includes("up the paper"))).toBe(true);
  });

  it("warns when the bank is below the useful-mock minimum", () => {
    const questions = [question("only-1", [TOPIC_A]), question("only-2", [TOPIC_B])];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [],
      attempts: [],
      targetMarks: 40,
      now: NOW,
    });

    expect(mock.totalMarks).toBe(4);
    expect(mock.totalMarks).toBeLessThan(MOCK_MIN_MARKS);
    expect(mock.notes.some((note) => note.includes(`${MOCK_MIN_MARKS}-mark minimum`))).toBe(true);
    expect(mock.headline).toContain("Only 4");
    expect(mock.headline).toContain("40-mark target");
  });

  it("excludes questions the caller marks as seen and honours excludeQuestionIds", () => {
    const questions = [
      question("excluded", [TOPIC_A], { totalMarks: 6 }),
      ...Array.from({ length: 5 }, (_, i) => question(`a${i}`, [TOPIC_A])),
    ];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [],
      attempts: [],
      targetMarks: 6,
      excludeQuestionIds: ["excluded"],
      now: NOW,
    });

    expect(mock.questionIds).not.toContain("excluded");
    expect(mock.totalMarks).toBeGreaterThan(0);
  });

  it("leaves out untrusted review-gated questions and reports them", () => {
    // WJEC A-level Physics is review-gated: without human verification a
    // question must not enter the mock.
    const gated = {
      ...question("gated", [TOPIC_A], { subjectId: PHYSICS_SUBJECT_ID, totalMarks: 10 }),
      topicIds: [`${PHYSICS_SUBJECT_ID}.kinematics`],
    };
    const wjecTopic = { ...topic(`${PHYSICS_SUBJECT_ID}.kinematics`, "Kinematics", 1), subjectId: PHYSICS_SUBJECT_ID };
    const mock = generateMockPaper({
      subjectId: PHYSICS_SUBJECT_ID,
      questions: [gated],
      topics: [wjecTopic],
      mastery: [],
      attempts: [],
      targetMarks: 10,
      now: NOW,
    });

    expect(mock.questionIds).toEqual([]);
    expect(mock.notes.some((note) => note.includes("not trusted content"))).toBe(true);
    expect(mock.headline).toContain("No eligible questions");
  });

  it("prefers unattempted supply even when everything was eventually picked", () => {
    // Pass 1 budgets topic A; pass 2 must top up from topic B, and freshness
    // ordering must put unattempted B questions before a recently sat one.
    const questions = [
      question("a-fresh", [TOPIC_A], { totalMarks: 4 }),
      question("b-recent", [TOPIC_B], { totalMarks: 4 }),
      question("b-fresh", [TOPIC_B], { totalMarks: 4 }),
    ];
    const attempts = [attempt("at-b", "b-recent", [TOPIC_B], 0, 4, daysAgo(1))];
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.2), mastery(TOPIC_B, 0.2)],
      attempts,
      targetMarks: 12,
      now: NOW,
    });

    expect(mock.questionIds).toContain("b-fresh");
    expect(mock.questionIds).toContain("a-fresh");
    // The recent one is only taken if the target cannot be met otherwise.
    if (mock.questionIds.includes("b-recent")) {
      expect(mock.totalMarks).toBe(12);
    }
  });

  it("builds a persistable paper tagged as generated", () => {
    const questions = Array.from({ length: 6 }, (_, i) => question(`a${i}`, [TOPIC_A]));
    const mock = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1)],
      mastery: [mastery(TOPIC_A, 0.3)],
      attempts: [],
      targetMarks: 12,
      now: NOW,
    });
    const paper = buildGeneratedPaper(mock, "local", "paper-1");

    expect(paper.id).toBe("paper-1");
    expect(paper.subjectId).toBe(SUBJECT);
    expect(paper.status).toBe("extracted");
    expect(paper.questionIds).toEqual(mock.questionIds);
    expect(paper.totalMarks).toBe(mock.totalMarks);
    expect(paper.generated?.focus).toBe(mock.focus);
    expect(paper.generated?.targetMarks).toBe(12);
    expect(paper.generated?.topicIds).toEqual([TOPIC_A]);
    expect(mock.title).toContain("Bespoke mock");
  });

  it("lifts weakness for open mistakes on an otherwise strong topic", () => {
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => question(`a${i}`, [TOPIC_A])),
      ...Array.from({ length: 6 }, (_, i) => question(`b${i}`, [TOPIC_B])),
    ];
    const clean = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.9), mastery(TOPIC_B, 0.9)],
      attempts: [],
      targetMarks: 8,
      now: NOW,
    });
    const withMistakes = generateMockPaper({
      subjectId: SUBJECT,
      questions,
      topics: [topic(TOPIC_A, "Algebra", 1), topic(TOPIC_B, "Geometry", 2)],
      mastery: [mastery(TOPIC_A, 0.9), mastery(TOPIC_B, 0.9)],
      attempts: [],
      mistakes: [mistake("m1", TOPIC_A), mistake("m2", TOPIC_A)],
      targetMarks: 8,
      now: NOW,
    });

    const cleanA = clean.topics.find((t) => t.topicId === TOPIC_A)!;
    const mistakeA = withMistakes.topics.find((t) => t.topicId === TOPIC_A)!;
    expect(mistakeA.weakness).toBeGreaterThan(cleanA.weakness);
    expect(mistakeA.openMistakes).toBe(2);
  });
});
