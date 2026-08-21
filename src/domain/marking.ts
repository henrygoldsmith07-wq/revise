import { symbolicMatch } from "./maths-equivalence";
import type { MarkEvidence, MarkedPart, Question, QuestionPart } from "./types";

// ---------------------------------------------------------------------------
// Offline marking. This is the floor the product stands on: when no AI
// provider is configured, or the network is gone, or the model call fails,
// answers are still marked — deterministically, against the same mark scheme
// an examiner would use. It is keyword/lemma overlap rather than
// comprehension, so it is generous about wording and strict about content,
// and the UI always labels rubric-marked work as such.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or", "for", "on",
  "at", "by", "with", "as", "that", "this", "it", "its", "be", "from", "will", "can", "has",
  "have", "had", "not", "but", "so", "if", "then", "than", "when", "which", "there", "any",
  "more", "less", "also", "into", "each", "their", "they", "you", "your", "we", "one", "two",
]);

/** Cheap stemmer: enough to make "oxidised"/"oxidise"/"oxidation" agree. */
function stem(word: string): string {
  let w = word;
  for (const suffix of ["ations", "ation", "ising", "izing", "ised", "ized", "ise", "ize", "ing", "ies", "es", "ed", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+\-.^/=²³ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .map(stem),
  );
}

/** 0–1 overlap of a mark-scheme point's content words with the answer. */
export function pointCoverage(point: string, answer: string): number {
  const wanted = [...tokenise(point)];
  if (!wanted.length) return 0;
  const given = tokenise(answer);
  const hits = wanted.filter((w) => given.has(w)).length;
  return hits / wanted.length;
}

/** Normalise a numeric string: strip thousands separators and keep a single canonical decimal form. */
function parseScalar(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Extract every number-like token from free text, including fractions and simple exponents. */
function extractNumbers(text: string): Array<{ raw: string; value: number | null; denom?: number }> {
  const out: Array<{ raw: string; value: number | null; denom?: number }> = [];
  // Fractions first so 1/2 is not read as two scalars.
  for (const m of text.matchAll(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*\/\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)/g)) {
    const num = parseScalar(m[1]);
    const den = parseScalar(m[2]);
    const val = num != null && den != null && den !== 0 ? num / den : null;
    out.push({ raw: m[0], value: val });
  }
  // Remaining scalars (skip those already consumed inside a fraction)
  const fractionSpans = [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?\s*\/\s*-?\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m)=> [m.index!, m[0].length] as const);
  const isInsideFraction = (i: number) => fractionSpans.some(([s,l])=> i >= s && i < s + l);
  for (const m of text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    if (isInsideFraction(m.index!)) continue;
    out.push({ raw: m[0], value: parseScalar(m[0]) });
  }
  // Powers written as 2^3 or 2²/³ — normalise to numeric exponent where possible
  for (const m of text.matchAll(/(\d+)\s*\^\s*(-?\d+(?:\.\d+)?)/g)) {
    const base = parseScalar(m[1]); const exp = parseScalar(m[2]);
    if (base != null && exp != null) out.push({ raw: m[0], value: Math.pow(base, exp) });
  }
  return out;
}

/** Tolerance for numeric equivalence: absolute for |expected|<1, relative otherwise. */
function numbersClose(a: number, b: number, relEps = 0.01, absEps = 0.005): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= Math.max(absEps, relEps * scale);
}

/** True when the answer contains a number equivalent to any number in the mark scheme. */
function numericMatch(point: string, answer: string): boolean {
  const wanted = extractNumbers(point.replace(/[−–—]/g, "-"));
  if (!wanted.length) return false;
  const given = extractNumbers(answer.replace(/[−–—]/g, "-"));
  if (!given.length) return false;
  // Also accept unicode fractions like ½ ¼ ¾
  const unicodeFrac: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1/3, "⅔": 2/3 };
  for (const ch of Object.keys(unicodeFrac)) if (answer.includes(ch)) given.push({ raw: ch, value: unicodeFrac[ch] });
  for (const ch of Object.keys(unicodeFrac)) if (point.includes(ch)) wanted.push({ raw: ch, value: unicodeFrac[ch] });
  for (const w of wanted) {
    if (w.value == null) continue;
    for (const g of given) {
      if (g.value == null) continue;
      if (numbersClose(w.value, g.value)) return true;
      // Exact raw string match as a fallback (covers trailing zeros, etc.)
      if (w.raw === g.raw) return true;
    }
  }
  return false;
}

export function numericEquivalent(expected: string, actual: string, eps = 0.01): boolean {
  return numericMatch(expected, actual);
}

const CREDIT_THRESHOLD = 0.5;

export interface PartialCreditCalibration {
  /** Per-point threshold override keyed by scheme point text (lower = more generous). */
  thresholds?: Record<string, number>;
  /** When true, require both keyword coverage and numeric match for calculation points. */
  strictNumericPoints?: boolean;
}

/** Evaluate whether a mark-scheme point looks like a calculation/numeric point. */
export function isNumericPoint(point: string): boolean {
  if (!/\d/.test(point)) return false;
  return (
    /\b(answer|calculate|value|concentration|mol|kJ)\b/i.test(point) ||
    /\d\s*(?:J|Pa|N)\b/i.test(point) ||
    /\bm\s*s(?:[-^]?\d+)?\b/i.test(point)
  );
}

export function perPointThreshold(point: string, calibration?: PartialCreditCalibration): number {
  if (calibration?.thresholds?.[point] != null) return calibration.thresholds[point]!;
  if (isNumericPoint(point)) return 0.45;
  return CREDIT_THRESHOLD;
}

const EVIDENCE_EXCERPT_LIMIT = 240;

function answerFragments(answer: string): string[] {
  return (answer ?? "")
    .split(/\r?\n|=>|;|[!?]\s+|\.\s+(?=[A-Z])/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
}

function evidenceScore(point: string, answer: string): number {
  const symbolic = symbolicMatch(answer, point);
  if (symbolic === "equivalent") return 1;
  if (symbolic === "not-equivalent") return 0;
  return Math.max(pointCoverage(point, answer), numericEquivalent(point, answer) ? 0.9 : 0);
}

interface EvidenceMatch {
  text: string | null;
  score: number;
}

function bestEvidence(point: string, answer: string): EvidenceMatch {
  const candidates = answerFragments(answer);
  if (answer.trim() && !candidates.includes(answer.trim())) candidates.push(answer.trim());
  return candidates.reduce<EvidenceMatch>(
    (best, fragment) => {
      const score = evidenceScore(point, fragment);
      return score > best.score ? { text: fragment, score } : best;
    },
    { text: null, score: 0 },
  );
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > EVIDENCE_EXCERPT_LIMIT ? `${clean.slice(0, EVIDENCE_EXCERPT_LIMIT - 1)}…` : clean;
}

function evidenceStrength(point: string, match: EvidenceMatch): MarkEvidence["evidenceStrength"] {
  if (!match.text || match.score <= 0) return "none";
  return match.score >= perPointThreshold(point) ? "strong" : "partial";
}

function explanationFor(
  status: MarkEvidence["status"],
  evidence: string | null,
  strength: MarkEvidence["evidenceStrength"],
): string {
  const quote = evidence ? `“${evidence}”` : null;
  if (status === "credited") {
    if (strength === "strong" && quote) return `Awarded: your answer includes ${quote}, which covers this point.`;
    if (quote) return `Awarded, but the supporting wording is only partial: ${quote}. Review this mark if needed.`;
    return "Awarded, but no clear supporting excerpt was found in the submitted answer; review this mark.";
  }
  if (status === "missed") {
    if (strength === "strong" && quote) return `Not awarded even though the answer contains strong matching evidence: ${quote}. Review the marking.`;
    if (quote) return `Not awarded: the answer mentions ${quote}, but it does not cover the full point.`;
    return "Not awarded: No matching evidence for this point appears in your answer.";
  }
  if (quote) return `The marking result did not report a decision for this point. The strongest matching evidence is ${quote}.`;
  return "The marking result did not report a decision for this point, and no matching evidence was found.";
}

/** Build a deterministic explanation for every point reported by a marker. */
export function evidenceForMarkedPart(
  part: QuestionPart,
  answer: string,
  marked: Pick<MarkedPart, "creditedPoints" | "missedPoints">,
): MarkEvidence[] {
  const credited = new Set(marked.creditedPoints);
  const missed = new Set(marked.missedPoints);
  const points = [...new Set([...part.markScheme, ...marked.creditedPoints, ...marked.missedPoints])].filter(Boolean);

  return points.map((point) => {
    const status: MarkEvidence["status"] = credited.has(point)
      ? "credited"
      : missed.has(point)
        ? "missed"
        : "unreported";
    const match = bestEvidence(point, answer);
    const strength = evidenceStrength(point, match);
    const supportingEvidence = excerpt(match.text);
    return {
      point,
      status,
      evidence: supportingEvidence,
      evidenceStrength: strength,
      confidence: Math.round(match.score * 100) / 100,
      explanation: explanationFor(status, supportingEvidence, strength),
    };
  });
}

/** Add deterministic answer evidence to rubric or AI marking output. */
export function withMarkEvidence<T extends { marked: MarkedPart[] }>(
  question: Question,
  answers: Record<string, string>,
  result: T,
): T {
  if (question.kind === "mcq") return result;
  return {
    ...result,
    marked: result.marked.map((marked) => {
      const part = question.parts.find((candidate) => candidate.id === marked.partId);
      return part
        ? { ...marked, evidence: evidenceForMarkedPart(part, answers[part.id] ?? "", marked) }
        : marked;
    }),
  } as T;
}

export function markPart(part: QuestionPart, answer: string, calibration?: PartialCreditCalibration): MarkedPart {
  const trimmed = (answer ?? "").trim();
  const credited: string[] = [];
  const missed: string[] = [];

  for (const point of part.markScheme) {
    const thresh = perPointThreshold(point, calibration);
    const cov = pointCoverage(point, trimmed);
    const num = numericMatch(point, trimmed);
    // Symbolic layer: when both the point and the answer contain a parseable
    // algebra expression, accept equivalent forms (`(x+2)(x-3)` for `x^2 - x - 6`)
    // and reject a pure expression that differs, even if a stray digit matches.
    // Unknown (unparseable/prose) never hurts: it falls through to the rubric.
    const sym = symbolicMatch(trimmed, point);
    const numeric = isNumericPoint(point);
    const strict = Boolean(calibration?.strictNumericPoints && numeric);
    const ok =
      sym === "equivalent"
        ? true
        : sym === "not-equivalent"
          ? false
          : strict
            ? (num && cov >= thresh)
            : numeric
              ? (num || cov >= thresh)
              : (cov >= thresh || num);
    (ok ? credited : missed).push(point);
  }

  // Mark-scheme points map onto marks proportionally: a 3-mark part with 4
  // points still awards out of 3.
  const ratio = part.markScheme.length ? credited.length / part.markScheme.length : 0;
  let awarded = Math.round(ratio * part.marks);
  if (!trimmed) awarded = 0;
  // An answer that says almost nothing cannot score full marks however many
  // keywords it happens to contain.
  if (trimmed.split(/\s+/).length < 3 && part.marks > 1) awarded = Math.min(awarded, 1);

  const marked: MarkedPart = {
    partId: part.id,
    awarded,
    max: part.marks,
    creditedPoints: credited,
    missedPoints: missed,
    comment: buildComment(awarded, part.marks, missed),
  };
  return { ...marked, evidence: evidenceForMarkedPart(part, trimmed, marked) };
}

function buildComment(awarded: number, max: number, missed: string[]): string {
  if (!missed.length) return "Full marks — every mark-scheme point is there.";
  if (awarded === 0) return `No marks yet. The scheme wants: ${missed.slice(0, 2).join("; ")}.`;
  return `${awarded}/${max}. Still missing: ${missed.slice(0, 2).join("; ")}.`;
}

export function markMcq(question: Question, chosenIndex: number): MarkedPart {
  const part = question.parts[0];
  const correct = chosenIndex === question.correctIndex;
  const point = part?.markScheme[0] ?? "Correct option";
  const selected = question.options?.[chosenIndex];
  const selectedLabel = chosenIndex < 0
    ? "no option"
    : `${String.fromCharCode(65 + chosenIndex)}${selected ? `: ${selected}` : ""}`;
  return {
    partId: part?.id ?? question.id,
    awarded: correct ? question.totalMarks : 0,
    max: question.totalMarks,
    creditedPoints: correct ? [point] : [],
    missedPoints: correct ? [] : [point],
    comment: correct
      ? "Correct."
      : `Not this one — the answer is ${String.fromCharCode(65 + (question.correctIndex ?? 0))}.`,
    evidence: [{
      point,
      status: correct ? "credited" : "missed",
      evidence: `Selected option ${selectedLabel}`,
      evidenceStrength: correct ? "strong" : "none",
      confidence: 1,
      explanation: correct
        ? `Awarded: you selected option ${selectedLabel}, the keyed answer.`
        : `Not awarded: you selected option ${selectedLabel}; the keyed answer is option ${String.fromCharCode(65 + (question.correctIndex ?? 0))}.`,
    }],
  };
}

export interface RubricResult {
  marked: MarkedPart[];
  awarded: number;
  max: number;
  feedback: string;
}

export function markQuestion(question: Question, answers: Record<string, string>, calibration?: PartialCreditCalibration): RubricResult {
  const marked =
    question.kind === "mcq"
      ? [markMcq(question, Number(answers[question.parts[0]?.id ?? question.id] ?? -1))]
      : question.parts.map((part) => markPart(part, answers[part.id] ?? "", calibration));

  const awarded = marked.reduce((a, m) => a + m.awarded, 0);
  const max = marked.reduce((a, m) => a + m.max, 0);
  return withMarkEvidence(question, answers, { marked, awarded, max, feedback: examinerSummary(awarded, max, marked) });
}

/** Examiner-voice summary: what was earned, what was dropped, what to do. */
export function examinerSummary(awarded: number, max: number, marked: MarkedPart[]): string {
  const pct = max ? awarded / max : 0;
  const missed = marked.flatMap((m) => m.missedPoints);
  const opening =
    pct === 1
      ? "A complete answer — this would score full marks."
      : pct >= 0.6
        ? "A sound answer that drops marks on detail rather than understanding."
        : pct > 0
          ? "Partly there, but the response is not yet earning most of the available marks."
          : "This response does not yet address what the question is asking for.";

  const detail = missed.length
    ? ` The scheme still wants: ${missed.slice(0, 3).map((m) => `"${m}"`).join(", ")}.`
    : "";
  const advice = missed.length
    ? " Write the missing points explicitly — examiners award the statement, not the implication."
    : " Keep this structure under timed conditions.";

  return `${awarded}/${max}. ${opening}${detail}${advice}`;
}
