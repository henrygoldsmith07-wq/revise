// Wrong-answer-only mode — "do only the questions I got wrong".
//
// A dedicated, immediately accessible practice queue built from lost marks.
// Every Mistake records a mark the learner actually dropped on a question, so
// the queue is evidence, not a vibe. Questions with marks still unrecovered
// come first; questions already re-proven stay available behind them, ranked
// by how much was lost and how recently. Mistakes without a question behind
// them (flashcard slips, paper totals) cannot become practice, so they are
// skipped rather than guessed at.

import { getTopic } from "./curriculum";
import type { Id, IsoInstant, Mistake, Question } from "./types";

export interface WrongAnswerItem {
  questionId: Id;
  subjectId: Id;
  topicId: Id;
  /** Total marks dropped on this question across every attempt. */
  marksLost: number;
  /** Mistakes on this question still unrecovered. */
  openMistakes: number;
  lastLostAt: IsoInstant | null;
}

export interface WrongAnswerQueue {
  items: WrongAnswerItem[];
  questionIds: Id[];
  totalMarksLost: number;
  /** Questions with at least one unrecovered mistake. */
  openCount: number;
}

/**
 * Rank questions by the marks actually lost on them: open (unrecovered)
 * mistakes first, then heaviest loss, then most recent loss.
 */
export function wrongAnswerQueue(input: {
  mistakes: readonly Mistake[];
  questions: readonly Question[];
  subjectIds?: readonly Id[];
  limit?: number;
}): WrongAnswerQueue {
  const limit = input.limit ?? 40;
  const subjects = input.subjectIds ? new Set(input.subjectIds) : null;
  const questionsById = new Map(input.questions.map((q) => [q.id, q] as const));

  const byQuestion = new Map<Id, { item: WrongAnswerItem; open: number }>();
  for (const mistake of input.mistakes) {
    if (!mistake.questionId) continue;
    if (subjects && !subjects.has(mistake.subjectId)) continue;
    const question = questionsById.get(mistake.questionId);
    if (!question) continue;
    const topicId = mistake.topicId || question.topicIds[0];
    if (!getTopic(topicId)) continue;
    const existing = byQuestion.get(mistake.questionId);
    const openDelta = mistake.resolved ? 0 : 1;
    if (existing) {
      existing.item.marksLost += mistake.marksLost;
      existing.open += openDelta;
      if (!existing.item.lastLostAt || mistake.createdAt > existing.item.lastLostAt) {
        existing.item.lastLostAt = mistake.createdAt;
      }
    } else {
      byQuestion.set(mistake.questionId, {
        open: openDelta,
        item: {
          questionId: mistake.questionId,
          subjectId: question.subjectId,
          topicId,
          marksLost: mistake.marksLost,
          openMistakes: openDelta,
          lastLostAt: mistake.createdAt,
        },
      });
    }
  }

  const items = [...byQuestion.values()]
    .sort((a, b) => {
      if (b.open !== a.open) return b.open - a.open;
      if (b.item.marksLost !== a.item.marksLost) return b.item.marksLost - a.item.marksLost;
      return (b.item.lastLostAt ?? "").localeCompare(a.item.lastLostAt ?? "");
    })
    .slice(0, limit)
    .map((entry) => entry.item);

  return {
    items,
    questionIds: items.map((item) => item.questionId),
    totalMarksLost: items.reduce((sum, item) => sum + item.marksLost, 0),
    openCount: items.filter((item) => item.openMistakes > 0).length,
  };
}
