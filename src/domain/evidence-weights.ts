// ---------------------------------------------------------------------------
// Exposure weights — how much an attempt proves about a *new* question.
//
// The exam asks questions the student has not seen. Answering the same
// question again measures memory of that item, not the skill, so only the
// first exposure counts in full and each repeat counts for much less.
// Without this, one question answered correctly six times read as "mastered"
// while six different questions at 50% read as half-learned.
//
// Familiarity does not depend on marking quality, so every attempt (hinted,
// provisional, recall) counts as an exposure when ordering; trust and hint
// discounts are applied separately by the caller.
// ---------------------------------------------------------------------------

import type { Attempt, Id } from "./types";

/** Weight of the 1st, 2nd, 3rd and 4th-or-later exposure of the same question. */
export const REPEAT_WEIGHTS = [1, 0.35, 0.15, 0.05] as const;

export function repeatWeight(priorExposures: number): number {
  const last = REPEAT_WEIGHTS.length - 1;
  const index = Math.min(Math.max(0, Math.floor(priorExposures)), last);
  return REPEAT_WEIGHTS[index] ?? REPEAT_WEIGHTS[last] ?? 0;
}

/** attempt id → exposure weight, ordering each learner's attempts at a question by time. */
export function exposureWeights(attempts: readonly Attempt[]): Map<Id, number> {
  const byQuestion = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.userId}\u0000${attempt.questionId}`;
    const list = byQuestion.get(key);
    if (list) list.push(attempt);
    else byQuestion.set(key, [attempt]);
  }
  const weights = new Map<Id, number>();
  for (const list of byQuestion.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    list.forEach((attempt, index) => weights.set(attempt.id, repeatWeight(index)));
  }
  return weights;
}

/** First exposures are the only attempts that measure performance on an unseen question. */
export function isFirstExposure(weights: ReadonlyMap<Id, number>, attemptId: Id): boolean {
  return (weights.get(attemptId) ?? 1) === REPEAT_WEIGHTS[0];
}
