import type { Attempt } from "./types";

/** A marking callback can recur, but a genuinely new attempt must stay visible. */
export function recordPracticeAttempt(previous: readonly Attempt[], attempt: Attempt): Attempt[] {
  const existingIndex = previous.findIndex((existing) => existing.id === attempt.id);
  if (existingIndex < 0) return [...previous, attempt];
  return previous.map((existing, index) => index === existingIndex ? attempt : existing);
}

/** Marks/progress describe each question once; retries describe the full history. */
export function practiceSessionSummary(attempts: readonly Attempt[], queueIds: readonly string[]) {
  const distinctAttempts = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const latestByQuestion = new Map<string, Attempt>();
  for (const attempt of distinctAttempts.values()) latestByQuestion.set(attempt.questionId, attempt);
  const queued = [...new Set(queueIds)].flatMap((id) => {
    const latest = latestByQuestion.get(id);
    return latest ? [latest] : [];
  });
  return {
    latestByQuestion,
    answered: queueIds.map((id) => latestByQuestion.has(id)),
    attempted: queued.length,
    awarded: queued.reduce((sum, attempt) => sum + attempt.awarded, 0),
    available: queued.reduce((sum, attempt) => sum + attempt.max, 0),
    retryCount: distinctAttempts.size - latestByQuestion.size,
  };
}

/** Resolve local links without adding a subject to the learner's enrollment. */
export function initialPracticeSubject(input: {
  enrolledSubjectIds: readonly string[];
  subjectParam?: string | null;
  questionSubjectId?: string;
  topicSubjectId?: string;
  retestSubjectId?: string;
}): string {
  const requested = [input.subjectParam, input.questionSubjectId, input.topicSubjectId, input.retestSubjectId];
  return requested.find((id): id is string => Boolean(id && input.enrolledSubjectIds.includes(id)))
    ?? input.enrolledSubjectIds[0] ?? "";
}
