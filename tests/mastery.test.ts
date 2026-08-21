import { describe, expect, it } from "vitest";
import { computeTopicMastery, subjectMastery, untouchedTopics, weakTopics } from "@/domain/mastery";
import { createCard } from "@/domain/scheduling";
import type { Attempt, Card, Mistake, ReviewLog, Topic } from "@/domain/types";

const NOW = new Date("2025-06-01T09:00:00.000Z");

const topic = (id: string, difficulty: 1 | 2 | 3 | 4 | 5 = 3): Topic => ({
  id,
  subjectId: "subject",
  unitId: "unit",
  title: `Topic ${id}`,
  order: 0,
  intrinsicDifficulty: difficulty,
  summary: "summary",
  keyPoints: ["point"],
  commonErrors: ["error"],
});

function strongCard(topicId: string, id: string): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "subject", topicId, front: "f", back: "b" }, NOW),
    stability: 30,
    reps: 5,
    lastReviewedAt: NOW.toISOString(),
    due: "2025-07-01",
  };
}

function attempt(topicId: string, awarded: number, max: number): Attempt {
  return {
    id: crypto.randomUUID(),
    userId: "u",
    questionId: "q",
    subjectId: "subject",
    topicIds: [topicId],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: NOW.toISOString(),
  };
}

describe("computeTopicMastery", () => {
  it("reports zero mastery and no weakness for a topic with no evidence", () => {
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [],
      reviewLogs: [],
      attempts: [],
      mistakes: [],
      now: NOW,
    });
    expect(row.mastery).toBe(0);
    // Unmeasured is not the same as weak — those route to "learn", not remediation.
    expect(row.weak).toBe(false);
  });

  it("stays cautious when evidence is thin, even if that evidence is perfect", () => {
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [strongCard("a", "c1")],
      reviewLogs: [],
      attempts: [],
      mistakes: [],
      now: NOW,
    });
    expect(row.mastery).toBeGreaterThan(0);
    expect(row.mastery).toBeLessThan(0.7);
  });

  it("rates a well-evidenced strong topic above a well-evidenced weak one", () => {
    const rows = computeTopicMastery({
      topics: [topic("strong"), topic("weak")],
      cards: [
        ...Array.from({ length: 6 }, (_, i) => strongCard("strong", `s${i}`)),
        ...Array.from({ length: 6 }, (_, i) =>
          createCard({ id: `w${i}`, userId: "u", subjectId: "subject", topicId: "weak", front: "f", back: "b" }, NOW),
        ),
      ],
      reviewLogs: [],
      attempts: [
        attempt("strong", 9, 10),
        attempt("strong", 8, 10),
        attempt("weak", 2, 10),
        attempt("weak", 1, 10),
      ],
      mistakes: [],
      now: NOW,
    });

    const strong = rows.find((r) => r.topicId === "strong")!;
    const weak = rows.find((r) => r.topicId === "weak")!;
    expect(strong.mastery).toBeGreaterThan(weak.mastery);
    expect(weak.weak).toBe(true);
    expect(strong.weak).toBe(false);
    expect(strong.accuracy).toBeCloseTo(0.85, 2);
  });

  it("penalises unresolved mistakes", () => {
    const base = {
      topics: [topic("a")],
      cards: Array.from({ length: 6 }, (_, i) => strongCard("a", `c${i}`)),
      reviewLogs: [] as ReviewLog[],
      attempts: [attempt("a", 8, 10)],
      now: NOW,
    };
    const clean = computeTopicMastery({ ...base, mistakes: [] })[0];
    const mistake = (id: string): Mistake => ({
      id,
      userId: "u",
      subjectId: "subject",
      topicId: "a",
      marksLost: 1,
        description: "dropped a mark",
      category: "method",
      resolved: false,
      createdAt: NOW.toISOString(),
    });
    const dirty = computeTopicMastery({
      ...base,
      mistakes: [mistake("m1"), mistake("m2"), mistake("m3")],
    })[0];

    expect(dirty.mastery).toBeLessThan(clean.mastery);
  });

  it("counts due cards and records the latest study time", () => {
    const [row] = computeTopicMastery({
      topics: [topic("a")],
      cards: [
        { ...strongCard("a", "due"), due: "2025-05-01" },
        strongCard("a", "future"),
      ],
      reviewLogs: [
        {
          id: "l1",
          userId: "u",
          cardId: "due",
          topicId: "a",
          grade: "good",
          confidence: 4,
          elapsedMs: 900,
          reviewedAt: "2025-05-31T09:00:00.000Z",
        },
      ],
      attempts: [],
      mistakes: [],
      now: NOW,
    });

    expect(row.cardsTotal).toBe(2);
    expect(row.cardsDue).toBe(1);
    expect(row.lastStudiedAt).toBe("2025-05-31T09:00:00.000Z");
    expect(row.confidence).toBeCloseTo(0.8, 5);
  });
});

describe("weakTopics / untouchedTopics / subjectMastery", () => {
  const rows = computeTopicMastery({
    topics: [topic("a"), topic("b"), topic("c")],
    cards: [
      ...Array.from({ length: 6 }, (_, i) => strongCard("a", `a${i}`)),
      createCard({ id: "b1", userId: "u", subjectId: "subject", topicId: "b", front: "f", back: "b" }, NOW),
    ],
    reviewLogs: [],
    attempts: [attempt("a", 10, 10), attempt("b", 0, 10), attempt("b", 1, 10)],
    mistakes: [],
    now: NOW,
  });

  it("returns weak topics worst-first", () => {
    const weak = weakTopics(rows);
    expect(weak[0].topicId).toBe("b");
  });

  it("identifies topics with no cards and no attempts", () => {
    expect(untouchedTopics(rows).map((r) => r.topicId)).toEqual(["c"]);
  });

  it("averages mastery across a subject", () => {
    const average = subjectMastery(rows, "subject");
    expect(average).toBeGreaterThan(0);
    expect(average).toBeLessThan(1);
    expect(subjectMastery(rows, "other")).toBe(0);
  });
});
