// ---------------------------------------------------------------------------
// Topic weight — how much of a subject's exam a topic is worth.
//
// Boards publish weightings per paper and assessment objective, not per topic,
// so topic weight is a proxy: the share of the subject's specification
// statements the topic covers. A topic with no statement-level data counts as
// one statement, so a subject without that data falls back to equal weights
// and nothing is invented. Shares sum to 1 within each subject.
// ---------------------------------------------------------------------------

import type { Id, Topic } from "./types";

export function topicShares(topics: readonly Topic[]): Map<Id, number> {
  const statements = (topic: Topic) => Math.max(1, topic.specPoints?.length ?? 0);
  const totals = new Map<Id, number>();
  for (const topic of topics) totals.set(topic.subjectId, (totals.get(topic.subjectId) ?? 0) + statements(topic));
  const shares = new Map<Id, number>();
  for (const topic of topics) {
    const total = totals.get(topic.subjectId) ?? 0;
    shares.set(topic.id, total ? statements(topic) / total : 0);
  }
  return shares;
}

/** 1 = an average topic in its subject; 2 = twice the average share of the exam. */
export function relativeTopicWeight(share: number, topicsInSubject: number): number {
  return topicsInSubject > 0 ? share * topicsInSubject : 1;
}
