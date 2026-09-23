import { describe, expect, it } from "vitest";
import {
  WEAK_EXAM_MAX_QUESTIONS,
  WEAK_EXAM_MAX_TOPICS,
  WEAK_EXAM_WINDOW_DAYS,
  buildWeakTopicExam,
  missesSince,
  summarizeWeakTopics,
} from "@/domain/weak-topic-exam";
import type { Mistake, Question, QuestionPart } from "@/domain/types";

// ---------------------------------------------------------------------------
// Weak-topic exam — the last 7 days of misses as a short paper.
// ---------------------------------------------------------------------------

function part(id: string): QuestionPart {
  return { id, label: "a", prompt: "Explain…", marks: 2, markScheme: ["point"], modelAnswer: "answer" };
}

function q(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    subjectId: "aqa-biology",
    topicIds: ["aqa-biology.t1"],
    kind: "short",
    stem: "stem",
    parts: [part("p1")],
    totalMarks: 2,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mistake(overrides: Partial<Mistake>): Mistake {
  return {
    id: "m1",
    userId: "u",
    subjectId: "aqa-biology",
    topicId: "aqa-biology.t1",
    questionId: "q1",
    description: "missed a point",
    category: "recall",
    marksLost: 1,
    resolved: false,
    createdAt: "2026-08-28T10:00:00.000Z",
    ...overrides,
  } as Mistake;
}

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("missesSince — the 7-day window", () => {
  it("keeps only misses with marks lost inside the window", () => {
    const inside = mistake({ id: "in", createdAt: "2026-08-29T09:00:00.000Z", marksLost: 2 });
    const boundary = mistake({ id: "edge", createdAt: "2026-08-25T12:00:00.000Z", marksLost: 1 });
    const old = mistake({ id: "old", createdAt: "2026-08-01T09:00:00.000Z", marksLost: 3 });
    const zeroMarks = mistake({ id: "zero", createdAt: "2026-08-30T09:00:00.000Z", marksLost: 0 });
    expect(missesSince([inside, old, zeroMarks, boundary], WEAK_EXAM_WINDOW_DAYS, NOW).map((m) => m.id)).toEqual([
      "in",
      "edge",
    ]);
  });

  it("keeps resolved misses too — a mark was still dropped this week", () => {
    const recovered = mistake({ id: "recovered", createdAt: "2026-08-30T09:00:00.000Z", resolved: true });
    expect(missesSince([recovered], WEAK_EXAM_WINDOW_DAYS, NOW).map((m) => m.id)).toEqual(["recovered"]);
  });
});

describe("summarizeWeakTopics — grouping and ordering", () => {
  const t1a = mistake({ id: "a", topicId: "aqa-biology.t1", marksLost: 1, questionId: "q-same" });
  const t1b = mistake({ id: "b", topicId: "aqa-biology.t1", marksLost: 3, questionId: "q-same" });
  const t1c = mistake({ id: "c", topicId: "aqa-biology.t1", marksLost: 1, questionId: "q-other" });
  const t2 = mistake({ id: "d", topicId: "aqa-biology.t2", marksLost: 5, questionId: "q-gone" });

  it("groups by topic, ranking worst-first by marks lost", () => {
    const topics = summarizeWeakTopics([t1a, t1b, t1c, t2], [
      q({ id: "q-same", topicIds: ["aqa-biology.t1"] }),
      q({ id: "q-other", topicIds: ["aqa-biology.t1"] }),
    ]);
    expect(topics.map((topic) => topic.topicId)).toEqual(["aqa-biology.t1", "aqa-biology.t2"]);
    expect(topics[0]!.misses).toBe(3);
    expect(topics[0]!.marksLost).toBe(5);
  });

  it("lists each topic's source questions best-first, skipping questions that no longer exist", () => {
    const topics = summarizeWeakTopics([t1a, t1b, t1c, t2], [
      q({ id: "q-same", topicIds: ["aqa-biology.t1"] }),
      q({ id: "q-other", topicIds: ["aqa-biology.t1"] }),
    ]);
    // q-same dropped 4 marks across two misses → first; q-gone is not stored → omitted.
    expect(topics[0]!.questionIds).toEqual(["q-same", "q-other"]);
    expect(topics[1]!.questionIds).toEqual([]);
  });
});

describe("buildWeakTopicExam — the assembled paper", () => {
  const mistakes = [
    mistake({ id: "m1", topicId: "aqa-biology.t1", questionId: "q-1", marksLost: 2, createdAt: "2026-08-27T10:00:00.000Z" }),
    mistake({ id: "m2", topicId: "aqa-biology.t1", questionId: "q-2", marksLost: 1, createdAt: "2026-08-29T10:00:00.000Z" }),
    mistake({ id: "m3", topicId: "aqa-biology.t2", questionId: "q-3", marksLost: 4, createdAt: "2026-08-30T10:00:00.000Z" }),
    mistake({ id: "m4", topicId: "aqa-biology.t3", questionId: "q-4", marksLost: 1, createdAt: "2026-08-31T10:00:00.000Z" }),
    mistake({ id: "m5", topicId: "aqa-biology.t4", questionId: "q-5", marksLost: 1, createdAt: "2026-08-31T11:00:00.000Z" }),
    mistake({ id: "m6", topicId: "aqa-biology.t5", questionId: "q-6", marksLost: 1, createdAt: "2026-08-31T12:00:00.000Z" }),
  ];
  const questions = [
    q({ id: "q-1", topicIds: ["aqa-biology.t1"], totalMarks: 4 }),
    q({ id: "q-2", topicIds: ["aqa-biology.t1"], totalMarks: 2 }),
    q({ id: "q-3", topicIds: ["aqa-biology.t2"], totalMarks: 6 }),
    q({ id: "q-4", topicIds: ["aqa-biology.t3"], totalMarks: 1 }),
    q({ id: "q-5", topicIds: ["aqa-biology.t4"], totalMarks: 1 }),
    q({ id: "q-6", topicIds: ["aqa-biology.t5"], totalMarks: 1 }),
  ];

  it("puts the most-lost topic's exact missed questions first, then fills from weak topics", () => {
    const exam = buildWeakTopicExam({ mistakes, questions, now: NOW });
    // t2 (4 marks) first → q-3; then t1 → q-1, q-2; the fill adds nothing already seen.
    expect(exam.questionIds.slice(0, 3)).toEqual(["q-3", "q-1", "q-2"]);
    // Fill comes from the same weak topics only — never a topic with zero window misses.
    const weakTopicIds = new Set(exam.topics.map((topic) => topic.topicId));
    expect(weakTopicIds).toEqual(new Set(["aqa-biology.t2", "aqa-biology.t1", "aqa-biology.t3"]));
    expect(exam.questionIds.every((id) => weakTopicIds.has(questions.find((question) => question.id === id)!.topicIds[0]!))).toBe(true);
    expect(exam.questionIds.length).toBeLessThanOrEqual(WEAK_EXAM_MAX_QUESTIONS);
  });

  it("caps topics at three and totals the paper's marks", () => {
    const exam = buildWeakTopicExam({ mistakes, questions, now: NOW });
    expect(exam.topics.length).toBe(WEAK_EXAM_MAX_TOPICS);
    expect(exam.topics.map((topic) => topic.marksLost)).toEqual([4, 3, 1]); // t2, t1, then earliest t3
    const paper = exam.questionIds.map((id) => questions.find((question) => question.id === id)!.totalMarks);
    expect(exam.totalMarks).toBe(paper.reduce((sum, marks) => sum + marks, 0));
  });

  it("dedupes: the same question re-sat twice is in the paper once", () => {
    const repeated = [
      ...mistakes,
      mistake({ id: "m7", topicId: "aqa-biology.t2", questionId: "q-3", marksLost: 2, createdAt: "2026-08-31T13:00:00.000Z" }),
    ];
    const exam = buildWeakTopicExam({ mistakes: repeated, questions, now: NOW });
    expect(new Set(exam.questionIds).size).toBe(exam.questionIds.length);
  });

  it("reports the oldest miss in the window as `since`", () => {
    const exam = buildWeakTopicExam({ mistakes, questions, now: NOW });
    expect(exam.since).toBe("2026-08-27T10:00:00.000Z");
  });

  it("returns an empty paper when nothing in the window is stored or recoverable", () => {
    const none = buildWeakTopicExam({ mistakes: [], questions, now: NOW });
    expect(none.questionIds).toEqual([]);
    expect(none.topics).toEqual([]);
    expect(none.totalMarks).toBe(0);
    expect(none.since).toBeNull();

    const orphaned = buildWeakTopicExam({
      mistakes: [mistake({ questionId: "q-deleted", topicId: "aqa-biology.t9" })],
      questions,
      now: NOW,
    });
    expect(orphaned.questionIds).toEqual([]);
  });
});
