import type { Attempt, Question } from "./types";

export const QUICK_SESSION_MINUTES = [5, 10, 20, 30, 45, 60] as const;
export type QuickSessionMinutes = (typeof QUICK_SESSION_MINUTES)[number];

/** Sprints up to this length keep the fixed small queue; longer ones are built to a mark budget. */
const FIXED_QUEUE_MAX_MINUTES = 10;

export function parseQuickSessionMinutes(value: string | null): QuickSessionMinutes | null {
  if (value === null) return null;
  return QUICK_SESSION_MINUTES.find((minutes) => String(minutes) === value) ?? null;
}

/** Roughly 2.5 minutes a question: 5 → 2, 10 → 4, 30 → 12, 60 → 24. */
export function quickSessionQuestionLimit(minutes: QuickSessionMinutes): number {
  return Math.round(minutes * 0.4);
}

/** About a mark a minute, the usual exam pace. */
export function quickSessionMarkBudget(minutes: QuickSessionMinutes): number {
  return minutes;
}

function primaryTopic(question: Question): string {
  return question.topicIds[0] ?? "";
}

/** Round-robin across topics, keeping each topic's own order, so a long sprint is not one chapter. */
function interleaveByTopic(ranked: Question[]): Question[] {
  const groups = new Map<string, Question[]>();
  for (const question of ranked) {
    const key = primaryTopic(question);
    const group = groups.get(key);
    if (group) group.push(question);
    else groups.set(key, [question]);
  }
  const lists = [...groups.values()];
  const out: Question[] = [];
  for (let round = 0; out.length < ranked.length; round++) {
    for (const list of lists) {
      const item = list[round];
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * Choose a small, fixed queue before the clock starts. Unseen questions win,
 * then weaker topics, then shorter questions so a short session gets more
 * than one chance to earn a mark. Sprints longer than ten minutes interleave
 * topics and stop at the mark budget so the queue fits the clock.
 */
export function selectQuickSessionQuestions(
  questions: Question[],
  attempts: Attempt[],
  masteryByTopic: Map<string, number>,
  minutes: QuickSessionMinutes,
): Question[] {
  const attempted = new Set(attempts.map((attempt) => attempt.questionId));
  const ranked = [...questions].sort((a, b) => {
    const seen = Number(attempted.has(a.id)) - Number(attempted.has(b.id));
    if (seen !== 0) return seen;
    const masteryA = masteryByTopic.get(primaryTopic(a)) ?? 0.5;
    const masteryB = masteryByTopic.get(primaryTopic(b)) ?? 0.5;
    if (masteryA !== masteryB) return masteryA - masteryB;
    if (a.totalMarks !== b.totalMarks) return a.totalMarks - b.totalMarks;
    return a.id.localeCompare(b.id);
  });
  const limit = quickSessionQuestionLimit(minutes);
  if (minutes <= FIXED_QUEUE_MAX_MINUTES) return ranked.slice(0, limit);

  const budget = quickSessionMarkBudget(minutes);
  const picked: Question[] = [];
  let marks = 0;
  for (const question of interleaveByTopic(ranked)) {
    if (picked.length >= limit) break;
    if (picked.length > 0 && marks + question.totalMarks > budget) continue;
    picked.push(question);
    marks += question.totalMarks;
  }
  return picked;
}
