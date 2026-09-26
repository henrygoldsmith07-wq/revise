// Evidence trust gate shared by store-level summaries and readiness signals.
//
// Derived, never persisted: filters the in-memory snapshot through the same
// trust bar as the mastery engines. Draft or poorly-proven Physics answers
// stay available for practice but cannot move mastery, readiness, or session
// scoring.

import { trustedAssessmentAttempt, trustworthyAttempt } from "@/domain/learning-evidence";
import type { Attempt, Question } from "@/domain/types";

export function trustedSnapshotAttempt(
  attempt: Attempt,
  questions: readonly Question[],
  history: readonly Attempt[],
): boolean {
  const question = questions.find((row) => row.id === attempt.questionId);
  if (!question) return attempt.subjectId !== "wjec-alevel-physics" && trustworthyAttempt(attempt);
  return trustedAssessmentAttempt(attempt, question, history, questions);
}
