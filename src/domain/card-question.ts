// ---------------------------------------------------------------------------
// Card → exam question linker.
//
// Seed cards are minted per authored key point and keep the spec statement
// they support (`card.specPointIds`); authored questions carry the same
// stable ids (`question.specPointIds`). So "an official-style exam question
// that uses this card's point" is an exact set intersection, not a fuzzy
// guess: same topic, shared spec point.
//
// When nothing authored tests that exact point we return null — the review
// flow then simply does not pause. We never substitute a question about a
// different point and label it as this card's.
//
// Pure domain: no React, no storage.
// ---------------------------------------------------------------------------

import type { Card, Id, Question } from "./types";

/** Written (non-MCQ) kinds — an official-style question, not a four-option pick. */
const WRITTEN_KINDS = new Set<Question["kind"]>(["short", "structured", "calculation", "extended"]);

export function cardPointIds(card: Card): Id[] {
  return card.specPointIds ?? [];
}

/** Authored questions in the card's topic that test at least one of the
 *  card's spec points. Exact intersection only. */
export function questionsTestingCardPoint(card: Card, questions: Question[]): Question[] {
  const points = new Set(cardPointIds(card));
  if (points.size === 0) return [];
  return questions.filter(
    (question) =>
      question.topicIds.includes(card.topicId) &&
      (question.specPointIds ?? []).some((id) => points.has(id)),
  );
}

/**
 * The one question to show after this card: written kinds first (an MCQ does
 * not rehearse the retrieval an exam demands), then the tightest question —
 * fewest marks (a single-point question, not a synoptic monster), then fewest
 * parts. Null when no authored question tests this card's point.
 */
export function pickExamQuestionForCard(card: Card, questions: Question[]): Question | null {
  const candidates = questionsTestingCardPoint(card, questions);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aw = WRITTEN_KINDS.has(a.kind) ? 0 : 1;
    const bw = WRITTEN_KINDS.has(b.kind) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    if (a.totalMarks !== b.totalMarks) return a.totalMarks - b.totalMarks;
    return a.parts.length - b.parts.length;
  })[0] ?? null;
}
