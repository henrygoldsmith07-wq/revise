// Evidence trust gate shared by store-level summaries and readiness signals.
//
// Derived, never persisted: filters the in-memory snapshot through the same
// trust bar as the mastery engines. Draft or poorly-proven WJEC flagship answers
// stay available for practice but cannot move mastery, readiness, or session
// scoring.

import { trustedAssessmentAttempt, trustedAssessmentMistake, trustworthyAttempt } from "@/domain/learning-evidence";
import { requiresWjecContentReview } from "@/domain/physics-content-review";
import type { Attempt, Mistake, Question } from "@/domain/types";

export function trustedSnapshotAttempt(
  attempt: Attempt,
  questions: readonly Question[],
  history: readonly Attempt[],
): boolean {
  const question = questions.find((row) => row.id === attempt.questionId);
  if (!question) return !requiresWjecContentReview(attempt.subjectId) && trustworthyAttempt(attempt);
  return trustedAssessmentAttempt(attempt, question, history, questions);
}

/**
 * Mistakes from review-gated subjects inherit the trust of both their exact
 * question and attempt. Missing legacy links fail closed rather than allowing
 * an unverifiable mistake to influence mastery or misconception analytics.
 */
export function trustedSnapshotMistake(
  mistake: Mistake,
  questions: readonly Question[],
  attempts: readonly Attempt[],
): boolean {
  return trustedAssessmentMistake(mistake, questions, attempts);
}
