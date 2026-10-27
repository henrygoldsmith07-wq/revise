// ---------------------------------------------------------------------------
// Where the marks and the minutes went on one timed paper.
//
// After a paper under exam conditions the result used to list only
// "Question N: x/y". This turns the run's own attempts into what a student
// reviews with a teacher after a mock: each question's topic, marks and time
// against the paper's own pace, the topics that cost the most marks, and
// whether time or blanks were the problem. Every figure comes from the
// attempts and the paper's clock; nothing is predicted and no grade is given.
//
// Pure: no clock or I/O.
// ---------------------------------------------------------------------------

import type { Attempt, Id, Question } from "./types";

/** A question counts as over its time budget only past both of these. */
export const OVER_BUDGET_RATIO = 1.25;
export const OVER_BUDGET_MIN_MS = 60_000;

export interface PaperRunQuestionRow {
  number: number;
  questionId: Id;
  topicIds: Id[];
  topicLabel: string;
  awarded: number;
  max: number;
  blank: boolean;
  provisional: boolean;
  elapsedMs: number;
  /** Time this question's marks are worth at the paper's pace. */
  budgetMs: number;
  overBudget: boolean;
}

export interface PaperRunTopicRow {
  topicId: Id;
  title: string;
  awarded: number;
  max: number;
  lost: number;
  share: number;
}

export interface PaperRunBreakdown {
  rows: PaperRunQuestionRow[];
  topics: PaperRunTopicRow[];
  awarded: number;
  max: number;
  minutesPerMark: number;
  usedMs: number;
  allowedMs: number;
  blankCount: number;
  blankMarks: number;
  overBudgetCount: number;
  /** Minutes spent beyond budget across the over-budget questions. */
  overBudgetMinutes: number;
  /** Up to three topics that lost the most marks, for the repair step. */
  focusTopics: PaperRunTopicRow[];
  /** Plain-English pacing findings, most important first. */
  findings: string[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function marks(count: number): string {
  return `${count} mark${count === 1 ? "" : "s"}`;
}

function minutesLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function attemptIsBlank(attempt: Attempt): boolean {
  return Object.values(attempt.answers ?? {}).every((answer) => !String(answer ?? "").trim());
}

export function buildPaperRunBreakdown(input: {
  /** The paper's questions in paper order. */
  questions: readonly Question[];
  /** This run's attempts (one per question). */
  attempts: readonly Attempt[];
  durationMinutes: number;
  usedMs: number;
  topicTitle: (topicId: Id) => string;
}): PaperRunBreakdown {
  const attemptByQuestion = new Map(input.attempts.map((attempt) => [attempt.questionId, attempt] as const));
  const paperMarks = input.questions.reduce((sum, question) => sum + question.totalMarks, 0);
  const minutesPerMark = paperMarks > 0 ? input.durationMinutes / paperMarks : 0;
  const allowedMs = Math.max(0, input.durationMinutes * 60_000);

  const rows: PaperRunQuestionRow[] = [];
  const topicTotals = new Map<Id, { awarded: number; max: number }>();
  input.questions.forEach((question, index) => {
    const attempt = attemptByQuestion.get(question.id);
    if (!attempt) return;
    const budgetMs = question.totalMarks * minutesPerMark * 60_000;
    const elapsedMs = Math.max(0, attempt.elapsedMs ?? 0);
    const overBudget = elapsedMs > budgetMs * OVER_BUDGET_RATIO && elapsedMs - budgetMs > OVER_BUDGET_MIN_MS;
    rows.push({
      number: index + 1,
      questionId: question.id,
      topicIds: [...question.topicIds],
      topicLabel: question.topicIds.map(input.topicTitle).join(" · "),
      awarded: attempt.awarded,
      max: attempt.max,
      blank: attemptIsBlank(attempt),
      provisional: Boolean(attempt.markAssessment?.provisional),
      elapsedMs,
      budgetMs,
      overBudget,
    });
    const share = question.topicIds.length || 1;
    for (const topicId of question.topicIds) {
      const totals = topicTotals.get(topicId) ?? { awarded: 0, max: 0 };
      totals.awarded += attempt.awarded / share;
      totals.max += attempt.max / share;
      topicTotals.set(topicId, totals);
    }
  });

  const topics: PaperRunTopicRow[] = [...topicTotals.entries()]
    .map(([topicId, totals]) => ({
      topicId,
      title: input.topicTitle(topicId),
      awarded: round1(totals.awarded),
      max: round1(totals.max),
      lost: round1(totals.max - totals.awarded),
      share: totals.max > 0 ? totals.awarded / totals.max : 0,
    }))
    .sort((a, b) => b.lost - a.lost || a.share - b.share || a.title.localeCompare(b.title));

  const awarded = rows.reduce((sum, row) => sum + row.awarded, 0);
  const max = rows.reduce((sum, row) => sum + row.max, 0);
  const blanks = rows.filter((row) => row.blank);
  const blankMarks = blanks.reduce((sum, row) => sum + row.max, 0);
  const over = rows.filter((row) => row.overBudget);
  const overBudgetMs = over.reduce((sum, row) => sum + (row.elapsedMs - row.budgetMs), 0);
  const usedMs = Math.max(0, input.usedMs);

  const findings: string[] = [];
  if (blanks.length) {
    const lastBlankRun = rows.length > 0 && rows[rows.length - 1].blank;
    findings.push(
      `${blanks.length} question${blanks.length === 1 ? " was" : "s were"} left blank, ${marks(blankMarks)} you could not score${lastBlankRun ? ", including the end of the paper: that usually means time ran out" : ""}.`,
    );
  }
  if (over.length) {
    findings.push(
      `${over.length} question${over.length === 1 ? "" : "s"} took well over ${over.length === 1 ? "its" : "their"} time budget (about ${round1(minutesPerMark)} min per mark), ${minutesLabel(overBudgetMs)} over in total.`,
    );
  }
  if (allowedMs > 0 && usedMs < allowedMs * 0.75 && max > 0 && awarded / max < 0.7) {
    findings.push(`You finished with ${minutesLabel(allowedMs - usedMs)} to spare and lost ${marks(max - awarded)}: use spare time to check working and add detail.`);
  }
  if (!findings.length && max > 0) findings.push("Your pace held: no question ran far over its budget and nothing was left blank.");

  return {
    rows,
    topics,
    awarded,
    max,
    minutesPerMark,
    usedMs,
    allowedMs,
    blankCount: blanks.length,
    blankMarks,
    overBudgetCount: over.length,
    overBudgetMinutes: Math.round(overBudgetMs / 60_000),
    focusTopics: topics.filter((topic) => topic.lost > 0).slice(0, 3),
    findings,
  };
}
