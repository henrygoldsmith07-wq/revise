// ---------------------------------------------------------------------------
// Adversarial answer variants — generators + shared plumbing for the
// adversarial marking benchmark (orchestration in marking-adversarial.ts).
//
// Deterministic generators for the failure modes examiners see: fluent
// nonsense, keyword salad, contradictions, ambiguous handwriting, alternative
// methods/phrasings, shorthand, bullets, rambling, mixed claims, flawed
// working, units, significant figures and scientific notation.
//
// Every transform is pure: same input, same output, always.
// ---------------------------------------------------------------------------

import { markMcq, markQuestion } from "./marking";
import type { Id, Question } from "./types";

// --- shared benchmark plumbing ----------------------------------------------

export type Marker = (question: Question, answers: Record<Id, string>) => { awarded: number; max: number };

export const defaultMarker: Marker = (question, answers) => {
  if (question.kind === "mcq") {
    const raw = Object.values(answers)[0];
    const index = raw != null && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : -1;
    const marked = markMcq(question, index);
    return { awarded: marked.awarded, max: marked.max };
  }
  const result = markQuestion(question, answers);
  return { awarded: result.awarded, max: result.max };
};

export interface AdversarialCategoryReport {
  id: string;
  label: string;
  /** The fence this category enforces, in plain English. */
  expectation: string;
  cases: number;
  passed: number;
  failed: number;
  passRate: number;
  /** Mean awarded/max across cases, 0–1. Reported, not fenced, unless noted. */
  meanShareOfMax: number;
  /** Optional reference mean (e.g. the clean answers' share) for parity checks. */
  comparisonMean?: number;
  failures: Array<{ questionId: Id; detail: string }>;
}

/** Deterministic case budget: every category samples the same first K questions. */
export const MAX_CASES_PER_CATEGORY = 48;

export function answerFor(question: Question, partId: Id, text: string): Record<Id, string> {
  return { [partId]: text };
}

type CaseResult = { questionId: Id; ok: boolean; detail: string; share: number };

export function finish(
  id: string,
  label: string,
  expectation: string,
  results: CaseResult[],
): AdversarialCategoryReport {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const meanShare = results.length ? results.reduce((a, r) => a + r.share, 0) / results.length : 0;
  return {
    id,
    label,
    expectation,
    cases: results.length,
    passed,
    failed,
    passRate: results.length ? Math.round((passed / results.length) * 1000) / 1000 : 1,
    meanShareOfMax: Math.round(meanShare * 1000) / 1000,
    failures: results.filter((r) => !r.ok).map((r) => ({ questionId: r.questionId, detail: r.detail })),
  };
}

/** Clean-score helper: mark the model answer itself for comparison fences.
 *  Memoised per question — every category compares against the same clean mark,
 *  and the marker is pure, so one computation serves the whole report. */
const cleanCache = new WeakMap<Question, CleanScore>();
export function cleanScore(question: Question, marker: Marker): CleanScore {
  const cached = cleanCache.get(question);
  if (cached) return cached;
  const score = marker(question, answerFor(question, question.parts[0].id, question.parts[0].modelAnswer));
  cleanCache.set(question, score);
  return score;
}

export interface CleanScore {
  awarded: number;
  max: number;
}

/** Window fence helper: within one mark of clean, and never above it. */
export function withinOneOfClean(awarded: number, clean: CleanScore): boolean {
  return awarded <= clean.awarded && awarded >= clean.awarded - 1 && (clean.awarded === 0 || awarded * 2 >= clean.awarded);
}

// --- prose transforms -------------------------------------------------------

const NONSENSE_SENTENCES = [
  "The fundamental principle underlying this phenomenon reflects broader structural considerations across the discipline as a whole.",
  "It is widely recognised that these processes interact dynamically within their wider conceptual framework.",
  "Ultimately, the significance of this observation extends well beyond its immediate context in important ways.",
];

/** Fluent prose that cannot contain any mark-scheme keyword. */
export function fluentNonsense(): string {
  return NONSENSE_SENTENCES.join(" ");
}

/** All the scheme's wording, grammatically flattened — form without content. */
export function stuffKeywords(markScheme: string[]): string {
  return [...markScheme, ...markScheme].join(", ").replace(/\.$/, "") + ", and so on.";
}

/** The correct answer followed by an explicit retraction. */
export function contradict(modelAnswer: string): string {
  return `${modelAnswer} However, in the final analysis the opposite holds true and the initial statement is reversed.`;
}

/** A leading slice of the scheme points — genuinely partial content. */
export function partialAnswer(markScheme: string[]): string {
  const keep = Math.max(1, Math.floor(markScheme.length / 2));
  return markScheme.slice(0, keep).join(". ") + ".";
}

/** Inject one transposition into every third word of length >= 5. */
export function addSpellingNoise(text: string): string {
  const words = text.split(/(\s+)/);
  let contentIndex = -1;
  return words
    .map((word) => {
      if (/^\s+$/.test(word) || word.length < 5 || !/[a-z]/i.test(word)) return word;
      contentIndex++;
      if (contentIndex % 3 !== 0) return word;
      const cut = Math.floor(word.length / 2);
      const mid = word.slice(cut - 1, cut + 1);
      return word.slice(0, cut - 1) + mid[1] + mid[0] + word.slice(cut + 1);
    })
    .join("");
}

/** Decimal → fraction ("0.75" → "3/4"), only for clean two-decimal values. */
export function decimalToFraction(text: string): string | null {
  const match = text.match(/-?\d\.\d\d?(?!\d)/);
  if (!match) return null;
  const value = Number(match[0]);
  const scale = match[0].split(".")[1].length;
  const denominator = 10 ** scale;
  const numerator = Math.round(value * denominator);
  let a = numerator;
  let b = denominator;
  while (b) {
    [a, b] = [b, a % b];
  }
  const gcd = Math.abs(a) || 1;
  return text.replace(match[0], `${numerator / gcd}/${denominator / gcd}`);
}

// --- polarity / phrasing ------------------------------------------------------

/**
 * Swap causal/directional words — right vocabulary, reversed reasoning.
 * Two-pass placeholders stop higher↔lower and increase↔decrease double-swapping.
 */
export function flipPolarity(text: string): { text: string; changed: boolean } {
  const out = text
    .replace(/\bincreases?\b/gi, "__FLIP_A__")
    .replace(/\bdecreases?\b/gi, "increases")
    .replace(/__FLIP_A__/g, "decreases")
    .replace(/\bhigher\b/gi, "__FLIP_B__")
    .replace(/\blower\b/gi, "higher")
    .replace(/__FLIP_B__/g, "lower")
    .replace(/\bgains?\b/gi, "__FLIP_C__")
    .replace(/\bloses\b/gi, "gains")
    .replace(/__FLIP_C__/g, "loses");
  const changed = out !== text;
  return { text: out, changed };
}

/** Rhetorical synonyms only — never swaps domain nouns. */
const PHRASE_SYNONYMS: Array<[RegExp, string]> = [
  [/\bbecause\b/gi, "as"],
  [/\btherefore\b/gi, "so"],
  [/\bhowever\b/gi, "but"],
  [/\bshows\b/gi, "indicates"],
  [/\blarge\b/gi, "big"],
  [/\bsmall\b/gi, "little"],
  [/\bincrease\b/gi, "rise"],
  [/\bdecrease\b/gi, "fall"],
  [/\buses\b/gi, "applies"],
];

export function unusualPhrasing(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PHRASE_SYNONYMS) out = out.replace(pattern, replacement);
  return out;
}

/** Telegraphic note form: abbreviations, arrows, no punctuation flourish. */
export function studentShorthand(text: string): string {
  return text
    .replace(/\bincreases?\b/gi, "inc")
    .replace(/\bdecreases?\b/gi, "dec")
    .replace(/\bbecause\b/gi, "as")
    .replace(/\bleads to\b/gi, "->")
    .replace(/\btherefore\b/gi, "->")
    .replace(/\bcauses\b/gi, "->")
    .replace(/\band\b/gi, "+")
    .replace(/[.,;:"']/g, "")
    .toLowerCase();
}

export function stripGrammarWords(text: string): string {
  return text.replace(/\b(the|a|an)\s+/gi, "");
}

export function toBulletPoints(text: string): string {
  // Split on sentence ends only — decimal points inside numbers survive.
  const clauses = text
    .split(/\.\s+|\s+and\s+|\s+then\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return clauses.map((clause) => `- ${clause}`).join("\n");
}

const RAMBLING_FILLER = [
  "In any case it is worth noting something about how situations like this one generally tend to unfold.",
  "Speaking broadly, there is quite a lot that could be said about matters of this general kind.",
];

/** Repeat each sentence with neutral filler between — volume without content. */
export function rambling(text: string): string {
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  const out: string[] = [];
  sentences.forEach((sentence, i) => {
    out.push(sentence);
    out.push(RAMBLING_FILLER[i % RAMBLING_FILLER.length]);
    out.push(sentence);
  });
  return out.join(" ");
}

/** Reverse the order of statements — same tokens, different route. */
export function reorderStatements(text: string): string {
  const fragments = text.split(/(?<=\.)\s+/).filter(Boolean);
  return fragments.length > 1 ? fragments.reverse().join(" ") : text;
}

/** OCR-style ambiguity: confusable hits on every fourth long word. */
export function ambiguousTranscription(text: string): string {
  const words = text.split(/(\s+)/);
  let contentIndex = -1;
  const garbled = words
    .map((word) => {
      if (/^\s+$/.test(word) || word.length < 5 || !/[a-z]/i.test(word)) return word;
      contentIndex++;
      if (contentIndex % 4 !== 0) return word;
      return word.includes("m") ? word.replace(/m/, "rn") : word.replace(/n$/, "?");
    })
    .join("");
  return `${garbled} (some handwriting unreadable)`;
}

/** Scheme keywords chained with bogus causality in reverse order. */
export function keywordSalad(markScheme: string[]): string {
  return [...markScheme].reverse().join(", which causes ") + ", therefore the overall effect reverses.";
}

// --- numeric transforms -----------------------------------------------------

export function hasDecimal(text: string): boolean {
  return /-?\d+\.\d+/.test(text);
}

interface NumberHit {
  raw: string;
  start: number;
  end: number;
  value: number;
  decimals: number;
}

function lastNumber(text: string): NumberHit | null {
  const matches = [...text.matchAll(/-?\d+(?:\.\d+)?/g)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const value = Number(last[0]);
  if (!Number.isFinite(value)) return null;
  const decimals = last[0].includes(".") ? last[0].split(".")[1].length : 0;
  return { raw: last[0], start: last.index!, end: last.index! + last[0].length, value, decimals };
}

/** Perturb the final numeric result by ~10% — valid route, wrong destination. */
export function wrongFinalValue(text: string): { text: string; changed: boolean } {
  const hit = lastNumber(text);
  if (!hit) return { text, changed: false };
  const perturbed = Number((hit.value * 1.1).toFixed(Math.min(hit.decimals, 3)));
  if (!Number.isFinite(perturbed) || perturbed === hit.value) return { text, changed: false };
  return { text: text.slice(0, hit.start) + String(perturbed) + text.slice(hit.end), changed: true };
}

const UNIT_SWAPS: Array<[RegExp, string]> = [
  [/\bkJ\b/, "MJ"],
  [/\bJ\b/, "kJ"],
  [/\bN\b/, "kN"],
  [/cm³/, "m³"],
  [/dm³/, "cm³"],
  [/°C/, "°F"],
  [/\bs\b(?!\w)/, "ms"],
  [/\bmol\b/, "mmol"],
];

export function breakUnits(text: string): { text: string; changed: boolean } {
  for (const [pattern, replacement] of UNIT_SWAPS) {
    if (pattern.test(text)) return { text: text.replace(pattern, replacement), changed: true };
  }
  // No recognisable unit: attach a nonsensical one to the final number.
  const hit = lastNumber(text);
  if (!hit) return { text, changed: false };
  return { text: `${text.slice(0, hit.end)} furlongs${text.slice(hit.end)}`, changed: true };
}

/** Collapse every decimal to one significant figure. */
export function wreckSignificantFigures(text: string): { text: string; changed: boolean } {
  let changed = false;
  const out = text.replace(/-?\d+\.\d+/g, (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return raw;
    const oneSigFig = Number(value.toPrecision(1));
    if (Number(oneSigFig.toFixed(10)) === Number(Number(raw).toFixed(10))) return raw;
    changed = true;
    return String(oneSigFig);
  });
  return { text: out, changed };
}

/** Decimal → scientific notation ("35.5" → "3.55 × 10^1"). */
export function toScientificNotation(text: string): { text: string; changed: boolean } {
  let changed = false;
  const out = text.replace(/-?\d+\.\d+/g, (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return raw;
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    if (exponent === 0) return raw;
    const mantissa = value / 10 ** exponent;
    changed = true;
    return `${Number(mantissa.toFixed(4))} × 10^${exponent}`;
  });
  return { text: out, changed };
}
