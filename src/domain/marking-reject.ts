// ---------------------------------------------------------------------------
// Authored "do not accept" rules for the deterministic marker (twelfth pass,
// 2026-10-12).
//
// WJEC mark schemes say what NOT to accept beside many points ("do not accept
// osmosis", "reject 1/r"). Some wrong answers cannot be caught by any general
// check: swapped Type I/II definitions keep every word of both points, and
// "antipodal cells" is a wrong structure rather than an opposite word. An
// author can name those answers directly; this module applies the list.
//
// A rule guards one scheme point (MarkSchemeReject in types-questions.ts).
// It fires when the answer states one of its phrases, unless the phrase is
// negated ("not osmosis", "rather than 1/r") or an `except` phrase shows the
// answer states the point correctly. A rule only ever removes credit (or,
// on an AI mark, makes it contested); it can never award a mark.
//
// Pure: no React, no network, no storage.
// ---------------------------------------------------------------------------

import type { MarkSchemeReject, QuestionPart } from "./types-questions";

const GAP = "…";
/** How many words "…" may skip. */
const MAX_GAP = 6;
/** "fail to …" negates what follows; "it fails when …" does not. */
const FAIL_WORDS = new Set(["fail", "fails", "failing", "failed"]);

function negatorAt(run: Token[], index: number): boolean {
  const word = run[index]?.word ?? "";
  return NEGATORS.has(word) || (FAIL_WORDS.has(word) && run[index + 1]?.word === "to");
}

/** Words before a phrase that turn it into a contrast. */
const LOOKBACK = 3;

const NEGATORS = new Set([
  "not", "no", "never", "nor", "neither", "without", "rather", "instead", "unlike",
  "cannot", "cant", "isnt", "arent", "doesnt", "dont",
  "didnt", "wasnt", "werent", "wont", "hasnt", "havent", "shouldnt", "couldnt", "wouldnt",
]);

const DIGIT_MARKS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "ₙ": "n", "ₓ": "x", "ⁿ": "n",
};

interface Token {
  word: string;
  start: number;
  end: number;
}

function normalise(text: string): string {
  // Character by character, so every position still points into the
  // learner's own text and a match can be quoted back exactly.
  return [...(text ?? "")]
    .map((c) => {
      const n = c.normalize("NFKC");
      return n.length === c.length ? n : c;
    })
    .join("")
    .replace(/[₀-₉⁰-⁹¹²³ₙₓⁿ]/g, (c) => DIGIT_MARKS[c] ?? c)
    .toLowerCase()
    .replace(/[’']/g, "'")
    // f'(x) typed with an apostrophe is the derivative, as f′(x) is.
    .replace(/(?<=\p{L})'(?=\()/gu, "′")
    // "one cell thick" is the textbook way of saying thin (as in marking-contradiction.ts).
    .replace(/\b(?:one|single)([\s-]+)cells?([\s-]+)thick\b/g, (m) => m.replace(/thick$/, "thin "))
    // Length-preserving, so a match can be quoted back from the learner's text.
    .replace(/n't\b/g, "nt ");
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  // Letters, digits and the prime (f′ is not f). A decimal point separates
  // tokens, so "0.05" is the pair 0, 05 on both sides.
  const re = /[\p{L}\p{N}′]+/gu;
  for (const m of normalise(text).matchAll(re)) {
    out.push({ word: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

type PhraseStep = { word: string } | { gap: true };

function compile(phrase: string): PhraseStep[] {
  const steps: PhraseStep[] = [];
  for (const piece of phrase.replace(/\.\.\./g, GAP).split(GAP)) {
    if (steps.length) steps.push({ gap: true });
    for (const t of tokens(piece)) steps.push({ word: t.word });
  }
  // A gap at either end means nothing.
  while (steps.length && "gap" in steps[0]!) steps.shift();
  while (steps.length && "gap" in steps[steps.length - 1]!) steps.pop();
  return steps;
}

function wordMatches(wanted: string, given: string): boolean {
  if (wanted === given) return true;
  // Four or more letters: the authored stem also covers its longer forms.
  return wanted.length >= 4 && given.startsWith(wanted);
}

interface PhraseHit {
  start: number;
  end: number;
  negated: boolean;
}

/** Every place the phrase occurs in the token run, with whether it is negated. */
function phraseHits(steps: PhraseStep[], run: Token[]): PhraseHit[] {
  const hits: PhraseHit[] = [];
  if (!steps.length) return hits;
  const walk = (stepIndex: number, at: number, gapNegated: boolean, first: number): void => {
    if (stepIndex === steps.length) {
      let before = false;
      for (let k = Math.max(0, first - LOOKBACK); k < first; k++) before ||= negatorAt(run, k);
      hits.push({ start: run[first]!.start, end: run[at - 1]!.end, negated: before || gapNegated });
      return;
    }
    const step = steps[stepIndex]!;
    if ("gap" in step) {
      const next = steps[stepIndex + 1] as { word: string };
      for (let skip = 0; skip <= MAX_GAP && at + skip < run.length; skip++) {
        if (wordMatches(next.word, run[at + skip]!.word)) {
          let skipped = false;
          for (let k = at; k < at + skip; k++) skipped ||= negatorAt(run, k);
          walk(stepIndex + 2, at + skip + 1, gapNegated || skipped, first);
        }
      }
      return;
    }
    if (at < run.length && wordMatches(step.word, run[at]!.word)) walk(stepIndex + 1, at + 1, gapNegated, first);
  };
  const head = steps[0] as { word: string };
  for (let i = 0; i < run.length; i++) if (wordMatches(head.word, run[i]!.word)) walk(1, i + 1, false, i);
  return hits;
}

/** Clause-sized pieces for matching: sentences, semicolons, commas and joining words. */
function clauseRuns(answer: string): Token[][] {
  const text = normalise(answer);
  const all = tokens(answer);
  const boundaries: number[] = [];
  for (const m of text.matchAll(/[.;!?\n](?:\s|$)|,\s|\s(?:and|but|whereas|while|although|however|then)\s/g)) {
    boundaries.push(m.index ?? 0);
  }
  const runs: Token[][] = [];
  let current: Token[] = [];
  let b = 0;
  for (const t of all) {
    while (b < boundaries.length && boundaries[b]! < t.start) {
      if (current.length) runs.push(current);
      current = [];
      b++;
    }
    current.push(t);
  }
  if (current.length) runs.push(current);
  return runs;
}

export interface RejectedStatement {
  /** The words of the answer the rule matched (from the learner's text). */
  said: string;
  /** The rule's learner-facing reason. */
  reason: string;
  /** True when the phrase was there only as a contrast (negated): never vetoes, may contest. */
  contrastOnly: boolean;
}

function originalSlice(answer: string, start: number, end: number): string {
  return (answer ?? "").slice(start, end).trim();
}

/** Whether one rule fires on an answer. */
export function ruleHit(rule: MarkSchemeReject, answer: string): RejectedStatement | null {
  const text = (answer ?? "").trim();
  if (!text) return null;
  const whole = tokens(text);
  if ((rule.except ?? []).some((phrase) => phraseHits(compile(phrase), whole).some((h) => !h.negated))) return null;
  const runs = rule.scope === "answer" ? [whole] : clauseRuns(text);
  let contrast: RejectedStatement | null = null;
  for (const phrase of rule.phrases) {
    const steps = compile(phrase);
    for (const run of runs) {
      for (const hit of phraseHits(steps, run)) {
        const statement = { said: originalSlice(text, hit.start, hit.end), reason: rule.reason, contrastOnly: hit.negated };
        if (!hit.negated) return statement;
        contrast ??= statement;
      }
    }
  }
  return contrast;
}

/**
 * The first authored "do not accept" statement the answer makes against the
 * scheme point at `pointIndex`, or null. A statement found only as a contrast
 * is returned with `contrastOnly: true` (it never vetoes).
 */
export function rejectedStatement(
  part: Pick<QuestionPart, "rejects">,
  pointIndex: number,
  answer: string,
): RejectedStatement | null {
  let contrast: RejectedStatement | null = null;
  for (const rule of part.rejects ?? []) {
    if (rule.point !== pointIndex) continue;
    const hit = ruleHit(rule, answer);
    if (hit && !hit.contrastOnly) return hit;
    contrast ??= hit;
  }
  return contrast;
}

/** Learner-facing sentence for a rejected statement. */
export function rejectExplanation(statement: RejectedStatement): string {
  return `Not awarded: the mark scheme does not accept “${statement.said}” for this point. ${statement.reason}`;
}

/**
 * The scheme's own "do not accept" lines for one point, as examiner notes
 * under it. Authored content, like the points themselves; the student's
 * answer stays inside its untrusted fence.
 */
export function doNotAcceptLines(rejects: QuestionPart["rejects"], pointIndex: number): string {
  const rules = (rejects ?? []).filter((rule) => rule.point === pointIndex);
  if (!rules.length) return "";
  return rules
    .map((rule) => `\n      Do not accept: ${rule.phrases.map((p) => `"${p.replace(/["\n\r]/g, " ")}"`).join(", ")} — ${rule.reason.replace(/[\n\r]/g, " ")}`)
    .join("");
}
