// ---------------------------------------------------------------------------
// Weak-topic exam — built from the last 7 days of misses.
//
// Every dropped mark becomes a mistake; mistakes keep the time they were made.
// This module turns the recent ones into a short exam: the topics where the
// student lost the most marks this week come first, and the questions behind
// those exact misses are re-sat first (the same question, now that the mark
// scheme is known), then other stored questions from those weak topics to fill
// the paper.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id, IsoInstant, Mistake, Question } from "./types";

/** How far back the exam looks. */
export const WEAK_EXAM_WINDOW_DAYS = 7;
/** Topics at the top of the paper at most. */
export const WEAK_EXAM_MAX_TOPICS = 3;
/** Questions in the paper at most. */
export const WEAK_EXAM_MAX_QUESTIONS = 8;

export interface WeakExamTopicSummary {
  topicId: Id;
  subjectId: Id;
  /** Distinct misses in the window on this topic. */
  misses: number;
  /** Total marks dropped in the window on this topic. */
  marksLost: number;
  /** The stored questions behind those misses, best first. */
  questionIds: Id[];
}

export interface WeakTopicExam {
  windowDays: number;
  /** Weak topics from the window, worst first. */
  topics: WeakExamTopicSummary[];
  /** Ordered question set for the paper. */
  questionIds: Id[];
  totalMarks: number;
  /** Oldest miss included (ISO) — for the "since" copy. */
  since: IsoInstant | null;
}

/** Misses (marks lost) recorded in the last `days` days. Resolved or not —
 *  a mark was still dropped. */
export function missesSince(
  mistakes: Mistake[],
  days: number = WEAK_EXAM_WINDOW_DAYS,
  now: Date = new Date(),
): Mistake[] {
  const cutoffMs = now.getTime() - days * 86_400_000;
  return mistakes.filter(
    (mistake) => mistake.marksLost > 0 && new Date(mistake.createdAt).getTime() >= cutoffMs,
  );
}

/** Group window misses by topic, worst first, keeping each topic's source
 *  questions (best first by marks dropped on them). */
export function summarizeWeakTopics(
  windowMisses: Mistake[],
  questions: Question[],
): WeakExamTopicSummary[] {
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  const byTopic = new Map<Id, WeakExamTopicSummary & { byQuestion: Map<Id, number> }>();

  for (const mistake of windowMisses) {
    let entry = byTopic.get(mistake.topicId);
    if (!entry) {
      entry = {
        topicId: mistake.topicId,
        subjectId: mistake.subjectId,
        misses: 0,
        marksLost: 0,
        questionIds: [],
        byQuestion: new Map(),
      };
      byTopic.set(mistake.topicId, entry);
    }
    entry.misses += 1;
    entry.marksLost += mistake.marksLost;
    if (mistake.questionId && byId.has(mistake.questionId)) {
      entry.byQuestion.set(mistake.questionId, (entry.byQuestion.get(mistake.questionId) ?? 0) + mistake.marksLost);
    }
  }

  return [...byTopic.values()]
    .sort((a, b) => b.marksLost - a.marksLost || b.misses - a.misses)
    .map(({ topicId, subjectId, misses, marksLost, byQuestion }) => ({
      topicId,
      subjectId,
      misses,
      marksLost,
      questionIds: [...byQuestion.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id),
    }));
}

/** Assemble the exam: weak topics first, their missed questions first, then
 *  fill from the same weak topics up to the caps. Empty question set when the
 *  window has no recoverable misses. */
export function buildWeakTopicExam(input: {
  mistakes: Mistake[];
  questions: Question[];
  days?: number;
  maxTopics?: number;
  maxQuestions?: number;
  now?: Date;
}): WeakTopicExam {
  const days = input.days ?? WEAK_EXAM_WINDOW_DAYS;
  const now = input.now ?? new Date();
  const maxTopics = input.maxTopics ?? WEAK_EXAM_MAX_TOPICS;
  const maxQuestions = input.maxQuestions ?? WEAK_EXAM_MAX_QUESTIONS;

  const windowMisses = missesSince(input.mistakes, days, now);
  const topics = summarizeWeakTopics(windowMisses, input.questions).slice(0, maxTopics);
  const weakTopicIds = new Set(topics.map((topic) => topic.topicId));

  const chosen: Id[] = [];
  const seen = new Set<Id>();
  const push = (id: Id) => {
    if (seen.has(id) || chosen.length >= maxQuestions) return;
    seen.add(id);
    chosen.push(id);
  };

  // 1. The exact questions behind this week's misses, weak topic first.
  for (const topic of topics) {
    for (const id of topic.questionIds) push(id);
  }

  // 2. Fill the paper with other stored questions from the same weak topics,
  //    weakest topic first.
  const fill = input.questions
    .filter((question) => weakTopicIds.has(question.topicIds[0] ?? ""))
    .sort((a, b) => a.totalMarks - b.totalMarks);
  for (const question of fill) push(question.id);

  const byId = new Map(input.questions.map((question) => [question.id, question] as const));
  const totalMarks = chosen.reduce((sum, id) => sum + (byId.get(id)?.totalMarks ?? 0), 0);

  return {
    windowDays: days,
    topics,
    questionIds: chosen,
    totalMarks,
    since: windowMisses.length ? windowMisses.map((m) => m.createdAt).sort()[0]! : null,
  };
}
