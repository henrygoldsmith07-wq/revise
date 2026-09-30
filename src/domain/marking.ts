import { tokenise, pointCoverage, stem, STOP_WORDS, withinEditDistance } from "./marking-language";
export { tokenise, pointCoverage } from "./marking-language";
import { numericEquivalent, numericMatch, extractNumbersCached, requiresStructuredNumericMatch, isNumericPoint, sameToTwoSigFigs } from "./marking-numeric";
export { numericEquivalent, isNumericPoint } from "./marking-numeric";
import { symbolicMatch } from "./maths-equivalence";
import { markCalculationWorking } from "./calculation-rubric";
import type { MarkEvidence, MarkedPart, Question, QuestionPart } from "./types";

// ---------------------------------------------------------------------------
// Offline marking. This is the floor the product stands on: when no AI
// provider is configured, or the network is gone, or the model call fails,
// answers are still marked — deterministically, against the same mark scheme
// an examiner would use. It is keyword/lemma overlap rather than
// comprehension, so it is generous about wording and strict about content,
// and the UI always labels rubric-marked work as such.
// ---------------------------------------------------------------------------

const CREDIT_THRESHOLD = 0.5;

export interface PartialCreditCalibration {
  /** Per-point threshold override keyed by scheme point text (lower = more generous). */
  thresholds?: Record<string, number>;
  /** When true, require both keyword coverage and numeric match for calculation points. */
  strictNumericPoints?: boolean;
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
  if (requiresStructuredNumericMatch(point)) return numericEquivalent(point, answer) ? 1 : 0;
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
        ? { ...marked, evidence: part.calculationRules && marked.evidence ? marked.evidence : evidenceForMarkedPart(part, answers[part.id] ?? "", marked) }
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

/**
 * Authored answers are a useful floor for explicitly mapped content, but the
 * floor must not depend on sentence order or harmless numeric notation. A
 * canonical multiset of content tokens lets an answer such as
 * "0.40 m" -> "2/5 m", or a reordered chain of sentences, reach the same
 * authored result without accepting added claims, changed values or
 * paraphrases that still need rubric marking.
 */
function canonicalAuthoredAnswer(text: string): string[] {
  // Model answers recur across every adversarial variant and every retry of a
  // question. Keep the canonical form bounded so the full authored-answer
  // equivalence path does not repeatedly rescan the same prose.
  const cached = AUTHORED_CANONICAL_CACHE.get(text);
  if (cached) return cached;
  const expanded = text
    .replace(/[−–—]/g, "-")
    .replace(
      /([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[x×]\s*10\s*\^?\s*\{?([+-]?\d+)\}?/gi,
      (_match, mantissa: string, exponent: string) => String(Number(mantissa) * 10 ** Number(exponent)),
    );
  const tokenPattern =
    /-?\d+(?:,\d{3})*(?:\.\d+)?\s*\/\s*-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?|[a-z]+/gi;
  const fragments = expanded.split(/(?<=[.!?])\s+/).map((fragment) => {
    const tokens: string[] = [];
    for (const match of fragment.matchAll(tokenPattern)) {
      const raw = match[0] ?? "";
      if (/^[a-z]+$/i.test(raw)) {
        const word = stem(raw.toLowerCase());
        // Negation and comparison change the claim even when other words match.
        if (word && (!STOP_WORDS.has(word) || ["not", "no", "less", "more", "without", "never"].includes(word))) tokens.push("w:" + word);
        continue;
      }
      const numeric = extractNumbersCached(raw.replace(/\s+/g, "")).find((hit) => hit.value != null)?.value;
      if (numeric != null && Number.isFinite(numeric)) tokens.push("n:" + numeric.toPrecision(12));
      else tokens.push("r:" + raw.toLowerCase());
    }
    return tokens.sort().join("|");
  }).filter(Boolean);
  const result = fragments.sort();
  if (AUTHORED_CANONICAL_CACHE.size > 1024) AUTHORED_CANONICAL_CACHE.clear();
  AUTHORED_CANONICAL_CACHE.set(text, result);
  return result;
}

const AUTHORED_CANONICAL_CACHE = new Map<string, string[]>();

function authoredAnswerEquivalent(part: QuestionPart, answer: string): boolean {
  const model = part.modelAnswer?.trim();
  if (!model || !answer.trim()) return false;
  const compact = (text: string) => text.replace(/\s+/g, " ");
  if (compact(model) === compact(answer.trim())) return true;
  const expected = canonicalAuthoredAnswer(model);
  const actual = canonicalAuthoredAnswer(answer);
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return expected.every((fragment, index) => {
    if (fragment === actual[index]) return true;
    const wanted = fragment.split("|");
    const given = actual[index]!.split("|");
    if (wanted.length !== given.length) return false;
    const used = new Set<number>();
    return wanted.every((token) => {
      const match = given.findIndex((candidate, candidateIndex) => {
        if (used.has(candidateIndex)) return false;
        if (token === candidate) return true;
        // A single transposed/substituted letter in a content word is normal
        // handwriting/OCR noise. Numeric tokens stay exact after canonical
        // value conversion; a changed number must still go through the rubric.
        return token.startsWith("w:") && candidate.startsWith("w:") &&
          withinEditDistance(token.slice(2), candidate.slice(2), 1);
      });
      if (match < 0) return false;
      used.add(match);
      return true;
    });
  });
}

/** A stated numerical result must match the result, not an input in the working.
 * Restrict the guard to explicit SI results in Physics schemes. Method-only and
 * authored follow-through points still use their separate evidence paths.
 */
function physicsResultMatches(point: string, answer: string): boolean | undefined {
  if (/follow.through|alternatively|accept an? equivalent/i.test(point)) return undefined;
  // Most Physics rubric points are explanatory prose. Skip the numeric regex
  // pipeline unless the point actually states an explicit equality result.
  if (!/=\s*[+-]?(?:\d|\.)/.test(point)) return undefined;
  const value = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:(?:[eE][+-]?\\d+)|(?:\\s*[x×*]\\s*10\\s*\\^?\\s*[+-]?\\d+))?)";
  const units = "([kmunpµμM]?)(J|V|F|C|N|W|Pa|Hz|ohm|s|m|kg)";
  // This guard handles simple units only. Never truncate a compound unit
  // (m/s, m s^-1, J kg^-1) into a different physical quantity.
  const unitEnd = "(?![a-zA-Zµμ]|\\s*(?:[/·^]|[a-zA-Z]+\\s*\\^))(?=\\b|[.;,)]|$)";
  const expand = (s: string) => s.replace(/[−–]/g, "-").replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, r => "^" + [...r].map(c => ({ "⁻": "-", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" }[c] ?? c)).join(""));
  const expected = [...expand(point).matchAll(new RegExp("=\\s*" + value + "\\s*" + units + unitEnd, "g"))].at(-1);
  if (!expected) return undefined;
  const read = (raw: string) => {
    const scientific = raw.match(/^([+-]?[\d.]+)\s*[x×*]\s*10\s*\^?\s*([+-]?\d+)$/);
    return scientific ? Number(scientific[1]) * 10 ** Number(scientific[2]) : Number(raw);
  };
  const scales: Record<string, number> = { "": 1, k: 1e3, M: 1e6, m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12 };
  const target = read(expected[1]!) * scales[expected[2]!]!;
  if (!Number.isFinite(target)) return undefined;
  return [...expand(answer).matchAll(new RegExp(value + "\\s*" + units + unitEnd, "g"))].some(hit => {
    const actual = read(hit[1]!) * scales[hit[2]!]!;
    return hit[3] === expected[3] && Number.isFinite(actual) &&
      (Math.abs(actual - target) <= Math.max(Number.MIN_VALUE, Math.abs(target) * 0.015) ||
        /two significant figures/i.test(point) && sameToTwoSigFigs(actual, target));
  });
}

/** Catch an otherwise identical assertion with its explicit negation reversed.
 * Clause-local comparison avoids vetoing an unrelated correct sentence simply
 * because another sentence in the answer contains "not".
 */
function explicitNegationConflict(point: string, answer: string): boolean {
  const negative = /\b(?:not|never)\b/i;
  if (!negative.test(point) && !negative.test(answer)) return false;
  // This check only distinguishes a reversed polarity in an otherwise
  // identical clause. Token multisets are sufficient here and avoid invoking
  // the more expensive authored-answer canonicaliser for every Physics mark.
  const withoutNegation = (text: string) => text
    .toLowerCase()
    .replace(/\b(?:not|never)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join("|");
  const expected = withoutNegation(point);
  return answerFragments(answer).some(fragment => negative.test(point) !== negative.test(fragment) &&
    withoutNegation(fragment) === expected);
}

export function markPart(part: QuestionPart, answer: string, calibration?: PartialCreditCalibration): MarkedPart {
  const calculation = markCalculationWorking(part, answer);
  if (calculation) return calculation;
  const trimmed = (answer ?? "").trim();
  // The authored complete answer must remain reachable. Its wording is not
  // evidence of cheating or support; the runner records actual hint exposure.
  // Limit this contract to explicitly skill-mapped content with one point per mark.
  if (part.capabilityIds?.length && part.markScheme.length === part.marks && trimmed.length > 0 &&
    authoredAnswerEquivalent(part, trimmed)) {
    const marked: MarkedPart = { partId: part.id, awarded: part.marks, max: part.marks,
      creditedPoints: [...part.markScheme], missedPoints: [], comment: "Complete authored answer — every point is present." };
    return { ...marked, evidence: evidenceForMarkedPart(part, trimmed, marked) };
  }
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
    const cov = pointCoverage(point, trimmed, thresh);
    const num = numericMatch(point, trimmed);
    // Symbolic layer: when both the point and the answer contain a parseable
    // algebra expression, accept equivalent forms (`(x+2)(x-3)` for `x^2 - x - 6`)
    // and reject a pure expression that differs, even if a stray digit matches.
    // Unknown (unparseable/prose) never hurts: it falls through to the rubric.
    const sym = symbolicMatch(trimmed, point);
    const structuredNumeric = requiresStructuredNumericMatch(point);
    const numeric = isNumericPoint(point);
    const strict = Boolean(calibration?.strictNumericPoints && numeric);
    let ok =
      sym === "equivalent"
        ? true
        : sym === "not-equivalent"
          ? false
          : structuredNumeric
            ? num
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
    if (part.capabilityIds?.some(id => id.startsWith("phys."))) {
      if (explicitNegationConflict(point, trimmed)) ok = false;
      const resultMatches = physicsResultMatches(point, trimmed);
      if (resultMatches === false) ok = false;
      const selected = point.match(/^Only ([A-D]) is suitable\.?$/);
      if (selected) ok = new RegExp("\\b(?:only|choose|select)\\s+" + selected[1] + "\\b", "i").test(trimmed) &&
        !new RegExp("\\b(?:only|choose|select)\\s+[" + "ABCD".replace(selected[1]!, "") + "]\\b", "i").test(trimmed);
    }
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

  // Physics uses recorded support exposure to judge independence. Correct
  // reasoning cannot lose an exam mark merely for using the rubric's wording.
  // Preserve the legacy vocabulary heuristic for other subjects here.
  // Anti-regurgitation: when almost every content word in the answer comes
  // from the scheme's own vocabulary, the response recites rather than
  // engages — an examiner caps it below full marks. Genuine answers
  // paraphrase, so they keep novel wording. Filler words and stray
  // punctuation do not count as engagement, on either side. The coverage
  // ratio also catches numeric-dominant schemes whose verbatim restatement
  // carries almost no independent wording.
  const stripEdges = (t: string) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  const contentTokens = [...tokenise(trimmed)].map(stripEdges).filter((t) => t && !STOP_WORDS.has(t));
  if (!part.capabilityIds?.some(id => id.startsWith("phys.")) &&
    contentTokens.length >= 5 && awarded >= part.marks && part.marks > 1) {
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
