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

/** Bounded edit-distance test (optimal string alignment): true when a and b differ by at most `maxEdits` insertions, deletions, substitutions or adjacent transpositions. */
function withinEditDistance(a: string, b: string, maxEdits: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxEdits) return false;
  const small = a.length <= b.length ? a : b;
  const large = a.length <= b.length ? b : a;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: small.length + 1 }, (_, i) => i);
  for (let i = 1; i <= large.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= small.length; j++) {
      const substitution = prev[j - 1] + (large[i - 1] === small[j - 1] ? 0 : 1);
      let best = Math.min(prev[j] + 1, cur[j - 1] + 1, substitution);
      // Adjacent transposition counts as a single edit.
      if (i > 1 && j > 1 && large[i - 1] === small[j - 2] && large[i - 2] === small[j - 1]) {
        best = Math.min(best, (prev2 ? prev2[j - 2] : Number.POSITIVE_INFINITY) + 1);
      }
      cur[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > maxEdits) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[small.length] <= maxEdits;
}

/**
 * 0–1 overlap of a mark-scheme point's content words with the answer.
 * Tokens match under bounded edit distance: one edit from five characters,
 * two edits from eight — enough to absorb handwriting noise without
 * confusing genuinely different words. The two-edit path also requires a
 * shared three-character prefix so sibling scheme points that happen to
 * sound alike are not credited by each other.
 */
export function pointCoverage(point: string, answer: string): number {
  const wanted = [...tokenise(point)];
  if (!wanted.length) return 0;
  const given = [...tokenise(answer)];
  const exact = new Set(given);
  const hits = wanted.filter((w) => {
    if (exact.has(w)) return true;
    if (w.length >= 8 && given.some((g) => g.length >= 8 && g.slice(0, 3) === w.slice(0, 3) && withinEditDistance(g, w, 2))) {
      return true;
    }
    return w.length >= 5 && given.some((g) => g.length >= 5 && withinEditDistance(g, w, 1));
  }).length;
  return hits / wanted.length;
}

/** Normalise a numeric string: strip thousands separators and keep a single canonical decimal form. */
function parseScalar(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Extract every number-like token from free text, including fractions, simple exponents and scientific notation. */
function extractNumbers(input: string): Array<{ raw: string; value: number | null; denom?: number }> {
  // Normalise unicode super/subscripts so "×10⁻³" reads as "x10-3".
  const SUPERS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  const text = input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻₀-₉]/g, (ch) => SUPERS[ch] ?? ch);
  const out: Array<{ raw: string; value: number | null; denom?: number }> = [];
  // Fractions first so 1/2 is not read as two scalars.
  for (const m of text.matchAll(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*\/\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)/g)) {
    const num = parseScalar(m[1]);
    const den = parseScalar(m[2]);
    const val = num != null && den != null && den !== 0 ? num / den : null;
    out.push({ raw: m[0], value: val });
  }
  // Scientific notation written as "3.55 × 10^1" / "x 10^-3". Only the "×10^exp"
  // part is consumed: the mantissa stays visible to the plain-scalar path below,
  // so a scheme expecting "1.32 x 10^-3" still loosely matches "1.32" elsewhere.
  const consumed: Array<readonly [number, number]> = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([x×])\s*10\s*\^?\s*\{?([+-]?\d+)\}?/gi)) {
    const mantissa = parseScalar(m[1]);
    const exponent = parseScalar(m[3]);
    if (mantissa == null || exponent == null) continue;
    // Consume from the × sign onwards so the mantissa still reaches the plain path.
    const relSeparator = m[0].search(/[x×]/i);
    consumed.push([m.index! + relSeparator, m[0].length - relSeparator]);
    out.push({ raw: m[0], value: mantissa * 10 ** exponent });
  }
  // Remaining scalars (skip those already consumed by a fraction or ×10^ tail)
  const fractionSpans = [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?\s*\/\s*-?\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m)=> [m.index!, m[0].length] as const);
  const spans = [...fractionSpans, ...consumed];
  const isConsumed = (i: number) => spans.some(([s,l])=> i >= s && i < s + l);
  for (const m of text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    if (isConsumed(m.index!)) continue;
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

// --- unit-aware comparison ----------------------------------------------------
// A numeric mark point carrying a physical unit only credits an answer whose
// number sits in the same dimension (SI prefixes convert; J does not become m).

const UNIT_BASE: Record<string, { family: string; factor: number }> = {
  j: { family: "energy", factor: 1 }, kj: { family: "energy", factor: 1e3 }, mj: { family: "energy", factor: 1e6 },
  n: { family: "force", factor: 1 }, kn: { family: "force", factor: 1e3 },
  pa: { family: "pressure", factor: 1 }, kpa: { family: "pressure", factor: 1e3 }, mpa: { family: "pressure", factor: 1e6 },
  v: { family: "potential", factor: 1 }, mv: { family: "potential", factor: 1e-3 }, kv: { family: "potential", factor: 1e3 },
  a: { family: "current", factor: 1 }, ma: { family: "current", factor: 1e-3 },
  w: { family: "power", factor: 1 }, kw: { family: "power", factor: 1e3 },
  hz: { family: "frequency", factor: 1 },
  nm: { family: "length", factor: 1e-9 }, um: { family: "length", factor: 1e-6 }, mm: { family: "length", factor: 1e-3 },
  cm: { family: "length", factor: 0.01 }, m: { family: "length", factor: 1 }, km: { family: "length", factor: 1e3 },
  mg: { family: "mass", factor: 1e-6 }, g: { family: "mass", factor: 1e-3 }, kg: { family: "mass", factor: 1 },
  ns: { family: "time", factor: 1e-9 }, ms: { family: "time", factor: 1e-3 }, s: { family: "time", factor: 1 },
  min: { family: "time", factor: 60 }, hr: { family: "time", factor: 3600 }, h: { family: "time", factor: 3600 },
  mmol: { family: "amount", factor: 1e-3 }, mol: { family: "amount", factor: 1 },
  ml: { family: "volume", factor: 1e-6 }, l: { family: "volume", factor: 1e-3 },
  cm3: { family: "volume", factor: 1e-6 }, dm3: { family: "volume", factor: 1e-3 }, m3: { family: "volume", factor: 1 },
  "mol/dm3": { family: "concentration", factor: 1 }, "mol/l": { family: "concentration", factor: 1 }, moldm3: { family: "concentration", factor: 1 },
};

/** Normalised unit attached to a number, or null when none follows it. */
function unitAfter(text: string, endOfNumber: number): string | null {
  const rest = text.slice(endOfNumber, endOfNumber + 12);
  const match = rest.match(/^[ \u00a0]*((?:mol\s*\/\s*(?:dm3|l)|dm3|cm3|m3|[GMkcmnµu]?(?:J|N|Pa|V|A|W|Hz|mol|g|m|s|L|K))[\^]?\{?-?\d\}?|%)/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, "").replace(/[\u00b2\u00b3]/g, (d) => (d === "\u00b2" ? "2" : "3")).toLowerCase();
}

interface UnitHit { value: number; unit: string | null }

function quantities(text: string): UnitHit[] {
  const out: UnitHit[] = [];
  for (const m of text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    const value = parseScalar(m[0]);
    if (value == null) continue;
    out.push({ value, unit: unitAfter(text, m.index! + m[0].length) });
  }
  return out;
}

/**
 * Pair-level verdict: values close, and when BOTH sides carry units they must
 * share a dimension — SI prefixes convert ("3500 J" ≡ "3.5 kJ"), cross-family
 * units block the credit entirely.
 */
function quantityPairMatches(wanted: number | null, wantedUnit: string | null, given: number | null, givenUnit: string | null): boolean {
  if (wanted == null || given == null) return false;
  if (!numbersClose(wanted, given)) return false;
  if (wantedUnit && givenUnit) {
    const bw = UNIT_BASE[wantedUnit];
    const bg = UNIT_BASE[givenUnit];
    if (bw && bg) {
      if (bw.family !== bg.family) return false;
      if (bw.factor !== bg.factor) return numbersClose(wanted * bw.factor, given * bg.factor);
    } else if (wantedUnit !== givenUnit) {
      // Unrecognised-but-different labels are not evidence of equivalence.
      return false;
    }
  }
  return true;
}

/** Equality to two significant figures, guarded so distant values cannot round onto each other. */
function sameToTwoSigFigs(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return false;
  if (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) > 0.06) return false;
  return Number(a.toPrecision(2)) === Number(b.toPrecision(2));
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
  // Unit-aware quantities: a value with a unit on one side pairs against the
  // other side's same-dimension value (prefix-converted) or its bare value.
  const wantedQuantities = quantities(point);
  const givenQuantities = quantities(answer);
  for (const w of wanted) {
    if (w.value == null) continue;
    for (const g of given) {
      if (g.value == null) continue;
      if (numbersClose(w.value, g.value)) {
        // Values are close; the unit gate can still veto cross-family pairs.
        const qw = wantedQuantities.find((q) => q.value === w.value);
        const qg = givenQuantities.find((q) => q.value === g.value);
        if (!qw?.unit || !qg?.unit || quantityPairMatches(qw.value, qw.unit, qg.value, qg.unit)) return true;
      }
      // Exact raw string match as a fallback (covers trailing zeros, etc.)
      if (w.raw === g.raw) return true;
    }
  }
  // Prefix-conversion rescue: "3500 J" vs "3.5 kJ" is close only after conversion.
  for (const qw of wantedQuantities) {
    if (!qw.unit) continue;
    for (const qg of givenQuantities) {
      if (!qg.unit || qg.value === qw.value) continue;
      if (quantityPairMatches(qw.value, qw.unit, qg.value, qg.unit)) return true;
    }
  }
  // Examiner tolerance: an explicit "(accept X)" or two-significant-figure
  // equality credits rounded answers without opening the door to distant values.
  const accept = point.match(/\(accept\s+(-?\d+(?:[.,]\d+)?)\s*\)/i);
  if (accept) {
    const alt = Number(accept[1].replace(",", "."));
    for (const g of given) {
      const gv = g.value;
      if (gv == null) continue;
      if (numbersClose(gv, alt, 0.05, 0.05)) return true;
    }
    for (const g of givenQuantities) {
      if (g.unit == null) continue;
      if (numbersClose(g.value, alt, 0.05, 0.05)) return true;
    }
  }
  for (const w of wanted) {
    const wv = w.value;
    if (wv == null) continue;
    for (const g of given) {
      const gv = g.value;
      if (gv == null) continue;
      if (sameToTwoSigFigs(wv, gv)) return true;
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

/**
 * Confidence that a rubric mark is correct, derived from the evidence mix:
 * strong credits are certain, partial-strength credits less so, and a missed
 * point that still shows partial evidence is the classic ambiguous case.
 * Null when no evidence exists (MCQs) — those are certain by construction.
 */
export function rubricConfidence(marked: MarkedPart[]): number | null {
  let sum = 0;
  let n = 0;
  for (const part of marked) {
    for (const ev of part.evidence ?? []) {
      n++;
      sum +=
        ev.status === "credited"
          ? ev.evidenceStrength === "strong"
            ? 1
            : 0.6
          : ev.evidenceStrength === "partial"
            ? 0.45
            : 0.95;
    }
  }
  return n ? Math.round((sum / n) * 100) / 100 : null;
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

/**
 * Wrong-reasoning detection: the answer asserts the opposite direction to the
 * scheme point (scheme says "increases", answer says "decreases") without ever
 * stating the scheme's own word. Conservative — both-words answers are
 * contrast structures, not reversals, and are left to coverage.
 */
const ANTONYM_STEMS: Array<[string, string]> = [
  ["increas", "decreas"], ["higher", "lower"], ["more", "less"], ["faster", "slower"],
  ["greater", "smaller"], ["gain", "lose"], ["absorb", "release"], ["endothermic", "exothermic"],
  ["longer", "shorter"], ["stronger", "weaker"],
];

function polarityConflict(point: string, answer: string): boolean {
  const p = point.toLowerCase();
  const a = answer.toLowerCase();
  return ANTONYM_STEMS.some(
    ([x, y]) =>
      (p.includes(x) && a.includes(y) && !a.includes(x)) ||
      (p.includes(y) && a.includes(x) && !a.includes(y)),
  );
}

export function markPart(part: QuestionPart, answer: string, calibration?: PartialCreditCalibration): MarkedPart {
  const trimmed = (answer ?? "").trim();
  const credited: string[] = [];
  const missed: string[] = [];
  const givenTokens = new Set(
    [...tokenise(trimmed)].map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter(Boolean),
  );

  // Scaffolding guard: sibling scheme points often share most vocabulary
  // ("chlorine is reduced to chloride…" vs "chlorine is oxidised to
  // chlorate(I)…"). When a point has distinctive tokens — unique to it across
  // the whole scheme — and the answer contains NONE of them, coverage came
  // from shared scaffolding alone and cannot credit the point.
  const pointTokenSets = part.markScheme.map((p) =>
    new Set([...tokenise(p)].map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter(Boolean)),
  );
  const documentFrequency = new Map<string, number>();
  for (const set of pointTokenSets) for (const t of set) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);

  for (const [pointIndex, point] of part.markScheme.entries()) {
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
    let ok =
      sym === "equivalent"
        ? true
        : sym === "not-equivalent"
          ? false
          : strict
            ? (num && cov >= thresh)
            : numeric
              ? (num || cov >= thresh)
              : (cov >= thresh || num);
    if (ok && !num && sym === "unknown") {
      const discriminative = [...(pointTokenSets[pointIndex] ?? [])].filter(
        (t) => (documentFrequency.get(t) ?? 0) === 1,
      );
      if (discriminative.length >= 1 && !discriminative.some((t) => givenTokens.has(t))) ok = false;
    }
    // Reversed reasoning vetoes the point even when its keywords otherwise land.
    if (ok && sym !== "equivalent" && polarityConflict(point, trimmed)) ok = false;
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

  // Anti-regurgitation: when almost every content word in the answer comes
  // from the scheme's own vocabulary, the response recites rather than
  // engages — an examiner caps it below full marks. Genuine answers
  // paraphrase, so they keep novel wording. Filler words and stray
  // punctuation do not count as engagement, on either side. The coverage
  // ratio also catches numeric-dominant schemes whose verbatim restatement
  // carries almost no independent wording.
  const stripEdges = (t: string) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  const contentTokens = [...tokenise(trimmed)].map(stripEdges).filter((t) => t && !STOP_WORDS.has(t));
  if (contentTokens.length >= 5 && awarded >= part.marks && part.marks > 1) {
    const schemeVocabulary = new Set(
      part.markScheme.flatMap((p) => [...tokenise(p)]).map(stripEdges).filter((t) => t && !STOP_WORDS.has(t)),
    );
    // Vocabulary membership is fuzzy so a transposed word still counts as
    // recited — noise must not let a restatement escape the cap.
    const inSchemeVocabulary = (t: string): boolean => {
      if (schemeVocabulary.has(t)) return true;
      if (!t.length) return false;
      for (const s of schemeVocabulary) {
        if (Math.abs(s.length - t.length) > 1) continue;
        if (withinEditDistance(s, t, 1)) return true;
      }
      return false;
    };
    const coveredShare = contentTokens.filter(inSchemeVocabulary).length / contentTokens.length;
    if (coveredShare >= 0.92) awarded = part.marks - 1;
  }

  // Explicit self-retraction: an answer whose closing lines declare ITSELF
  // wrong, reversed or contradicted cannot be worth full marks. A bare
  // "contradicts …" is how proofs work, so the cue must be self-referential.
  // Cue words are matched with single-edit tolerance so handwriting noise
  // cannot silently un-retract an answer ("reversed"→"reversde").
  const tailFragments = trimmed.split(/\.\s+/).slice(-2);
  const retractTail = tailFragments.join(". ");
  const wordsOfTail = retractTail.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const CUE_WORDS = ["opposite", "reversed", "reverse", "incorrect", "wrong", "instead"];
  const SELF_WORDS = ["answer", "statement", "claim", "assumption", "conclusion", "itself", "initial"];
  const tailHasCue = CUE_WORDS.some((cue) =>
    wordsOfTail.some((w) => w === cue || (cue.length >= 5 && withinEditDistance(w, cue, 1)) || (w.startsWith(cue.slice(0, 5)) && Math.abs(w.length - cue.length) <= 2)),
  );
  const tailHasSelfRef = SELF_WORDS.some((cue) =>
    wordsOfTail.some((w) => w === cue || (w.startsWith(cue.slice(0, 4)) && Math.abs(w.length - cue.length) <= 3)),
  );
  if (awarded >= part.marks && part.marks > 1 && tailHasCue && tailHasSelfRef) {
    awarded = part.marks - 1;
  }

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
  const mcqRaw = answers[question.parts[0]?.id ?? question.id];
  // "" (unanswered) must not coerce to 0 — that would grade "option A selected".
  const mcqIndex = mcqRaw != null && /^\d+$/.test(mcqRaw.trim()) ? Number(mcqRaw.trim()) : -1;
  const marked =
    question.kind === "mcq"
      ? [markMcq(question, mcqIndex)]
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
