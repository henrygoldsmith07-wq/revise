// ---------------------------------------------------------------------------
// Adversarial marking benchmark — puts hostile student answers through the
// same deterministic marker the product ships, and fences the behaviour the
// project claims (docs/benchmark.md, README "Evidence-Based Mark Explanations").
//
// Every case is generated purely and deterministically from authored seed
// questions: no randomness, no network, identical output on every run. When a
// human-marked corpus lands, buildMarkingValidationReport consumes those rows;
// until then this harness keeps the marker honest against the failure modes
// examiners worry about:
//
//   fluent nonsense · keyword stuffing · contradictory answers ·
//   partially correct reasoning · alternative valid notation ·
//   spelling noise · irrelevant-but-fluent answers
//
// Fences are documented expectations, calibrated against the shipped rubric
// marker. A failure means marking regressed, not that the fence moved.
// ---------------------------------------------------------------------------

import { markQuestion, markMcq } from "./marking";
import { mathsEquivalent } from "./maths-equivalence";
import type { Id, Question } from "./types";

export type AdversarialCategoryId =
  | "fluent-nonsense"
  | "irrelevant-but-fluent"
  | "keyword-stuffing"
  | "contradictory"
  | "partially-correct"
  | "alternative-notation"
  | "spelling-noise";

interface MarkerResult {
  awarded: number;
  max: number;
}

type Marker = (question: Question, answers: Record<Id, string>) => MarkerResult;

const defaultMarker: Marker = (question, answers) => {
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
  id: AdversarialCategoryId;
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

export interface AdversarialMarkingReport {
  categories: AdversarialCategoryReport[];
  totalCases: number;
  failedCases: number;
  ok: boolean;
  note: string;
}

// ---------------------------------------------------------------------------
// Deterministic answer-variant builders
// ---------------------------------------------------------------------------

/** Inject one transposition into every third word of length >= 5. */
function addSpellingNoise(text: string): string {
  const words = text.split(/(\s+)/);
  let contentIndex = -1;
  return words
    .map((word) => {
      if (/^\s+$/.test(word) || word.length < 5 || !/[a-z]/i.test(word)) return word;
      contentIndex++;
      if (contentIndex % 3 !== 0) return word;
      const cut = Math.floor(word.length / 2);
      // Transpose the two characters around the midpoint — deterministic.
      const mid = word.slice(cut - 1, cut + 1);
      const swapped = mid[1] + mid[0];
      return word.slice(0, cut - 1) + swapped + word.slice(cut + 1);
    })
    .join("");
}

/** All the scheme's wording, grammatically flattened — form without content. */
function stuffKeywords(markScheme: string[]): string {
  return [...markScheme, ...markScheme].join(", ").replace(/\.$/, "") + ", and so on.";
}

const NONSENSE_SENTENCES = [
  "The fundamental principle underlying this phenomenon reflects broader structural considerations across the discipline as a whole.",
  "It is widely recognised that these processes interact dynamically within their wider conceptual framework.",
  "Ultimately, the significance of this observation extends well beyond its immediate context in important ways.",
];

/** Fluent prose that cannot contain any mark-scheme keyword. */
function fluentNonsense(): string {
  return NONSENSE_SENTENCES.join(" ");
}

/** The correct answer followed by an explicit retraction. */
function contradict(modelAnswer: string): string {
  return `${modelAnswer} However, in the final analysis the opposite holds true and the initial statement is reversed.`;
}

/** A leading slice of the scheme points — genuinely partial content. */
function partialAnswer(markScheme: string[]): string {
  const keep = Math.max(1, Math.floor(markScheme.length / 2));
  return markScheme.slice(0, keep).join(". ") + ".";
}

/** Decimal → fraction ("0.75" → "3/4"), only for clean two-decimal values. */
function decimalToFraction(text: string): string | null {
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
  const replacement = `${numerator / gcd}/${denominator / gcd}`;
  return text.replace(match[0], replacement);
}

// ---------------------------------------------------------------------------
// Eligibility & case assembly
// ---------------------------------------------------------------------------

function answerFor(question: Question, partId: Id, text: string): Record<Id, string> {
  return { [partId]: text };
}

// Deterministic case budget: every category samples the same first K eligible
// questions so runs stay bounded on large banks while remaining reproducible.
const MAX_CASES_PER_CATEGORY = 48;

/**
 * Run every adversarial category over the supplied questions using the
 * (overridable) marker. Deterministic: same input, same report, always.
 */
export function runAdversarialMarkingBenchmark(input: {
  questions: Question[];
  marker?: Marker;
}): AdversarialMarkingReport {
  const marker = input.marker ?? defaultMarker;
  const structured = input.questions
    .filter(
      (q) =>
        q.kind !== "mcq" &&
        q.parts.some((p) => p.markScheme.length > 0 && p.modelAnswer && p.modelAnswer.trim().length > 0),
    )
    .slice(0, MAX_CASES_PER_CATEGORY);

  const reports: AdversarialCategoryReport[] = [
    runNonsense(structured, "fluent-nonsense", marker),
    runIrrelevant(structured, marker),
    runStuffing(structured, marker),
    runContradictory(structured, marker),
    runPartial(structured, marker),
    runAlternativeNotation(structured, marker),
    runSpellingNoise(structured, marker),
  ];

  const totalCases = reports.reduce((a, c) => a + c.cases, 0);
  const failedCases = reports.reduce((a, c) => a + c.failed, 0);
  return {
    categories: reports,
    totalCases,
    failedCases,
    ok: failedCases === 0,
    note: "Synthetic adversarial fixtures generated deterministically from authored seed questions. Not human evidence — external validation comes only from the double-marked corpus.",
  };
}

function finish(
  id: AdversarialCategoryId,
  label: string,
  expectation: string,
  results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }>,
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

function runNonsense(questions: Question[], id: AdversarialCategoryId, marker: Marker): AdversarialCategoryReport {
  const results = questions.map((q) => {
    const part = q.parts[0];
    const { awarded, max } = marker(q, answerFor(q, part.id, fluentNonsense()));
    const share = max ? awarded / max : 0;
    return {
      questionId: q.id,
      ok: awarded < max,
      detail: `fluent nonsense scored ${awarded}/${max}; must stay below full marks`,
      share,
    };
  });
  return finish(id, "Fluent nonsense", "Prose with zero scheme content never earns full marks.", results);
}

function runIrrelevant(structured: Question[], marker: Marker): AdversarialCategoryReport {
  // Donor i comes from a different topic; with the bank sorted by subject,
  // stepping through from the end guarantees a cross-topic pair in O(n).
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const n = structured.length;
  for (let i = 0; i < n; i++) {
    const q = structured[i];
    let donor: Question | undefined;
    for (let step = 1; step < n && !donor; step++) {
      const candidate = structured[(i + step) % n];
      if (candidate.topicIds[0] !== q.topicIds[0]) donor = candidate;
    }
    if (!donor) continue;
    const donorPart = donor.parts[0];
    const part = q.parts[0];
    const { awarded, max } = marker(q, answerFor(q, part.id, donorPart.modelAnswer));
    const share = max ? awarded / max : 0;
    results.push({
      questionId: q.id,
      ok: awarded < max,
      detail: `off-topic answer scored ${awarded}/${max}; must stay below full marks`,
      share,
    });
  }
  return finish("irrelevant-but-fluent", "Irrelevant but fluent", "A fluent answer to a different question never earns full marks.", results);
}

function runStuffing(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const cleanShares: number[] = [];
  for (const q of structured) {
    const part = q.parts[0];
    const stuffed = stuffKeywords(part.markScheme);
    const { awarded: cleanAwarded, max: cleanMax } = marker(q, answerFor(q, part.id, part.modelAnswer));
    cleanShares.push(cleanMax ? cleanAwarded / cleanMax : 0);
    const { awarded, max } = marker(q, answerFor(q, part.id, stuffed));
    const share = max ? awarded / max : 0;
    results.push({
      questionId: q.id,
      // Reciting the scheme can never be worth full marks — the anti-
      // regurgitation cap keeps genuine engagement strictly better.
      ok: awarded < max,
      detail: `stuffing scored ${awarded}/${max} (clean ${cleanAwarded}/${cleanMax}); must stay below full marks`,
      share,
    });
  }
  const report = finish("keyword-stuffing", "Keyword stuffing", "Recited scheme wording never earns full marks, and on average cannot beat a real answer.", results);
  report.comparisonMean =
    cleanShares.length ? Math.round((cleanShares.reduce((a, b) => a + b, 0) / cleanShares.length) * 1000) / 1000 : undefined;
  return report;
}

function runContradictory(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const cleanShares: number[] = [];
  for (const q of structured) {
    const part = q.parts[0];
    const { awarded: cleanAwarded, max: cleanMax } = marker(q, answerFor(q, part.id, part.modelAnswer));
    cleanShares.push(cleanMax ? cleanAwarded / cleanMax : 0);
    const { awarded, max } = marker(q, answerFor(q, part.id, contradict(part.modelAnswer)));
    const share = max ? awarded / max : 0;
    results.push({
      questionId: q.id,
      // A retraction may at worst match the clean answer's generosity, never
      // reach full marks, and must not beat truth on average.
      ok: awarded < max && awarded <= cleanAwarded,
      detail: `retracted answer scored ${awarded}/${max} vs clean ${cleanAwarded}/${cleanMax}`,
      share,
    });
  }
  const report = finish("contradictory", "Contradictory answers", "Retracting the answer never earns full marks and cannot beat the real answer on average.", results);
  report.comparisonMean =
    cleanShares.length ? Math.round((cleanShares.reduce((a, b) => a + b, 0) / cleanShares.length) * 1000) / 1000 : undefined;
  return report;
}

function runPartial(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const partial = partialAnswer(part.markScheme);
    const { awarded, max } = marker(q, answerFor(q, part.id, partial));
    const share = max ? awarded / max : 0;
    const multiPoint = part.markScheme.length >= 2;
    return {
      questionId: q.id,
      // Half the points earns real credit but never the full tariff. The clean
      // answer's own score is reported for parity but not fenced on: a weak
      // model answer is a content-quality finding, not a licence to fail this.
      ok: multiPoint ? awarded > 0 && awarded < max : awarded < max,
      detail: multiPoint
        ? `partial answer scored ${awarded}/${max}; expected some credit, never full marks`
        : `single-point answer scored ${awarded}/${max}`,
      share,
    };
  });
  const report = finish("partially-correct", "Partially correct reasoning", "Half the scheme earns some credit — but never the whole tariff.", results);
  report.comparisonMean = undefined;
  return report;
}

function runAlternativeNotation(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const alternative = decimalToFraction(part.modelAnswer);
    if (!alternative) continue;
    const equivalence = mathsEquivalent(alternative, part.modelAnswer);
    const { awarded: cleanAwarded, max } = marker(q, answerFor(q, part.id, part.modelAnswer));
    const { awarded } = marker(q, answerFor(q, part.id, alternative));
    const share = max ? awarded / max : 0;
    results.push({
      questionId: q.id,
      ok: equivalence === "equivalent" && awarded >= cleanAwarded,
      detail: `"${alternative}" vs "${part.modelAnswer}": equivalence=${equivalence}, scored ${awarded}/${max} (clean ${cleanAwarded})`,
      share,
    });
  }
  return finish("alternative-notation", "Alternative valid notation", "Equivalent fractions/decimals are recognised as equivalent and marked accordingly.", results);
}

function runSpellingNoise(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const noisy = addSpellingNoise(part.modelAnswer);
    const { awarded: cleanAwarded, max } = marker(q, answerFor(q, part.id, part.modelAnswer));
    const { awarded } = marker(q, answerFor(q, part.id, noisy));
    const share = max ? awarded / max : 0;
    return {
      questionId: q.id,
      // Typos cost at most one mark relative to the clean answer, and never
      // more than half the clean score.
      ok: awarded >= cleanAwarded - 1 && (cleanAwarded === 0 || awarded * 2 >= cleanAwarded),
      detail: `noisy answer scored ${awarded}/${max} vs clean ${cleanAwarded}/${max}`,
      share,
    };
  });
  return finish("spelling-noise", "Spelling noise", "Typos in otherwise correct content cost at most one mark.", results);
}
