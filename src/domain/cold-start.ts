// ---------------------------------------------------------------------------
// Cold start. A learner with no trusted answers and no card history gives the
// recommendation engine nothing to rank, so the first best step is a short,
// skippable quick check on the subject with the nearest exam. It is offered
// only while evidence is genuinely missing and only when enough reviewed,
// unseen questions exist to make it worth the time. Answers go through the
// normal attempt pipeline, so once they exist the learner is no longer cold.
// ---------------------------------------------------------------------------

import { selectQuickDiagnostic } from "./quick-diagnostic";
import { trustworthyAttempt } from "./learning-evidence";
import type { Attempt, ExamDate, Id, Mistake, Question, ReviewLog } from "./types";

export const COLD_START_MIN_ATTEMPTS = 3;
export const COLD_START_MIN_REVIEWS = 15;
export const COLD_START_MIN_QUESTIONS = 3;

export interface ColdStartPlan {
  subjectId: Id;
  questions: number;
  minutes: number;
  topics: number;
}

export interface ColdStartInput {
  subjectIds: readonly Id[];
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  reviewLogs: readonly ReviewLog[];
  questions: readonly Question[];
  examDates: readonly ExamDate[];
  /** Subjects the learner chose to skip the quick check for. */
  skipped?: readonly Id[];
  topicSubject: (topicId: Id) => Id | undefined;
  now: Date;
}

/** True while the learner has too little trusted evidence in the subject to rank it. */
export function subjectIsCold(subjectId: Id, input: Pick<ColdStartInput, "attempts" | "mistakes" | "reviewLogs" | "topicSubject">): boolean {
  const answers = input.attempts.filter((a) => a.subjectId === subjectId && trustworthyAttempt(a)).length;
  if (answers >= COLD_START_MIN_ATTEMPTS) return false;
  if (input.mistakes.some((m) => m.subjectId === subjectId)) return false;
  const reviews = input.reviewLogs.filter((r) => input.topicSubject(r.topicId) === subjectId).length;
  return reviews < COLD_START_MIN_REVIEWS;
}

const DAY = 86_400_000;

function daysTo(exams: readonly ExamDate[], subjectId: Id, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const next = exams.filter((e) => e.subjectId === subjectId).map((e) => Date.parse(`${e.date}T00:00:00Z`)).filter((t) => t >= today);
  return next.length ? Math.round((Math.min(...next) - today) / DAY) : Number.POSITIVE_INFINITY;
}

/**
 * The one subject to check first, or null. Subject order never matters: the
 * nearest exam wins, then the id. A subject with too few reviewed, unseen
 * questions is passed over rather than offered a check that cannot run.
 */
export function planColdStart(input: ColdStartInput): ColdStartPlan | null {
  const skipped = new Set(input.skipped ?? []);
  const seen = new Set(input.attempts.map((a) => a.questionId));
  const candidates = [...new Set(input.subjectIds)]
    .filter((id) => !skipped.has(id) && subjectIsCold(id, input))
    .sort((a, b) => daysTo(input.examDates, a, input.now) - daysTo(input.examDates, b, input.now) || a.localeCompare(b));
  for (const subjectId of candidates) {
    const pool = input.questions.filter((q) => q.subjectId === subjectId && !seen.has(q.id));
    const topicIds = [...new Set(pool.flatMap((q) => q.topicIds))].sort();
    const selection = selectQuickDiagnostic({ questions: pool, topicIds });
    if (selection.items.length >= COLD_START_MIN_QUESTIONS) {
      return { subjectId, questions: selection.items.length, minutes: selection.minutes, topics: new Set(selection.items.map((i) => i.topicId)).size };
    }
  }
  return null;
}
