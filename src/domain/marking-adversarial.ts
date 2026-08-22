// ---------------------------------------------------------------------------
// Adversarial marking benchmark — hostile student answers through the same
// deterministic marker the product ships.
//
// Every case is generated purely and deterministically from authored seed
// questions: no randomness, no network, identical output on every run. When a
// human-marked corpus lands, buildMarkingValidationReport consumes those rows;
// until then this harness keeps the marker honest against the failure modes
// examiners worry about. Fences are documented expectations calibrated against
// the shipped rubric marker — a failure means marking regressed, not that the
// fence moved. Synthetic by design: external validation comes only from the
// double-marked human corpus, which this harness never claims to be.
// ---------------------------------------------------------------------------

import { mathsEquivalent } from "./maths-equivalence";
import type { Id, Question } from "./types";
import {
  ambiguousTranscription,
  answerFor,
  addSpellingNoise,
  cleanScore,
  contradict,
  defaultMarker,
  finish,
  fluentNonsense,
  flipPolarity,
  MAX_CASES_PER_CATEGORY,
  partialAnswer,
  rambling,
  reorderStatements,
  stripGrammarWords,
  stuffKeywords,
  studentShorthand,
  toBulletPoints,
  unusualPhrasing,
  keywordSalad,
  breakUnits,
  hasDecimal,
  toScientificNotation,
  wreckSignificantFigures,
  withinOneOfClean,
  wrongFinalValue,
  decimalToFraction,
} from "./marking-adversarial-variants";
import type { AdversarialCategoryReport, Marker } from "./marking-adversarial-variants";

export type AdversarialCategoryId =
  | "fluent-nonsense"
  | "irrelevant-but-fluent"
  | "keyword-stuffing"
  | "keywords-wrong-reasoning"
  | "contradictory"
  | "mixed-claims"
  | "partially-correct"
  | "alternative-method"
  | "alternative-notation"
  | "scientific-notation"
  | "significant-figures"
  | "valid-method-wrong-answer"
  | "unit-mistakes"
  | "unusual-phrasing"
  | "grammar-errors"
  | "student-shorthand"
  | "bullet-points"
  | "rambling"
  | "ambiguous-transcription"
  | "spelling-noise"
  | "diagram-reference";

export interface AdversarialMarkingReport {
  categories: AdversarialCategoryReport[];
  totalCases: number;
  failedCases: number;
  ok: boolean;
  note: string;
}

/**
 * Run every adversarial category over the supplied questions using the
 * (overridable) marker. Deterministic: same input, same report, always.
 */
export function runAdversarialMarkingBenchmark(input: {
  questions: Question[];
  marker?: Marker;
  /** Override the per-category case budget (the live page uses a smaller sample). */
  maxCasesPerCategory?: number;
}): AdversarialMarkingReport {
  const marker = input.marker ?? defaultMarker;
  const structured = input.questions
    .filter(
      (q) =>
        q.kind !== "mcq" &&
        q.parts.some((p) => p.markScheme.length > 0 && p.modelAnswer && p.modelAnswer.trim().length > 0),
    )
    .slice(0, input.maxCasesPerCategory ?? MAX_CASES_PER_CATEGORY);

  const reports: AdversarialCategoryReport[] = [
    runNonsense(structured, marker),
    runIrrelevant(structured, marker),
    runStuffing(structured, marker),
    runKeywordSalad(structured, marker),
    runContradictory(structured, marker),
    runMixedClaims(structured, marker),
    runPartial(structured, marker),
    runAlternativeMethod(structured, marker),
    runAlternativeNotation(structured, marker),
    runScientificNotation(structured, marker),
    runSignificantFigures(structured, marker),
    runValidMethodWrongAnswer(structured, marker),
    runUnitMistakes(structured, marker),
    runUnusualPhrasing(structured, marker),
    runGrammarErrors(structured, marker),
    runShorthand(structured, marker),
    runBulletPoints(structured, marker),
    runRambling(structured, marker),
    runAmbiguousTranscription(structured, marker),
    runSpellingNoise(structured, marker),
    runDiagramReference(input.questions, structured, marker),
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

function runNonsense(questions: Question[], marker: Marker): AdversarialCategoryReport {
  const results = questions.map((q) => {
    const part = q.parts[0];
    const { awarded, max } = marker(q, answerFor(q, part.id, fluentNonsense()));
    return {
      questionId: q.id,
      ok: awarded < max,
      detail: `fluent nonsense scored ${awarded}/${max}; must stay below full marks`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("fluent-nonsense", "Fluent nonsense", "Prose with zero scheme content never earns full marks.", results);
}

function runIrrelevant(structured: Question[], marker: Marker): AdversarialCategoryReport {
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
    const part = q.parts[0];
    const { awarded, max } = marker(q, answerFor(q, part.id, donor.parts[0].modelAnswer));
    results.push({
      questionId: q.id,
      ok: awarded < max,
      detail: `off-topic answer scored ${awarded}/${max}; must stay below full marks`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("irrelevant-but-fluent", "Irrelevant but fluent", "A fluent answer to a different question never earns full marks.", results);
}

function runStuffing(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const cleanShares: number[] = [];
  for (const q of structured) {
    const part = q.parts[0];
    const clean = cleanScore(q, marker);
    cleanShares.push(clean.max ? clean.awarded / clean.max : 0);
    const { awarded, max } = marker(q, answerFor(q, part.id, stuffKeywords(part.markScheme)));
    results.push({
      questionId: q.id,
      // Recitation must not beat the real answer ON AGGREGATE (asserted below
      // via comparisonMean) and never reaches full marks the clean answer
      // missed. Per-case parity is not fenced: some model answers genuinely
      // under-realise their own scheme, and a coverage marker cannot tell.
      ok: awarded <= max && (clean.awarded === max || awarded < max),
      detail: `stuffing scored ${awarded}/${max} (clean ${clean.awarded}/${clean.max})`,
      share: max ? awarded / max : 0,
    });
  }
  const report = finish("keyword-stuffing", "Keyword stuffing", "Recited scheme wording never exceeds full marks the real answer missed, and cannot beat truth on average.", results);
  report.comparisonMean =
    cleanShares.length ? Math.round((cleanShares.reduce((a, b) => a + b, 0) / cleanShares.length) * 1000) / 1000 : undefined;
  return report;
}

/** Correct keywords, wrong reasoning: salad of scheme terms with bogus causality. */
function runKeywordSalad(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, keywordSalad(part.markScheme)));
    results.push({
      questionId: q.id,
      // Keyword salad may at worst match the model answer's own mark (tiny
      // symbolic schemes are token-identical when restated), and never
      // reaches full marks the clean answer missed.
      ok: awarded <= clean.awarded && (clean.awarded === max || awarded < max),
      detail: `keyword salad scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("keywords-wrong-reasoning", "Correct keywords, wrong reasoning", "Scheme terms chained without sound reasoning cannot beat the real answer.", results);
}

function runContradictory(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const cleanShares: number[] = [];
  for (const q of structured) {
    const part = q.parts[0];
    const clean = cleanScore(q, marker);
    cleanShares.push(clean.max ? clean.awarded / clean.max : 0);
    const { awarded, max } = marker(q, answerFor(q, part.id, contradict(part.modelAnswer)));
    results.push({
      questionId: q.id,
      ok: awarded < max && awarded <= clean.awarded,
      detail: `retracted answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    });
  }
  const report = finish("contradictory", "Contradictory answers", "Retracting the answer never earns full marks and cannot beat the real answer on average.", results);
  report.comparisonMean =
    cleanShares.length ? Math.round((cleanShares.reduce((a, b) => a + b, 0) / cleanShares.length) * 1000) / 1000 : undefined;
  return report;
}

/** Mixed correct/incorrect claims: one polarity-flipped sentence in an otherwise correct answer. */
function runMixedClaims(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const sentences = part.modelAnswer.split(/(?<=\.)\s+/);
    if (sentences.length < 2) continue;
    const flipped = flipPolarity(sentences[0]);
    if (!flipped.changed) continue;
    const mixed = [flipped.text, ...sentences.slice(1)].join(" ");
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, mixed));
    results.push({
      questionId: q.id,
      // A wrong embedded claim can never outscore the fully correct answer.
      ok: awarded <= clean.awarded,
      detail: `mixed-claim answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("mixed-claims", "Mixed correct/incorrect claims", "One reversed claim costs marks — the mixed answer never beats the correct one.", results);
}

function runPartial(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const partial = partialAnswer(part.markScheme);
    const { awarded, max } = marker(q, answerFor(q, part.id, partial));
    const multiPoint = part.markScheme.length >= 2;
    return {
      questionId: q.id,
      ok: multiPoint ? awarded > 0 && awarded < max : awarded < max,
      detail: multiPoint
        ? `partial answer scored ${awarded}/${max}; expected some credit, never full marks`
        : `single-point answer scored ${awarded}/${max}`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("partially-correct", "Partially correct reasoning", "Half the scheme earns some credit — but never the whole tariff.", results);
}

/** Alternative valid method: same statements, different order of working. */
function runAlternativeMethod(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const reordered = reorderStatements(part.modelAnswer);
    if (reordered === part.modelAnswer) continue;
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, reordered));
    results.push({
      questionId: q.id,
      ok: awarded === clean.awarded,
      detail: `reordered working scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}; marking must be route-agnostic`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("alternative-method", "Alternative valid methods", "Reordering the same working changes nothing — marking is route-agnostic.", results);
}

function runAlternativeNotation(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const alternative = decimalToFraction(part.modelAnswer);
    if (!alternative) continue;
    const equivalence = mathsEquivalent(alternative, part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded } = marker(q, answerFor(q, part.id, alternative));
    results.push({
      questionId: q.id,
      ok: equivalence === "equivalent" && awarded >= clean.awarded,
      detail: `"${alternative}" vs "${part.modelAnswer}": equivalence=${equivalence}, scored ${awarded}/${maxOf(clean)} (clean ${clean.awarded})`,
      share: clean.max ? awarded / clean.max : 0,
    });
  }
  return finish("alternative-notation", "Maths equivalence", "Equivalent fractions/decimals are recognised and marked accordingly.", results);
}

function runScientificNotation(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    if (!hasDecimal(part.modelAnswer)) continue;
    const scientific = toScientificNotation(part.modelAnswer);
    if (!scientific.changed) continue;
    const clean = cleanScore(q, marker);
    const { awarded } = marker(q, answerFor(q, part.id, scientific.text));
    results.push({
      questionId: q.id,
      ok: awarded === clean.awarded,
      detail: `"${scientific.text.slice(0, 60)}" scored ${awarded}/${maxOf(clean)} vs clean ${clean.awarded}; value-equal notation must mark equal`,
      share: clean.max ? awarded / clean.max : 0,
    });
  }
  return finish("scientific-notation", "Scientific notation", "3.55 × 10^1 marks identically to 35.5.", results);
}

function runSignificantFigures(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    if (!hasDecimal(part.modelAnswer)) continue;
    const wrecked = wreckSignificantFigures(part.modelAnswer);
    if (!wrecked.changed) continue;
    const { awarded, max } = marker(q, answerFor(q, part.id, wrecked.text));
    const prosePointsRemain = part.markScheme.some((point) => !/\d/.test(point));
    results.push({
      questionId: q.id,
      // Over-rounded values lose their numeric point but any prose points must survive.
      ok: !prosePointsRemain || awarded > 0,
      detail: `1-sig-fig answer scored ${awarded}/${max}${prosePointsRemain ? "; prose method points must still earn credit" : ""}`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("significant-figures", "Significant figures", "Over-rounding loses the value point, not the whole answer.", results);
}

/** Correct final answer with flawed working → wrong final value with valid method. */
function runValidMethodWrongAnswer(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    if (part.marks < 2 || !hasDecimal(part.modelAnswer)) continue;
    const perturbed = wrongFinalValue(part.modelAnswer);
    if (!perturbed.changed) continue;
    const { awarded, max } = marker(q, answerFor(q, part.id, perturbed.text));
    results.push({
      questionId: q.id,
      // The method wording survives untouched, so some credit must remain.
      ok: awarded > 0 && awarded <= max,
      detail: `wrong-final-value answer scored ${awarded}/${max}; method marks must survive`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("valid-method-wrong-answer", "Valid method, wrong final answer", "A slipped final value loses the accuracy point, not every method mark.", results);
}

function runUnitMistakes(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  for (const q of structured) {
    const part = q.parts[0];
    const broken = breakUnits(part.modelAnswer);
    if (!broken.changed) continue;
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, broken.text));
    results.push({
      questionId: q.id,
      ok: awarded <= clean.awarded,
      detail: `wrong-unit answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    });
  }
  return finish("unit-mistakes", "Unit mistakes", "A wrong unit can never gain marks over the correct answer.", results);
}

function runUnusualPhrasing(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const rephrased = unusualPhrasing(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, rephrased));
    return {
      questionId: q.id,
      ok: withinOneOfClean(awarded, clean),
      detail: `rephrased answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("unusual-phrasing", "Unusual phrasing", "Rhetorical synonym swaps cost at most one mark.", results);
}

function runGrammarErrors(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const broken = stripGrammarWords(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, broken));
    return {
      questionId: q.id,
      ok: awarded === clean.awarded,
      detail: `grammar-broken answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}; articles carry no content`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("grammar-errors", "Grammar mistakes", "Dropped articles change nothing — content words decide marks.", results);
}

function runShorthand(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const shorthand = studentShorthand(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, shorthand));
    return {
      questionId: q.id,
      ok: withinOneOfClean(awarded, clean),
      detail: `shorthand answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("student-shorthand", "Student shorthand", "Note-form answers lose at most one mark to abbreviation.", results);
}

function runBulletPoints(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const bullets = toBulletPoints(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, bullets));
    return {
      questionId: q.id,
      ok: awarded === clean.awarded,
      detail: `bullet-point answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}; format carries no marks either way`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("bullet-points", "Bullet-point answers", "Listing the same content as bullets marks identically.", results);
}

function runRambling(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results: Array<{ questionId: Id; ok: boolean; detail: string; share: number }> = [];
  const cleanShares: number[] = [];
  for (const q of structured) {
    const part = q.parts[0];
    const clean = cleanScore(q, marker);
    cleanShares.push(clean.max ? clean.awarded / clean.max : 0);
    const { awarded, max } = marker(q, answerFor(q, part.id, rambling(part.modelAnswer)));
    results.push({
      questionId: q.id,
      ok: awarded < max || clean.awarded === max,
      detail: `rambling answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}; padding never reaches full marks on its own`,
      share: max ? awarded / max : 0,
    });
  }
  const report = finish("rambling", "Rambling answers", "Repetition and filler cannot lift an answer above its content.", results);
  report.comparisonMean =
    cleanShares.length ? Math.round((cleanShares.reduce((a, b) => a + b, 0) / cleanShares.length) * 1000) / 1000 : undefined;
  return report;
}

function runAmbiguousTranscription(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const garbled = ambiguousTranscription(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, garbled));
    return {
      questionId: q.id,
      ok: withinOneOfClean(awarded, clean),
      detail: `ambiguous-transcription answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("ambiguous-transcription", "Ambiguous handwriting/transcription", "OCR-style garble degrades gracefully — at most one mark lost.", results);
}

function runSpellingNoise(structured: Question[], marker: Marker): AdversarialCategoryReport {
  const results = structured.map((q) => {
    const part = q.parts[0];
    const noisy = addSpellingNoise(part.modelAnswer);
    const clean = cleanScore(q, marker);
    const { awarded, max } = marker(q, answerFor(q, part.id, noisy));
    return {
      questionId: q.id,
      // Typos cost at most one mark relative to the clean answer, never more
      // than half of it, and noise cannot reach full marks the clean answer
      // did not.
      ok:
        withinOneOfClean(awarded, clean) &&
        (clean.awarded === clean.max || awarded < clean.max),
      detail: `noisy answer scored ${awarded}/${max} vs clean ${clean.awarded}/${clean.max}`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("spelling-noise", "Spelling mistakes", "Typos cost at most one mark and cannot outscore the clean answer.", results);
}

/** Diagram-dependent questions: pointing at a figure instead of answering earns nothing. */
function runDiagramReference(all: Question[], structured: Question[], marker: Marker): AdversarialCategoryReport {
  const figureQuestions = all.filter((q) => /diagram|graph|table|figure/i.test(q.stem)).slice(0, 8);
  const pool = figureQuestions.length ? figureQuestions : structured.slice(0, 8);
  const results = pool.map((q) => {
    const part = q.parts[0];
    const { awarded, max } = marker(q, answerFor(q, part.id, "As shown clearly on the diagram above."));
    return {
      questionId: q.id,
      ok: awarded === 0,
      detail: `diagram-reference-only answer scored ${awarded}/${max}; citing the figure answers nothing`,
      share: max ? awarded / max : 0,
    };
  });
  return finish("diagram-reference", "Diagram-dependent questions", "An answer that only points at the figure scores zero.", results);
}

function maxOf(score: { awarded: number; max: number }): number {
  return score.max;
}
