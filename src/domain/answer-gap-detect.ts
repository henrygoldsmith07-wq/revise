// ---------------------------------------------------------------------------
// What a lost mark says about the answer itself: detection.
//
// The reading of an answer has two halves. This one decides WHAT happened
// (blank, the opposite of a scheme point, a division the wrong way round, a
// line of arithmetic that does not add up, a power of ten out, points not in
// the answer), how sure that is, and which error category it supports. It
// is what the classifier and the mistake pipeline use, so it is on the boot
// path of every screen. The sentences shown to the student are the other
// half (./answer-gap.ts) and load only with the marked result.
//
// Every reading carries how sure it is. Only readings that rest on something
// the student wrote (or on writing nothing) carry a verdict; the rest are
// possibilities and never drive a repair on their own. Nothing here changes
// a mark.
//
// Pure: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { answerClauses, schemeContradiction, type Contradiction } from "./marking-contradiction";
import { extractNumbersCached, sameToTwoSigFigs } from "./marking-numeric";
import type { ErrorCategory } from "./error-taxonomy";

export type AnswerGapKind =
  | "not-attempted"
  | "guessed"
  | "opposite"
  | "inverted"
  | "arithmetic"
  | "power-of-ten"
  | "working"
  | "bare-number"
  | "incomplete"
  | "partial"
  | "off-target";

/** How the gap should be repaired first. */
export type AnswerGapRepair = "learn" | "example" | "redo" | "state-points";

export type AnswerGapCertainty = "clear" | "likely" | "unsure";

/** What was found, before any wording. */
export interface AnswerGapDetection {
  kind: AnswerGapKind;
  certainty: AnswerGapCertainty;
  repair: AnswerGapRepair;
  /**
   * The error category this reading supports, with a confidence on the
   * classifier's scale. Null when the answer gives no better evidence than
   * the classifier's existing heuristics already use.
   */
  verdict: { category: ErrorCategory; confidence: number; reason: string } | null;
  /** The pieces the wording quotes. */
  facts: {
    blank?: boolean;
    contradiction?: Contradiction;
    /** A clause of the answer, and the scheme point it differs from. */
    comparison?: { said: string; needed: string };
    /** A line of the student's own arithmetic and what it comes to. */
    sum?: { line: string; correct: string };
    /** A value or division the student wrote, and the scheme's. */
    said?: string;
    needed?: string;
    /** The wrong-way-round division is written out, not inferred from a value. */
    written?: boolean;
    missed: string[];
  };
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

// --- a line that does not add up -------------------------------------------

const SUM = /(\d+(?:\.\d+)?)\s*([+\-−–×x*/÷])\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)(\s*%)?/g;

/**
 * A line of the student's own working, "a op b = c", where a op b is not c.
 * Rounding and a ratio written as a percentage are not slips. Only a line
 * whose result the scheme does not accept is reported: a mistyped operand
 * beside a correct, credited value is not why a mark was lost.
 */
function sumThatDoesNotAddUp(input: AnswerGapInput): { line: string; correct: string } | null {
  const accepted = [...input.missedPoints, ...(input.creditedPoints ?? [])].flatMap(resultsOf);
  for (const match of input.answer.matchAll(SUM)) {
    const [line, left, operator, right, stated, percent] = match;
    // "0.80 × 2/3 = 0.533" is one chained sum, not "2/3 = 0.533": a line is
    // only read when nothing is being done to its first number.
    const before = input.answer.slice(0, match.index).trimEnd().slice(-1);
    if (before && /[+\-−–×x*/÷^(.,\d⁰¹²³⁴⁵⁶⁷⁸⁹√]/.test(before)) continue;
    const a = Number(left);
    const b = Number(right);
    const c = Number(stated);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    if (/[x]/.test(operator ?? "") && !/\d\s+x\s+\d/.test(line)) continue; // "2x3" may be algebra; "2 x 3" is a product
    const value = operator === "+" ? a + b : operator === "×" || operator === "x" || operator === "*" ? a * b : operator === "/" || operator === "÷" ? (b === 0 ? NaN : a / b) : a - b;
    if (!Number.isFinite(value)) continue;
    const agrees = (target: number) => target === c || (target !== 0 && c !== 0 && (sameToTwoSigFigs(target, c) || Math.abs(target - c) / Math.abs(target) < 0.02));
    if (agrees(value) || agrees(value * 100) || (percent && agrees(value * 100))) continue;
    if (accepted.some((result) => close(result.value, c))) continue;
    return { line: line.replace(/\s+/g, " ").trim(), correct: show(Number(value.toPrecision(4))) };
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

/**
 * Read one part's answer against the points it missed. Null when the part
 * lost nothing, was multiple choice, or there is nothing to read.
 */
export function detectAnswerGap(input: AnswerGapInput): AnswerGapDetection | null {
  if (input.isMcq || input.max <= 0 || input.awarded >= input.max) return null;
  const answer = input.answer ?? "";
  const missed = input.missedPoints.filter((point) => point.trim());
  const facts = { missed };

  if (saysNothing(answer)) {
    const blank = !answer.trim();
    return {
      kind: "not-attempted", certainty: "clear", repair: "learn", facts: { ...facts, blank },
      verdict: { category: "knowledge-gap", confidence: 0.9, reason: blank ? "nothing was written for this part" : "the answer only says it is not known" },
    };
  }

  for (const point of missed) {
    const contradiction = schemeContradiction(point, answer);
    if (contradiction) {
      return {
        kind: "opposite", certainty: "clear", repair: "learn", facts: { ...facts, contradiction },
        verdict: { category: "misconception", confidence: 0.8, reason: `the answer says “${contradiction.said}” where the scheme needs “${contradiction.needed}”` },
      };
    }
    const comparison = comparativeAgainstEquality(point, answer);
    if (comparison) {
      return {
        kind: "opposite", certainty: "likely", repair: "learn", facts: { ...facts, comparison },
        verdict: { category: "misconception", confidence: 0.72, reason: "the answer states an inequality where the scheme needs the two to be equal" },
      };
    }
  }

  const sum = sumThatDoesNotAddUp({ ...input, answer, missedPoints: missed });
  if (sum) {
    return {
      kind: "arithmetic", certainty: "clear", repair: "redo", facts: { ...facts, sum },
      verdict: { category: "calculation", confidence: 0.85, reason: `the working states “${sum.line}”, which comes to ${sum.correct}` },
    };
  }

  const numbers = readNumbers({ ...input, answer, missedPoints: missed });
  const quoted = numbers ? { ...facts, said: numbers.said, needed: numbers.needed } : facts;
  if (numbers?.kind === "inverted") {
    return {
      kind: "inverted", certainty: numbers.clear ? "clear" : "likely", repair: "example", facts: { ...quoted, written: numbers.clear },
      // Written out the wrong way round is evidence; a value that merely equals
      // the reciprocal is a reading, shown as likely but never stored as the cause.
      verdict: numbers.clear ? { category: "formula-selection", confidence: 0.85, reason: "the working divides the scheme's two quantities the other way round" } : null,
    };
  }
  if (numbers?.kind === "power-of-ten") {
    return {
      kind: "power-of-ten", certainty: "likely", repair: "redo", facts: quoted,
      verdict: { category: "unit-error", confidence: 0.75, reason: "the value differs from the scheme's by a power of ten" },
    };
  }

  if (saysUnsure(answer) && input.awarded === 0) {
    return {
      kind: "guessed", certainty: "likely", repair: "learn", facts,
      verdict: { category: "knowledge-gap", confidence: 0.75, reason: "the answer says it is a guess and earned nothing" },
    };
  }

  if (numbers?.kind === "working") return { kind: "working", certainty: "unsure", repair: "example", facts: quoted, verdict: null };
  if (numbers?.kind === "bare-number") return { kind: "bare-number", certainty: "unsure", repair: "example", facts: quoted, verdict: null };

  if (input.awarded > 0 && input.awarded / input.max >= 0.5 && missed.length) {
    return { kind: "incomplete", certainty: "likely", repair: "state-points", facts, verdict: null };
  }
  if (input.awarded > 0) return { kind: "partial", certainty: "unsure", repair: "example", facts, verdict: null };
  if ((answer.match(/[a-zα-ω0-9]+/gi) ?? []).length >= 3) return { kind: "off-target", certainty: "unsure", repair: "learn", facts, verdict: null };
  return null;
}
