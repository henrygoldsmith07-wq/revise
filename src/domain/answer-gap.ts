// ---------------------------------------------------------------------------
// What a lost mark says about the answer itself.
//
// The marker says which scheme points were missed. The offline error
// classifier then guessed *why* from the wording of the question ("there is a
// number in it, so: calculation"), which told a student who wrote "I don't
// know" that they had a calculation problem, and one who divided the wrong
// way round that their answer "does not yet address the question".
//
// This module reads the answer the student actually wrote against the points
// they missed and separates the cases that call for different repairs:
//
//   not-attempted  blank, or only "I don't know"           -> learn it first
//   guessed        hedged ("not sure") and nothing credited -> learn it first
//   opposite       states what a scheme point contradicts   -> fix the idea
//   inverted       final value is the reciprocal            -> fix the method
//   power-of-ten   right digits, wrong power of ten         -> fix the unit
//   working        right numbers in, wrong value out        -> redo the working
//   bare-number    a wrong final value with no working      -> show the working
//   incomplete     most marks earned, points not in the answer -> state each point
//   partial        some credit, most still missing
//   off-target     a real answer, none of it credited       -> uncertain
//
// Every reading carries how sure it is. Only readings that rest on something
// the student wrote (or on writing nothing) are offered to the classifier as
// confident; the rest are worded as possibilities and never drive a repair on
// their own. Nothing here changes a mark.
//
// Pure: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { answerClauses, contradictionExplanation, schemeContradiction } from "./marking-contradiction";
import { extractNumbersCached, sameToTwoSigFigs } from "./marking-numeric";
import type { ErrorCategory } from "./error-taxonomy";
import type { MarkedPart, Question } from "./types";

export type AnswerGapKind =
  | "not-attempted"
  | "guessed"
  | "opposite"
  | "inverted"
  | "power-of-ten"
  | "working"
  | "bare-number"
  | "incomplete"
  | "partial"
  | "off-target";

/** How the gap should be repaired first. */
export type AnswerGapRepair = "learn" | "example" | "redo" | "state-points";

export type AnswerGapCertainty = "clear" | "likely" | "unsure";

export interface AnswerGap {
  kind: AnswerGapKind;
  certainty: AnswerGapCertainty;
  /** One sentence to the student about this answer. */
  happened: string;
  /** What to do about it, in one sentence. */
  fix: string;
  repair: AnswerGapRepair;
  /**
   * The error category this reading supports, with a confidence on the
   * classifier's scale. Null when the answer gives no better evidence than
   * the classifier's existing heuristics already use.
   */
  verdict: { category: ErrorCategory; confidence: number; reason: string } | null;
}

export interface AnswerGapInput {
  answer: string;
  missedPoints: readonly string[];
  /** Points the answer did earn; their values are never read as errors. */
  creditedPoints?: readonly string[];
  awarded: number;
  max: number;
  /** Stem and part prompt, used only to tell given data from the student's own numbers. */
  prompt?: string;
  /** A chosen option index is not written evidence; MCQs are never read here. */
  isMcq?: boolean;
}

// --- "I don't know" --------------------------------------------------------

const HEDGE =
  /\b(?:i\s+)?(?:really\s+|honestly\s+)?(?:do\s*n['’]?t|dont|do\s+not|did\s*n['’]?t|didnt)\s+(?:really\s+|actually\s+)?(?:know|remember|understand|get\s+(?:it|this))\b|\b(?:i\s+)?(?:have\s+|['’]?ve\s+|got\s+)?no\s+(?:idea|clue)\b|\b(?:i\s*(?:am|['’]?m)\s+)?not\s+(?:too\s+|really\s+|very\s+|at\s+all\s+)?sure\b|\bunsure\b|\bidk\b|\bdunno\b|\b(?:can\s*['’]?t|cannot|can\s+not)\s+(?:remember|recall)\b|\bforgot(?:ten)?\b|\b(?:just\s+)?(?:a\s+)?guess(?:ing|ed)?\b|\bnever\s+(?:learned|learnt|did|covered)\b/gi;

const FILLER = new Set([
  "the", "and", "but", "this", "that", "its", "it's", "with", "have", "has", "what", "how", "why", "about", "really", "think",
  "something", "anything", "maybe", "probably", "sorry", "answer", "question", "one", "yet", "for", "you", "can", "tell",
]);

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-zα-ω][a-zα-ω'’-]{2,}/g) ?? []).filter((word) => !FILLER.has(word));
}

function hasHedge(answer: string): boolean {
  HEDGE.lastIndex = 0;
  return HEDGE.test(answer);
}

/**
 * The student saying, of themselves, that they are unsure. Narrower than
 * HEDGE: "we do not know the mass" inside a real answer is physics, not a
 * confession, so the multi-word forms need their "I".
 */
const SELF_DOUBT =
  /\bi\s+(?:really\s+|honestly\s+)?(?:do\s*n['’]?t|dont|do\s+not|did\s*n['’]?t|didnt)\s+(?:really\s+|actually\s+)?(?:know|remember|understand|get\s+(?:it|this))\b|\bi\s+(?:have\s+|['’]?ve\s+|got\s+)?no\s+(?:idea|clue)\b|\bi\s*(?:am|['’]?m)\s+not\s+(?:too\s+|really\s+|very\s+|at\s+all\s+)?sure\b|\b(?:but|though|,)\s+not\s+sure\b|^\s*not\s+sure\b|\bidk\b|\bdunno\b|\bi\s+(?:can\s*['’]?t|cannot|can\s+not)\s+(?:remember|recall)\b|\bi\s+forgot\b|\bi\s*(?:am|['’]?m)\s+(?:just\s+)?guessing\b|\b(?:this\s+is\s+|just\s+)a\s+guess\b/i;

function saysUnsure(answer: string): boolean {
  return SELF_DOUBT.test(answer);
}

/** Blank, punctuation, or nothing but "I don't know". */
function saysNothing(answer: string): boolean {
  const text = answer.trim();
  if (!text) return true;
  if (!/[a-z0-9α-ω]/i.test(text)) return true;
  const rest = text.replace(HEDGE, " ");
  return contentWords(rest).length < 2 && !/\d/.test(rest) && (hasHedge(text) || /^(?:n\/?a|none|nothing|skip|pass|no|x+|-+|\?+)$/i.test(text));
}

// --- numbers ---------------------------------------------------------------

interface Written { raw: string; value: number }

function written(text: string): Written[] {
  return extractNumbersCached(text).flatMap((hit) =>
    hit.value !== null && Number.isFinite(hit.value) ? [{ raw: hit.raw, value: hit.value }] : []);
}

function plainNumbers(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/** The result a numeric scheme point reaches: the numbers after its last "=". */
function resultsOf(point: string): Written[] {
  const at = point.lastIndexOf("=");
  return at < 0 ? [] : written(point.slice(at + 1));
}

/** Plain numbers a point works from, before its last "=" (a fraction counts as its two parts). */
function operandsOf(point: string): number[] {
  const at = point.lastIndexOf("=");
  return at < 0 ? [] : plainNumbers(point.slice(0, at));
}

function close(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return false;
  return sameToTwoSigFigs(a, b);
}

/**
 * Significant figures as written ("1.0 × 10^8" is two, "70" and "7" are one),
 * so a single-digit coincidence is never read as a slip.
 */
function writtenSigFigs(raw: string): number {
  const mantissa = raw.replace(/\s*(?:[×x*]\s*10\s*\^?.*|e[+-]?\d+)$/i, "").replace(/^[-+]/, "");
  if (mantissa.includes("/")) return 2;
  const digits = mantissa.includes(".") ? mantissa.replace(".", "").replace(/^0+/, "") : mantissa.replace(/^0+/, "").replace(/0+$/, "");
  return digits.length;
}

function show(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e6) return String(value);
  const short = Number(value.toPrecision(3));
  return Math.abs(short) >= 1e6 || Math.abs(short) < 1e-3 ? short.toExponential().replace("e+", " × 10^").replace("e-", " × 10^-") : String(short);
}

/** "a/b" in the scheme, "b/a" in the answer. */
function reversedDivision(point: string, answer: string): { said: string; needed: string } | null {
  const division = /(\d+(?:\.\d+)?)\s*(?:\/|÷)\s*(\d+(?:\.\d+)?)/g;
  for (const match of point.matchAll(division)) {
    const [, top, bottom] = match;
    if (!top || !bottom || Number(top) === Number(bottom)) continue;
    for (const found of answer.matchAll(division)) {
      if (Number(found[1]) === Number(bottom) && Number(found[2]) === Number(top)) {
        return { said: `${found[1]} ÷ ${found[2]}`, needed: `${top} ÷ ${bottom}` };
      }
    }
  }
  return null;
}

/** The value the answer ends on: what follows its last "=", else its last number. */
function finalWritten(answer: string): Written | null {
  const at = answer.lastIndexOf("=");
  const tail = written(at < 0 ? answer : answer.slice(at + 1));
  const pool = tail.length ? tail : written(answer);
  // "3.0 × 10^8" is also read as "3.0" and "10^8"; the longest reading is the number written.
  return [...pool].sort((a, b) => b.raw.length - a.raw.length)[0] ?? null;
}

interface NumericReading {
  kind: "inverted" | "power-of-ten" | "working" | "bare-number";
  clear: boolean;
  said: string;
  needed: string;
}

function readNumbers(input: AnswerGapInput): NumericReading | null {
  const answer = input.answer;
  const given = new Set(plainNumbers(input.prompt ?? ""));
  // Values the scheme accepts anywhere in this part are never an error.
  const accepted = [...input.missedPoints, ...(input.creditedPoints ?? [])].flatMap(resultsOf);
  const isAccepted = (value: number) => accepted.some((result) => close(value, result.value));
  // The student's own results: numbers they wrote that the question did not give them.
  const own = written(answer).filter((hit) => !given.has(hit.value) && !isAccepted(hit.value));
  if (!own.length) return null;
  // A point that only restates given data ("input power = 600 W") has no result to miss.
  const targets = input.missedPoints
    .map((point) => ({ point, results: resultsOf(point).filter((result) => !given.has(result.value)) }))
    .filter((target) => target.results.length);
  if (!targets.length) return null;

  for (const { point } of targets) {
    const reversed = reversedDivision(point, answer);
    if (reversed) return { kind: "inverted", clear: true, said: reversed.said, needed: reversed.needed };
  }
  for (const { results } of targets) {
    for (const result of results) {
      if (result.value === 0 || Math.abs(result.value - 1) < 0.05) continue;
      // 1/x; and, where a percentage is in play, the same slip written as one.
      const percent = /%|per\s*cent/i.test(`${answer} ${input.missedPoints.join(" ")}`);
      const candidates = percent ? [1 / result.value, 100 / result.value, 10000 / result.value] : [1 / result.value];
      const flipped = own.find((hit) => writtenSigFigs(hit.raw) >= 2 && candidates.some((candidate) => close(hit.value, candidate)));
      if (flipped) return { kind: "inverted", clear: false, said: show(flipped.value), needed: show(result.value) };
    }
  }
  for (const { results } of targets) {
    for (const result of results) {
      if (result.value === 0 || writtenSigFigs(result.raw) < 2) continue;
      const shifted = own.find((hit) => {
        if (hit.value === 0 || Math.sign(hit.value) !== Math.sign(result.value) || writtenSigFigs(hit.raw) < 2) return false;
        const power = Math.round(Math.log10(Math.abs(hit.value / result.value)));
        return power !== 0 && Math.abs(power) <= 9 && close(hit.value / 10 ** power, result.value);
      });
      if (shifted) return { kind: "power-of-ten", clear: false, said: show(shifted.value), needed: show(result.value) };
    }
  }

  const final = finalWritten(answer);
  if (!final || given.has(final.value) || isAccepted(final.value)) return null;
  const target = targets[0]!;
  const needed = show(target.results[0]!.value);
  const operands = operandsOf(target.point);
  const used = new Set(operands.filter((operand) => plainNumbers(answer).includes(operand)));
  if (new Set(operands).size >= 2 && used.size >= 2) return { kind: "working", clear: false, said: show(final.value), needed };
  if (contentWords(answer).length <= 2 && !/\d\s*[=×*/÷+−-]\s*\d/.test(answer)) {
    return { kind: "bare-number", clear: false, said: show(final.value), needed };
  }
  return null;
}

// --- "equals" answered with "bigger than" ----------------------------------

const EQUALITY = /\s+(?:equals?|is\s+equal\s+to|are\s+equal\s+to|equal\s+to|balances?|is\s+the\s+same\s+as|=)\s+/i;
const COMPARATIVE = /\s+(?:is|are|was|were|becomes?|gets?|stays?|remains?)?\s*(?:much\s+|far\s+|slightly\s+)?(?:bigger|greater|larger|more|higher|stronger|less|smaller|lower|weaker)\s+than\s+/i;

/**
 * The scheme needs two things to be equal ("upward drag equals downward
 * weight") and a clause of the answer says one is bigger than the other.
 * Each side of the answer's comparison must name a different side of the
 * equality, by a word only that side has, so "the truck's momentum is
 * greater than the car's before the collision" is not read against
 * "momentum before equals momentum after".
 */
function comparativeAgainstEquality(point: string, answer: string): { said: string; needed: string } | null {
  const equality = point.match(EQUALITY);
  if (!equality || equality.index === undefined) return null;
  const left = new Set(contentWords(point.slice(0, equality.index)));
  const right = new Set(contentWords(point.slice(equality.index + equality[0].length)));
  const leftOnly = [...left].filter((word) => !right.has(word));
  const rightOnly = [...right].filter((word) => !left.has(word));
  if (!leftOnly.length || !rightOnly.length) return null;
  for (const clause of answerClauses(answer)) {
    const comparative = clause.match(COMPARATIVE);
    if (!comparative || comparative.index === undefined || /\bnot\b|n['’]t\b/i.test(clause)) continue;
    const before = new Set(contentWords(clause.slice(0, comparative.index)));
    const after = new Set(contentWords(clause.slice(comparative.index + comparative[0].length)));
    const names = (side: Set<string>, words: string[]) => words.some((word) => side.has(word));
    if ((names(before, leftOnly) && names(after, rightOnly)) || (names(before, rightOnly) && names(after, leftOnly))) {
      return { said: clause.trim().replace(/\s+/g, " ").slice(0, 120), needed: point };
    }
  }
  return null;
}

// --- the reading -----------------------------------------------------------

function quote(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 110 ? `${trimmed.slice(0, 107)}…` : trimmed;
}

function listPoints(points: readonly string[]): string {
  const shown = points.slice(0, 2).map((point) => `“${quote(point).replace(/[.]$/, "")}”`);
  return points.length > 2 ? `${shown.join("; ")} and ${points.length - 2} more` : shown.join("; ");
}

/**
 * Read one part's answer against the points it missed. Null when the part
 * lost nothing, was multiple choice, or there is nothing to read.
 */
export function readAnswerGap(input: AnswerGapInput): AnswerGap | null {
  if (input.isMcq || input.max <= 0 || input.awarded >= input.max) return null;
  const answer = input.answer ?? "";
  const missed = input.missedPoints.filter((point) => point.trim());

  if (saysNothing(answer)) {
    const blank = !answer.trim();
    return {
      kind: "not-attempted",
      certainty: "clear",
      happened: blank
        ? "You left this blank, so there was nothing to give marks for."
        : "You said you did not know this one, so there was nothing to give marks for.",
      fix: "That is a gap in what you know, not a slip. Learn the idea first, then try a question on it.",
      repair: "learn",
      verdict: { category: "knowledge-gap", confidence: 0.9, reason: blank ? "nothing was written for this part" : "the answer only says it is not known" },
    };
  }

  for (const point of missed) {
    const contradiction = schemeContradiction(point, answer);
    if (contradiction) {
      return {
        kind: "opposite",
        certainty: "clear",
        happened: contradictionExplanation(contradiction).replace(/^Not awarded: your answer/, "Your answer"),
        fix: "You did not leave this out; you stated something the mark scheme rules out. Check the idea itself before practising more.",
        repair: "learn",
        verdict: { category: "misconception", confidence: 0.8, reason: `the answer says “${contradiction.said}” where the scheme needs “${contradiction.needed}”` },
      };
    }
    const comparison = comparativeAgainstEquality(point, answer);
    if (comparison) {
      return {
        kind: "opposite",
        certainty: "likely",
        happened: `You wrote “${comparison.said}”, but the mark scheme needs “${quote(comparison.needed)}”.`,
        fix: "You did not leave this out; you stated something different from what is credited. Check the idea itself before practising more.",
        repair: "learn",
        verdict: { category: "misconception", confidence: 0.72, reason: "the answer states an inequality where the scheme needs the two to be equal" },
      };
    }
  }

  const numbers = readNumbers({ ...input, answer, missedPoints: missed });
  if (numbers?.kind === "inverted") {
    return {
      kind: "inverted",
      certainty: numbers.clear ? "clear" : "likely",
      happened: numbers.clear
        ? `You worked out ${numbers.said}, but the mark scheme needs ${numbers.needed}: the division is the wrong way round.`
        : `Your value ${numbers.said} is what you get by dividing the wrong way round; the mark scheme reaches ${numbers.needed}.`,
      fix: "You picked the right quantities, so this is about the relationship itself. Check which quantity goes on top, then redo it.",
      repair: "example",
      // Written out the wrong way round is evidence; a value that merely equals
      // the reciprocal is a reading, shown as likely but never stored as the cause.
      verdict: numbers.clear ? { category: "formula-selection", confidence: 0.85, reason: "the working divides the scheme's two quantities the other way round" } : null,
    };
  }
  if (numbers?.kind === "power-of-ten") {
    return {
      kind: "power-of-ten",
      certainty: "likely",
      happened: `Your value ${numbers.said} has the right digits but the wrong power of ten; the mark scheme reaches ${numbers.needed}.`,
      fix: "The method looks right. Check each unit prefix and conversion (milli, kilo, cm to m) before you substitute.",
      repair: "redo",
      verdict: { category: "unit-error", confidence: 0.75, reason: "the value differs from the scheme's by a power of ten" },
    };
  }

  const ratio = input.awarded / input.max;
  if (saysUnsure(answer) && input.awarded === 0) {
    return {
      kind: "guessed",
      certainty: "likely",
      happened: "You said you were not sure, and nothing in the answer matched the mark scheme.",
      fix: "That points to the idea not being learned yet, rather than a slip. Learn it first, then try a question on it.",
      repair: "learn",
      verdict: { category: "knowledge-gap", confidence: 0.75, reason: "the answer says it is a guess and earned nothing" },
    };
  }

  if (numbers?.kind === "working") {
    return {
      kind: "working",
      certainty: "unsure",
      happened: `You used the right numbers but reached ${numbers.said}; the mark scheme reaches ${numbers.needed}.`,
      fix: "Compare how you combined them with the worked example, one line at a time, to find where it changed.",
      repair: "example",
      verdict: null,
    };
  }
  if (numbers?.kind === "bare-number") {
    return {
      kind: "bare-number",
      certainty: "unsure",
      happened: `Your final value ${numbers.said} does not match the mark scheme's ${numbers.needed}, and there is no working to show where it went wrong.`,
      fix: "Write each step. Method marks can be earned even when the final value is wrong, and a slip can be found.",
      repair: "example",
      verdict: null,
    };
  }

  if (input.awarded > 0 && ratio >= 0.5 && missed.length) {
    return {
      kind: "incomplete",
      certainty: "likely",
      happened: `Most of this was credited. The ${missed.length === 1 ? "mark you dropped was for a point that is" : "marks you dropped were for points that are"} not in your answer: ${listPoints(missed)}.`,
      fix: "This looks like something left unsaid rather than something not known. Write each step down, one point per mark, even when it feels obvious.",
      repair: "state-points",
      verdict: null,
    };
  }
  if (input.awarded > 0) {
    return {
      kind: "partial",
      certainty: "unsure",
      happened: `Part of this was credited, but most of the marks were for points that are not in your answer: ${listPoints(missed)}.`,
      fix: "Read the worked example for this idea, then try a fresh question on it.",
      repair: "example",
      verdict: null,
    };
  }
  if ((answer.match(/[a-zα-ω0-9]+/gi) ?? []).length >= 3) {
    return {
      kind: "off-target",
      certainty: "unsure",
      happened: "None of what you wrote matched the points this question gives marks for.",
      fix: "Either the idea is new to you, or the question wanted something different from what you answered. The idea and the model answer will show which.",
      repair: "learn",
      verdict: null,
    };
  }
  return null;
}

export interface PartAnswerGap {
  partId: string;
  /** The part's printed label, "" for a single-part question. */
  label: string;
  lost: number;
  gap: AnswerGap;
}

/**
 * Every part of a marked question that lost marks and can be read, most
 * certain first. Empty for multiple choice and for full marks.
 */
export function readQuestionGaps(
  question: Pick<Question, "kind" | "stem" | "parts">,
  marked: readonly MarkedPart[],
  answers: Record<string, string> | undefined,
): PartAnswerGap[] {
  if (question.kind === "mcq" || !answers) return [];
  const rows: PartAnswerGap[] = [];
  for (const mark of marked) {
    if (mark.awarded >= mark.max) continue;
    const part = question.parts.find((candidate) => candidate.id === mark.partId);
    if (!part) continue;
    const gap = readAnswerGap({
      answer: answers[part.id] ?? "",
      missedPoints: mark.missedPoints,
      creditedPoints: mark.creditedPoints,
      awarded: mark.awarded,
      max: mark.max,
      prompt: `${question.stem}\n${part.prompt}`,
    });
    if (gap) rows.push({ partId: part.id, label: part.label ?? "", lost: mark.max - mark.awarded, gap });
  }
  const rank: Record<AnswerGapCertainty, number> = { clear: 0, likely: 1, unsure: 2 };
  return rows.sort((a, b) => rank[a.gap.certainty] - rank[b.gap.certainty] || b.lost - a.lost);
}
