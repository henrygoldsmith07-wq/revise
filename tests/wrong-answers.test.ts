import { describe, expect, it } from "vitest";
import { wrongAnswerQueue } from "@/domain/wrong-answers";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";
import type { Mistake, Question } from "@/domain/types";

// Wrong-answer-only mode: the queue is evidence — questions behind marks the
// learner actually dropped. Unrecovered mistakes come first; re-proven
// questions stay available behind them. Mistakes without a question (card
// slips, paper totals) can never enter the queue.

const found = allSubjects().find((s) => topicsFor(s.id).length >= 2);
if (!found) throw new Error("test needs a registered subject with topics");
const subject = found;
const topics = [...topicsFor(subject.id)].sort((a, b) => a.order - b.order);
const topicA = topics[0];
const topicB = topics[1];

function question(id: string, topicId: string): Question {
  return {
    id,
    subjectId: subject.id,
    topicIds: [topicId],
    stem: `Question on ${topicId}`,
    kind: "short",
    parts: [
      {
        id: `${id}-p1`,
        label: "",
        prompt: "Answer.",
        marks: 2,
        markScheme: ["correct point"],
        modelAnswer: "correct point",
      },
    ],
    difficulty: 3,
  } as unknown as Question;
}

function mistake(overrides: Partial<Mistake> & Pick<Mistake, "questionId" | "topicId">): Mistake {
  return {
    id: `m-${overrides.questionId}-${overrides.resolved ?? false}-${overrides.marksLost ?? 1}`,
    userId: "u1",
    subjectId: subject.id,
    marksLost: 1,
    description: "lost a point",
    category: "method",
    resolved: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  } as Mistake;
}

describe("wrongAnswerQueue", () => {
  const qA = question("q-a", topicA.id);
  const qB = question("q-b", topicB.id);

  it("collects questions behind lost marks, heaviest first", () => {
    const queue = wrongAnswerQueue({
      mistakes: [
        mistake({ questionId: qA.id, topicId: topicA.id, marksLost: 1 }),
        mistake({ questionId: qB.id, topicId: topicB.id, marksLost: 4 }),
      ],
      questions: [qA, qB],
    });
    expect(queue.questionIds).toEqual([qB.id, qA.id]);
    expect(queue.totalMarksLost).toBe(5);
    expect(queue.openCount).toBe(2);
  });

  it("ranks unrecovered mistakes ahead of re-proven questions", () => {
    const queue = wrongAnswerQueue({
      mistakes: [
        mistake({ questionId: qA.id, topicId: topicA.id, marksLost: 3, resolved: true }),
        mistake({ questionId: qB.id, topicId: topicB.id, marksLost: 1 }),
      ],
      questions: [qA, qB],
    });
    expect(queue.questionIds).toEqual([qB.id, qA.id]);
    expect(queue.items[1].openMistakes).toBe(0);
  });

  it("deduplicates a question across attempts and keeps the latest loss", () => {
    const queue = wrongAnswerQueue({
      mistakes: [
        mistake({ questionId: qA.id, topicId: topicA.id, createdAt: "2026-09-01T10:00:00.000Z" }),
        mistake({ questionId: qA.id, topicId: topicA.id, createdAt: "2026-10-02T10:00:00.000Z" }),
      ],
      questions: [qA],
    });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].marksLost).toBe(2);
    expect(queue.items[0].lastLostAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("skips mistakes without a question, unknown questions and unenrolled subjects", () => {
    const other = allSubjects().find((s) => s.id !== subject.id);
    const queue = wrongAnswerQueue({
      mistakes: [
        mistake({ questionId: undefined as unknown as string, topicId: topicA.id, id: "m-card" }),
        mistake({ questionId: "q-gone", topicId: topicA.id, id: "m-gone" }),
        ...(other
          ? [mistake({ questionId: "q-x", topicId: topicsFor(other.id)[0].id, subjectId: other.id, id: "m-other" })]
          : []),
      ],
      questions: [qA],
      subjectIds: [subject.id],
    });
    expect(queue.items).toHaveLength(0);
  });

  it("respects the limit and the enrolled-subject filter", () => {
    const questions = [qA, qB];
    const queue = wrongAnswerQueue({
      mistakes: [
        mistake({ questionId: qA.id, topicId: topicA.id, id: "m-1" }),
        mistake({ questionId: qB.id, topicId: topicB.id, id: "m-2" }),
      ],
      questions,
      subjectIds: [subject.id],
      limit: 1,
    });
    expect(queue.questionIds).toHaveLength(1);
    expect(getTopic(queue.items[0].topicId)).toBeDefined();
  });
});
