import { shuffleWithSeed } from "./shuffle";
import type { Card, Id } from "./types";

// ---------------------------------------------------------------------------
// Study modes: several ways to work the *same* cards, because different modes
// train different things.
//
// * **Learn** promotes a card through recognition → production. Multiple
//   choice first (cheap, builds familiarity), then typed recall (expensive,
//   what the exam actually asks for). A card only graduates once it has been
//   produced from memory, not merely recognised.
// * **Test** is a one-shot graded paper over a fixed set, marked at the end
//   rather than card-by-card — the point is to simulate not knowing how you
//   are doing until it is over.
// * **Match** is a timed pairing game. It is the one mode that is genuinely
//   about speed, which is why it uses fronts and backs rather than recall.
//
// All of it is pure: the components own presentation, this owns the rules.
// ---------------------------------------------------------------------------

export type StudyMode = "learn" | "test" | "match" | "diagram" | "audio" | "explanation";

// --- learn mode ------------------------------------------------------------

/** How many correct answers at a stage promote a card to the next one. */
const PROMOTE_AFTER = 1;
/** Cards seen this many times without progress are surfaced for a rewrite. */
export const STRUGGLE_THRESHOLD = 3;

export type LearnStage = "multiple-choice" | "typed" | "done";

export interface LearnCardState {
  cardId: Id;
  stage: LearnStage;
  correctAtStage: number;
  wrongTotal: number;
  seen: number;
}

export interface LearnSession {
  states: Record<Id, LearnCardState>;
  /** Ids in the order they should next be shown. */
  queue: Id[];
  answered: number;
  correct: number;
}

export function startLearnSession(cards: Card[], seed = 1): LearnSession {
  const ordered = shuffleWithSeed(cards, seed);
  return {
    states: Object.fromEntries(
      ordered.map((card) => [
        card.id,
        { cardId: card.id, stage: "multiple-choice" as LearnStage, correctAtStage: 0, wrongTotal: 0, seen: 0 },
      ]),
    ),
    queue: ordered.map((c) => c.id),
    answered: 0,
    correct: 0,
  };
}

/**
 * Apply an answer. A right answer promotes (or graduates); a wrong one drops
 * the card back to recognition and re-queues it a few places later, so it is
 * met again within the session rather than at the end of it.
 */
export function answerLearn(session: LearnSession, cardId: Id, correct: boolean): LearnSession {
  const previous = session.states[cardId];
  if (!previous) return session;

  const state: LearnCardState = {
    ...previous,
    seen: previous.seen + 1,
    wrongTotal: previous.wrongTotal + (correct ? 0 : 1),
    correctAtStage: correct ? previous.correctAtStage + 1 : 0,
  };

  if (correct && state.correctAtStage >= PROMOTE_AFTER) {
    state.stage = previous.stage === "multiple-choice" ? "typed" : "done";
    state.correctAtStage = 0;
  } else if (!correct) {
    // Demote: producing it from memory is clearly not secure yet.
    state.stage = "multiple-choice";
  }

  const rest = session.queue.filter((id) => id !== cardId);
  const queue = state.stage === "done" ? rest : reinsertAt(rest, cardId, correct ? 5 : 2);

  return {
    states: { ...session.states, [cardId]: state },
    queue,
    answered: session.answered + 1,
    correct: session.correct + (correct ? 1 : 0),
  };
}

function reinsertAt<T>(queue: T[], item: T, gap: number): T[] {
  const next = [...queue];
  next.splice(Math.min(gap, next.length), 0, item);
  return next;
}

export function learnProgress(session: LearnSession): { done: number; total: number; accuracy: number } {
  const states = Object.values(session.states);
  return {
    done: states.filter((s) => s.stage === "done").length,
    total: states.length,
    accuracy: session.answered ? session.correct / session.answered : 0,
  };
}

/** Cards that keep coming back wrong — worth rewriting rather than re-drilling. */
export function strugglingCards(session: LearnSession): Id[] {
  return Object.values(session.states)
    .filter((s) => s.wrongTotal >= STRUGGLE_THRESHOLD)
    .sort((a, b) => b.wrongTotal - a.wrongTotal)
    .map((s) => s.cardId);
}

/**
 * Distractors for a multiple-choice prompt. Drawn from the same topic first,
 * because a wrong option from another subject teaches nothing — the student
 * eliminates it on vibes rather than on knowing the material.
 */
export function buildChoices(card: Card, pool: Card[], count = 4, seed = 1): string[] {
  const sameTopic = pool.filter((c) => c.id !== card.id && c.topicId === card.topicId);
  const sameSubject = pool.filter((c) => c.id !== card.id && c.topicId !== card.topicId && c.subjectId === card.subjectId);
  const rest = pool.filter((c) => c.id !== card.id && c.subjectId !== card.subjectId);

  const candidates: string[] = [];
  for (const source of [sameTopic, sameSubject, rest]) {
    for (const other of shuffleWithSeed(source, seed)) {
      const text = other.back.trim();
      if (text && text !== card.back.trim() && !candidates.includes(text)) candidates.push(text);
      if (candidates.length >= count - 1) break;
    }
    if (candidates.length >= count - 1) break;
  }

  return shuffleWithSeed([card.back.trim(), ...candidates], seed + 7);
}

// --- test mode -------------------------------------------------------------

export type TestQuestionKind = "multiple-choice" | "written" | "true-false";

export interface TestQuestion {
  id: Id;
  cardId: Id;
  kind: TestQuestionKind;
  prompt: string;
  /** Multiple choice and true/false only. */
  options?: string[];
  correctIndex?: number;
  /** The expected answer, for written questions and for showing afterwards. */
  answer: string;
}

export interface TestSpec {
  multipleChoice: boolean;
  written: boolean;
  trueFalse: boolean;
  limit: number;
}

export const DEFAULT_TEST_SPEC: TestSpec = { multipleChoice: true, written: true, trueFalse: true, limit: 15 };

export function buildTest(cards: Card[], spec: TestSpec, seed = 1): TestQuestion[] {
  const kinds: TestQuestionKind[] = [
    ...(spec.multipleChoice ? (["multiple-choice"] as const) : []),
    ...(spec.written ? (["written"] as const) : []),
    ...(spec.trueFalse ? (["true-false"] as const) : []),
  ];
  if (!kinds.length) return [];

  const chosen = shuffleWithSeed(cards, seed).slice(0, Math.max(1, spec.limit));

  return chosen.map((card, index) => {
    const kind = kinds[index % kinds.length];
    if (kind === "multiple-choice") {
      const options = buildChoices(card, cards, 4, seed + index);
      return {
        id: `${card.id}:q`,
        cardId: card.id,
        kind,
        prompt: card.front,
        options,
        correctIndex: options.indexOf(card.back.trim()),
        answer: card.back,
      };
    }
    if (kind === "true-false") {
      // Half the true/false questions are given a wrong answer to judge —
      // otherwise "true" is always right and the question tests nothing.
      const lie = (index + seed) % 2 === 1;
      const other = cards.find((c) => c.id !== card.id && c.back.trim() !== card.back.trim());
      const shown = lie && other ? other.back : card.back;
      return {
        id: `${card.id}:q`,
        cardId: card.id,
        kind,
        prompt: `${card.front}\n\nProposed answer: ${shown}`,
        options: ["True", "False"],
        correctIndex: lie && other ? 1 : 0,
        answer: card.back,
      };
    }
    return { id: `${card.id}:q`, cardId: card.id, kind: "written", prompt: card.front, answer: card.back };
  });
}

export interface TestResult {
  total: number;
  correct: number;
  percent: number;
  /** Per question, for the review screen. */
  rows: { question: TestQuestion; given: string; correct: boolean }[];
  wrongCardIds: Id[];
}

export function gradeTest(questions: TestQuestion[], answers: Record<Id, string>): TestResult {
  const rows = questions.map((question) => {
    const given = (answers[question.id] ?? "").trim();
    let correct: boolean;
    if (question.kind === "written") {
      correct = matchesWritten(given, question.answer);
    } else {
      correct = given !== "" && Number(given) === question.correctIndex;
    }
    return { question, given, correct };
  });

  const right = rows.filter((r) => r.correct).length;
  return {
    total: questions.length,
    correct: right,
    percent: questions.length ? Math.round((right / questions.length) * 100) : 0,
    rows,
    wrongCardIds: rows.filter((r) => !r.correct).map((r) => r.question.cardId),
  };
}

/**
 * Written answers are marked leniently on form and strictly on content: case,
 * punctuation and articles are ignored, but the content words have to be there.
 * A student who writes "the newton" for "newton (N)" knew the answer.
 */
export function matchesWritten(given: string, expected: string): boolean {
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !["the", "a", "an", "is", "are", "of", "to", "in", "and", "it"].includes(w));

  const all = normalise(expected);
  const got = new Set(normalise(given));
  if (!all.length) return got.size === 0;
  if (!got.size) return false;

  // Single characters in an expected answer are almost always a bracketed
  // symbol — "The newton (N)", "current (I)". Requiring them would mark a
  // complete answer wrong, so they earn credit but are never demanded.
  const wanted = all.filter((word) => word.length > 1);
  if (!wanted.length) return all.some((word) => got.has(word));

  const hits = wanted.filter((word) => got.has(word)).length;
  // Short answers must be exact-ish; long ones pass on most content words,
  // since an expected answer of twenty words rarely needs all twenty.
  const required = wanted.length <= 3 ? wanted.length : Math.ceil(wanted.length * 0.6);
  return hits >= required;
}

// --- match game ------------------------------------------------------------

export interface MatchTile {
  id: string;
  cardId: Id;
  side: "front" | "back";
  text: string;
}

/** Six pairs is the most that fits a phone screen without scrolling. */
export const MATCH_PAIRS = 6;

export function buildMatchBoard(cards: Card[], pairs = MATCH_PAIRS, seed = 1): MatchTile[] {
  const usable = cards.filter((c) => c.front.trim() && c.back.trim()).slice(0, Math.max(2, pairs));
  const tiles = usable.flatMap((card) => [
    { id: `${card.id}:front`, cardId: card.id, side: "front" as const, text: card.front },
    { id: `${card.id}:back`, cardId: card.id, side: "back" as const, text: card.back },
  ]);
  return shuffleWithSeed(tiles, seed);
}

export function isMatch(a: MatchTile, b: MatchTile): boolean {
  return a.cardId === b.cardId && a.side !== b.side;
}

/** Seconds, penalised for wrong pairs so speed alone does not win. */
export function matchScore(elapsedMs: number, mistakes: number): number {
  return Math.round(elapsedMs / 1000 + mistakes * 5);
}
