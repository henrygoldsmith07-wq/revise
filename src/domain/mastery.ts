import { isDue, retrievability, MASTERED_STABILITY_DAYS } from "./scheduling";
import type { Attempt, Card, Id, Mistake, ReviewLog, Topic, TopicMastery } from "./types";

// ---------------------------------------------------------------------------
// Mastery is the number every other engine reads: the planner sizes sessions
// by it, the recommender ranks by it, grade prediction integrates it. It has
// to be honest about *uncertainty* — a topic with two easy cards answered once
// is not mastered, it is unmeasured — so evidence weight damps the estimate
// toward a neutral prior instead of letting one lucky answer read as 100%.
// ---------------------------------------------------------------------------

/** Below this a topic is a candidate for "weak" classification. */
export const WEAK_THRESHOLD = 0.55;
/** Evidence (cards + attempts) needed before the estimate is taken at face value. */
const FULL_EVIDENCE = 8;
const NEUTRAL_PRIOR = 0.4;

export interface MasteryInput {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  attempts: Attempt[];
  mistakes: Mistake[];
  now?: Date;
}

function mean(values: number[], fallback = 0): number {
  if (!values.length) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeTopicMastery(input: MasteryInput): TopicMastery[] {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const cardsByTopic = groupBy(input.cards, (c) => c.topicId);
  const attemptsByTopic = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    for (const topicId of attempt.topicIds) {
      const list = attemptsByTopic.get(topicId) ?? [];
      list.push(attempt);
      attemptsByTopic.set(topicId, list);
    }
  }
  const logsByTopic = groupBy(input.reviewLogs, (l) => l.topicId);
  const openMistakes = groupBy(
    input.mistakes.filter((m) => !m.resolved),
    (m) => m.topicId,
  );

  return input.topics.map((topic) => {
    const cards = cardsByTopic.get(topic.id) ?? [];
    const attempts = attemptsByTopic.get(topic.id) ?? [];
    const logs = logsByTopic.get(topic.id) ?? [];

    // Recall strength: how stable the memories are, capped at "mastered".
    const stability = mean(cards.map((c) => Math.min(1, c.stability / MASTERED_STABILITY_DAYS)));
    // Right-now retention from the forgetting curve.
    const retention = cards.length ? mean(cards.map((c) => retrievability(c, now))) : 0;
    // Exam performance: marks earned as a share of marks available.
    const marksMax = attempts.reduce((a, x) => a + x.max, 0);
    const accuracy = marksMax ? attempts.reduce((a, x) => a + x.awarded, 0) / marksMax : 0;

    const evidence = cards.length + attempts.length * 2;
    const weight = Math.min(1, evidence / FULL_EVIDENCE);

    // Weighted blend — questions are the closest proxy to the real exam, so
    // they outweigh flashcards once any exist.
    const parts: { value: number; weight: number }[] = [];
    if (cards.length) parts.push({ value: stability * 0.6 + retention * 0.4, weight: 1 });
    if (attempts.length) parts.push({ value: accuracy, weight: 1.5 });
    const raw = parts.length
      ? parts.reduce((a, p) => a + p.value * p.weight, 0) / parts.reduce((a, p) => a + p.weight, 0)
      : 0;

    // With no evidence at all there is nothing to damp: the answer is zero,
    // not the prior. Reporting 40% for a topic the student has never opened
    // would inflate the predicted grade and hide the topic from the planner.
    let mastery = evidence === 0 ? 0 : NEUTRAL_PRIOR * (1 - weight) + raw * weight;

    // Unresolved mistakes are direct evidence of an unrepaired gap.
    const openCount = (openMistakes.get(topic.id) ?? []).length;
    mastery *= Math.max(0.6, 1 - openCount * 0.06);
    // Harder spec content is penalised slightly so the planner front-loads it.
    mastery *= 1 - (topic.intrinsicDifficulty - 3) * 0.02;
    mastery = clamp01(mastery);

    const confidenceLogs = logs.filter((l) => l.confidence != null);
    const confidence = confidenceLogs.length
      ? mean(confidenceLogs.map((l) => (l.confidence as number) / 5))
      : mastery;

    const timestamps = [
      ...logs.map((l) => l.reviewedAt),
      ...attempts.map((a) => a.createdAt),
    ].sort();
    const lastStudiedAt = timestamps.length ? timestamps[timestamps.length - 1] : null;

    return {
      topicId: topic.id,
      subjectId: topic.subjectId,
      mastery,
      retention,
      confidence,
      cardsTotal: cards.length,
      cardsDue: cards.filter((c) => isDue(c, today)).length,
      attempts: attempts.length,
      accuracy,
      lastStudiedAt,
      weak: mastery < WEAK_THRESHOLD && evidence > 0,
    };
  });
}

/**
 * Weak topics, worst first. Topics with no evidence at all are *not* weak —
 * they are unknown, and the recommender routes those to a first-pass "learn"
 * activity instead of remediation.
 */
export function weakTopics(mastery: TopicMastery[], limit = 10): TopicMastery[] {
  return mastery
    .filter((m) => m.weak)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, limit);
}

export function untouchedTopics(mastery: TopicMastery[]): TopicMastery[] {
  return mastery.filter((m) => m.cardsTotal === 0 && m.attempts === 0);
}

export function subjectMastery(mastery: TopicMastery[], subjectId: Id): number {
  const rows = mastery.filter((m) => m.subjectId === subjectId);
  return rows.length ? rows.reduce((a, m) => a + m.mastery, 0) / rows.length : 0;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function groupBy<T>(items: T[], key: (item: T) => Id): Map<Id, T[]> {
  const map = new Map<Id, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
