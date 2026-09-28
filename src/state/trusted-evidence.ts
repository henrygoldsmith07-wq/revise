// Evidence trust gate shared by store-level summaries and readiness signals.
//
// Derived, never persisted: filters the in-memory snapshot through the same
// trust bar as the mastery engines. Draft or poorly-proven Physics answers
// stay available for practice but cannot move mastery, readiness, or session
// scoring.

import { requiresWjecContentReview } from "@/domain/physics-content-review";
import { trustedAssessmentAttempt as trustedAttempt, trustworthyAttempt as baseTrustworthy } from "@/domain/learning-evidence";
import type { Attempt, Question } from "@/domain/types";

export function trustedSnapshotAttempt(
  attempt: Attempt,
  questions: readonly Question[],
  history: readonly Attempt[],
): boolean {
  const question = questions.find((row) => row.id === attempt.questionId);
  if (!question) return !requiresWjecContentReview(attempt.subjectId) && baseTrustworthy(attempt);
  return trustedAttempt(attempt, question, history, questions);
}
