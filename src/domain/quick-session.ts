import type { Attempt, Question } from "./types";

export const QUICK_SESSION_MINUTES = [5, 10] as const;
export type QuickSessionMinutes = (typeof QUICK_SESSION_MINUTES)[number];

export function parseQuickSessionMinutes(value: string | null): QuickSessionMinutes | null {
  if (value === "5") return 5;
  if (value === "10") return 10;
  return null;
}

export function quickSessionQuestionLimit(minutes: QuickSessionMinutes): number {
  return minutes === 5 ? 2 : 4;
}

/**
 * Choose a small, fixed queue before the clock starts. Unseen questions win,
 * then weaker topics, then shorter questions so a short session gets more
 * than one chance to earn a mark.
 */
export function selectQuickSessionQuestions(
  questions: Question[],
  attempts: Attempt[],
  masteryByTopic: Map<string, number>,
  minutes: QuickSessionMinutes,
): Question[] {
  const attempted = new Set(attempts.map((attempt) => attempt.questionId));
  return [...questions]
    .sort((a, b) => {
      const seen = Number(attempted.has(a.id)) - Number(attempted.has(b.id));
      if (seen !== 0) return seen;
      const masteryA = masteryByTopic.get(a.topicIds[0] ?? "") ?? 0.5;
      const masteryB = masteryByTopic.get(b.topicIds[0] ?? "") ?? 0.5;
      if (masteryA !== masteryB) return masteryA - masteryB;
      if (a.totalMarks !== b.totalMarks) return a.totalMarks - b.totalMarks;
      return a.id.localeCompare(b.id);
    })
    .slice(0, quickSessionQuestionLimit(minutes));
}
