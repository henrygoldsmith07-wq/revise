import type { Attempt, Card, Id, Mistake, ReviewLog, Topic } from "./types";

export interface LargeHistoryFixture {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  attempts: Attempt[];
  mistakes: Mistake[];
}

export interface LargeHistoryOptions {
  /** Defaults mirror the production load target rather than a toy smoke test. */
  cards?: number;
  reviews?: number;
  attempts?: number;
  topicCount?: number;
  userId?: Id;
  now?: Date;
}

/** Deterministic, content-free history for performance and migration tests. */
export function buildLargeHistoryFixture(options: LargeHistoryOptions = {}): LargeHistoryFixture {
  const cardsCount = options.cards ?? 3_000;
  const reviewsCount = options.reviews ?? 30_000;
  const attemptsCount = options.attempts ?? 10_000;
  const userId = options.userId ?? "load-test-user";
  const now = options.now ?? new Date("2026-09-01T12:00:00.000Z");
  const topics = fixtureTopics(options.topicCount ?? 32);
  const cards: Card[] = [];
  const reviewLogs: ReviewLog[] = [];
  const attempts: Attempt[] = [];

  for (let index = 0; index < cardsCount; index++) {
    const topic = topics[index % topics.length];
    const createdAt = new Date(now.getTime() - (index % 1_825) * 86_400_000).toISOString();
    cards.push({
      id: `load-card-${index}`,
      userId,
      subjectId: topic.subjectId,
      topicId: topic.id,
      kind: "basic",
      front: `Load card ${index}`,
      back: "fixture",
      tags: ["load-test"],
      origin: "manual",
      due: now.toISOString().slice(0, 10),
      stability: 1 + (index % 40),
      difficulty: 3 + (index % 3) / 10,
      reps: index % 12,
      lapses: index % 4,
      state: 2,
      lastReviewedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (let index = 0; index < reviewsCount; index++) {
    const card = cards[index % cards.length];
    const reviewedAt = new Date(now.getTime() - (index % 1_825) * 86_400_000 + (index % 86_400) * 1_000).toISOString();
    reviewLogs.push({
      id: `load-review-${index}`,
      userId,
      cardId: card.id,
      topicId: card.topicId,
      grade: index % 17 === 0 ? "again" : index % 5 === 0 ? "hard" : "good",
      confidence: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      elapsedMs: 1_500 + (index % 30_000),
      reviewedAt,
    });
  }

  for (let index = 0; index < attemptsCount; index++) {
    const topic = topics[index % topics.length];
    const createdAt = new Date(now.getTime() - (index % 1_825) * 86_400_000).toISOString();
    const max = 4 + (index % 6);
    attempts.push({
      id: `load-attempt-${index}`,
      userId,
      questionId: `load-question-${index % 1_000}`,
      subjectId: topic.subjectId,
      topicIds: [topic.id],
      answers: {},
      marked: [],
      awarded: index % max,
      max,
      feedback: "fixture",
      markedBy: "rubric",
      elapsedMs: 5_000 + (index % 120_000),
      mode: "practice",
      createdAt,
    });
  }

  return { topics, cards, reviewLogs, attempts, mistakes: [] };
}

function fixtureTopics(count: number): Topic[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    id: `load-topic-${index}`,
    subjectId: `load-subject-${index % 4}`,
    unitId: `load-unit-${index % 4}`,
    order: index,
    title: `Load topic ${index}`,
    summary: "Synthetic performance fixture",
    keyPoints: ["fixture"],
    commonErrors: [],
    intrinsicDifficulty: 3,
    specPoints: [],
  } as unknown as Topic));
}

