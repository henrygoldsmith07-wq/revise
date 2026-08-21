import { isDue, retrievability, todayIso, MASTERED_STABILITY_DAYS } from "./scheduling";
import type { Card, Id, IsoInstant, ReviewLog, Topic } from "./types";

export type RecallEvidence = "unmeasured" | "emerging" | "reliable";

export interface RecallMasteryRow {
  topicId: Id;
  subjectId: Id;
  /** Recall-only score: current FSRS strength, not exam-question accuracy. */
  mastery: number;
  /** Mean predicted probability that the topic's cards are recallable now. */
  currentRetention: number;
  /** Observed share of reviews that were not graded "again". */
  trueRetention: number | null;
  cardsTotal: number;
  cardsDue: number;
  reviews: number;
  recalled: number;
  lastReviewedAt: IsoInstant | null;
  evidence: RecallEvidence;
}

export interface RecallMasteryInput {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  now?: Date;
}

export function computeRecallMastery(input: RecallMasteryInput): RecallMasteryRow[] {
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const cardsByTopic = groupBy(input.cards, (card) => card.topicId);
  const logsByTopic = groupBy(input.reviewLogs, (log) => log.topicId);

  return input.topics.map((topic) => {
    const cards = cardsByTopic.get(topic.id) ?? [];
    const logs = logsByTopic.get(topic.id) ?? [];
    const stability = mean(cards.map((card) => Math.min(1, card.stability / MASTERED_STABILITY_DAYS)));
    const currentRetention = mean(cards.map((card) => retrievability(card, now)));
    const mastery = round01(stability * 0.6 + currentRetention * 0.4);
    const recalled = logs.filter((log) => log.grade !== "again").length;
    const trueRetention = logs.length ? round01(recalled / logs.length) : null;
    const timestamps = [
      ...cards.map((card) => card.lastReviewedAt).filter((value): value is IsoInstant => Boolean(value)),
      ...logs.map((log) => log.reviewedAt),
    ].sort();

    return {
      topicId: topic.id,
      subjectId: topic.subjectId,
      mastery,
      currentRetention: round01(currentRetention),
      trueRetention,
      cardsTotal: cards.length,
      cardsDue: cards.filter((card) => isDue(card, today)).length,
      reviews: logs.length,
      recalled,
      lastReviewedAt: timestamps.at(-1) ?? null,
      evidence: logs.length >= 20 ? "reliable" : logs.length ? "emerging" : "unmeasured",
    };
  });
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round01(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function groupBy<T>(items: T[], key: (item: T) => Id): Map<Id, T[]> {
  const result = new Map<Id, T[]>();
  for (const item of items) {
    const group = result.get(key(item)) ?? [];
    group.push(item);
    result.set(key(item), group);
  }
  return result;
}
