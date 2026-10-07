// ---------------------------------------------------------------------------
// The Socratic examiner — the pure half.
//
// After a question is marked below full marks, the feedback panel offers one
// guiding question instead of (or before) the mark scheme. Everything that can
// be decided without a model lives here, so it is deterministic, offline and
// unit-testable:
//
//   1. which part and which dropped mark-scheme points to focus on;
//   2. which authored misconception (src/content/misconceptions) explains
//      them, and how strong that match is — a weak match is said out loud,
//      never dressed up as a diagnosis;
//   3. the static guidance shown instantly (and kept whenever the model is
//      unavailable, consent is off, or the device is offline);
//   4. the context the model may see (the caller masks the answer); and
//   5. the guard every model reply must pass before it replaces the static
//      text: exactly one question, and no restating of the dropped points.
//
// No React, no network, no clock.
// ---------------------------------------------------------------------------

import { tokenise } from "./marking";
import { bestMisconceptionMatch, MISCONCEPTION_MATCH_THRESHOLD } from "./misconception-library";
import type { MarkedPart, Misconception, Question } from "./types";

/** At or above this library score the misconception is presented as the likely cause. */
export const STRONG_MISCONCEPTION_MATCH = 0.7;

/** How confident the deterministic matcher is that the misconception explains the lost marks. */
export type MisconceptionMatchStrength = "strong" | "weak" | "none";

export interface SocraticFocus {
  partId: string;
  partLabel: string;
  partPrompt: string;
  /** The dropped mark-scheme points for the focus part. */
  missedPoints: string[];
  /** The learner's original answer to the focus part (never sent unmasked). */
  studentAnswer: string;
  marksDropped: number;
  misconception: Misconception | null;
  /** Raw library score, 0–1. Kept for tests and for the "weak match" wording. */
  matchScore: number;
  strength: MisconceptionMatchStrength;
}

export function matchStrength(score: number): MisconceptionMatchStrength {
  if (score >= STRONG_MISCONCEPTION_MATCH) return "strong";
  if (score >= MISCONCEPTION_MATCH_THRESHOLD) return "weak";
  return "none";
}

/**
 * Pick what the examiner should ask about: the part that dropped the most
 * marks (first one on a tie), its missed points, and the best-matching
 * misconception across those points. Null when nothing was dropped.
 */
export function selectSocraticFocus(input: {
  question: Pick<Question, "parts" | "totalMarks">;
  marked: ReadonlyArray<Pick<MarkedPart, "partId" | "awarded" | "max" | "missedPoints">>;
  answers: Readonly<Record<string, string>>;
  misconceptions: readonly Misconception[];
}): SocraticFocus | null {
  let focus: { marked: (typeof input.marked)[number]; dropped: number } | null = null;
  for (const marked of input.marked) {
    const dropped = Math.max(0, marked.max - marked.awarded);
    if (dropped <= 0) continue;
    if (!focus || dropped > focus.dropped) focus = { marked, dropped };
  }
  if (!focus) return null;

  const part = input.question.parts.find((p) => p.id === focus.marked.partId) ?? input.question.parts[0];
  if (!part) return null;
  // A part can lose marks without the marker naming the points (e.g. a
  // follow-through cap); fall back to the part's own scheme so there is
  // always something concrete to reason about.
  const missedPoints = (focus.marked.missedPoints.length ? focus.marked.missedPoints : part.markScheme).slice(0, 6);
  const studentAnswer = input.answers[part.id] ?? "";

  let best: { entry: Misconception; score: number } | null = null;
  for (const point of missedPoints) {
    const match = bestMisconceptionMatch(input.misconceptions, point, studentAnswer);
    if (match && (!best || match.score > best.score)) best = match;
  }
  // Rounded before grading so a 7/10 token coverage is exactly 0.7, not 0.6999….
  const score = Math.round((best?.score ?? 0) * 1000) / 1000;
  const strength = matchStrength(score);

  return {
    partId: part.id,
    partLabel: part.label,
    partPrompt: part.prompt,
    missedPoints,
    studentAnswer,
    marksDropped: focus.dropped,
    misconception: strength === "none" ? null : (best?.entry ?? null),
    matchScore: score,
    strength,
  };
}

export interface StaticSocraticGuidance {
  /** One calm line naming what the guidance is based on. */
  basis: string;
  /** The authored misconception, when one matched. */
  statement: string | null;
  explanation: string | null;
  correction: string | null;
  /** A reflective prompt that never gives the answer away. */
  reflectPrompt: string;
}

/**
 * The static text shown immediately and kept whenever the model cannot be
 * used. It is the authored misconception verbatim — hand-written, offline,
 * already checked — with the match strength stated honestly.
 */
export function staticSocraticGuidance(focus: SocraticFocus): StaticSocraticGuidance {
  const entry = focus.misconception;
  if (entry && focus.strength === "strong") {
    return {
      basis: "Your answer looks like a common misconception.",
      statement: entry.statement,
      explanation: entry.explanation,
      correction: entry.correction,
      reflectPrompt: "Read your answer again. Which sentence shows this idea, and how would you rewrite it?",
    };
  }
  if (entry) {
    return {
      basis: "This is the closest known misconception, but the match is weak — it may not be what happened in your answer.",
      statement: entry.statement,
      explanation: entry.explanation,
      correction: entry.correction,
      reflectPrompt: "Does this describe your thinking? If not, compare your answer with the points you missed.",
    };
  }
  return {
    basis: "No known misconception matches this answer closely, so there is no diagnosis to show.",
    statement: null,
    explanation: null,
    correction: null,
    reflectPrompt: "Look at the points you missed. What did the question need that your answer did not say?",
  };
}

/** What the model may see. The caller masks `studentAnswer` before it leaves the device. */
export interface SocraticExaminerContext {
  partPrompt: string;
  markScheme: string[];
  studentAnswer: string;
  misconception?: { statement: string; explanation: string; correction: string };
  matchStrength: MisconceptionMatchStrength;
}

export function socraticExaminerContext(focus: SocraticFocus): SocraticExaminerContext {
  return {
    partPrompt: focus.partPrompt,
    markScheme: focus.missedPoints,
    studentAnswer: focus.studentAnswer,
    ...(focus.misconception
      ? {
          misconception: {
            statement: focus.misconception.statement,
            explanation: focus.misconception.explanation,
            correction: focus.misconception.correction,
          },
        }
      : {}),
    matchStrength: focus.strength,
  };
}

// --- reply guard -------------------------------------------------------------

/** Share of a missed point's content words that, if repeated, counts as giving the answer away. */
export const ANSWER_LEAK_COVERAGE = 0.8;

const contentTokens = (text: string) =>
  [...tokenise(text)].map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter((t) => t.length > 1);

/** True when `text` repeats most of a dropped mark-scheme point — i.e. hands over the answer. */
export function revealsMarkScheme(text: string, missedPoints: readonly string[]): boolean {
  const given = new Set(contentTokens(text));
  return missedPoints.some((point) => {
    const wanted = [...new Set(contentTokens(point))];
    // Very short points ("2.5 m s-1") are too easy to hit by accident; only
    // points with enough substance can be "given away" by overlap.
    if (wanted.length < 3) return false;
    const hits = wanted.filter((w) => given.has(w)).length;
    return hits / wanted.length >= ANSWER_LEAK_COVERAGE;
  });
}

export type SocraticReplyCheck =
  | { ok: true; lead: string; question: string }
  | { ok: false; reason: "no-question" | "more-than-one-question" | "reveals-answer" };

const questionMarks = (text: string) => (text.match(/\?/g) ?? []).length;

/**
 * Accept a model reply only if it asks exactly one guiding question and does
 * not restate any dropped mark-scheme point. Anything else keeps the static
 * guidance on screen. `lead` is the optional acknowledgement before the question.
 */
export function checkSocraticReply(
  reply: { reply: string; nextQuestion?: string },
  missedPoints: readonly string[],
): SocraticReplyCheck {
  const body = reply.reply.trim();
  const next = reply.nextQuestion?.trim() ?? "";
  let lead: string;
  let question: string;
  if (next) {
    if (questionMarks(next) !== 1 || questionMarks(body) > 0) return { ok: false, reason: "more-than-one-question" };
    if (!next.endsWith("?")) return { ok: false, reason: "no-question" };
    lead = body === next ? "" : body;
    question = next;
  } else {
    const count = questionMarks(body);
    if (count === 0) return { ok: false, reason: "no-question" };
    if (count > 1) return { ok: false, reason: "more-than-one-question" };
    // Split the single question sentence from any lead-in.
    const end = body.indexOf("?") + 1;
    const start = Math.max(body.lastIndexOf(". ", end), body.lastIndexOf("\n", end), body.lastIndexOf("! ", end));
    question = body.slice(start + 1, end).trim();
    lead = (body.slice(0, start + 1) + body.slice(end)).trim();
  }
  if (revealsMarkScheme(`${lead} ${question}`, missedPoints)) return { ok: false, reason: "reveals-answer" };
  return { ok: true, lead, question };
}
