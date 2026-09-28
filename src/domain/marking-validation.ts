// ---------------------------------------------------------------------------
// Marking validation dashboard / report
//
// Extends the benchmark system to calculate: exact mark agreement,
// agreement within ±1, mean/median absolute error, over/under-marking,
// major-error rate, per-point agreement, misconception detection,
// feedback quality, and breakdowns by subject/topic/command word/mark total/
// question type/difficulty. Keeps INTERNAL vs EXTERNAL validation separate.
// ---------------------------------------------------------------------------

import type { AnswerCorpusRecord } from "./answer-corpus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationProvenance = "internal-regression" | "external-human";

export interface MarkingValidationInput {
  records: AnswerCorpusRecord[];
  /** Function that produces an AI/rubric mark for a record's answer */
  aiMark: (record: AnswerCorpusRecord) => number;
  provenance: ValidationProvenance;
  /**
   * Optional confidence/escalation signal from the marker under test.
   * When absent, escalation fields report null rather than inventing labels.
   */
  aiConfidence?: (record: AnswerCorpusRecord) => { confidence: number | null; escalated: boolean };
}

export interface MarkingValidationSummary {
  total: number;
  exactAgreement: number;
  exactAgreementRate: number;
  withinOneAgreement: number;
  withinOneRate: number;
  meanAbsoluteError: number;
  medianAbsoluteError: number;
  overMarkingRate: number; // AI > human
  underMarkingRate: number; // AI < human
  majorErrorRate: number; // |error| >= 2
  partialCreditAgreement: number | null; // share where partial-credit status agrees, null when no partial rows
  alternativeMethodExactRate: number | null; // exact rate on alternative-method rows, null when none
  misconceptionDetectionAccuracy: number | null;
  feedbackQuality: number | null; // reserved: null until labelled feedback exists
  escalationRate: number | null; // share escalated by the marker, null when no signal supplied
  escalationPrecision: number | null; // share of escalated rows that were true errors (|err|>=1), null when none escalated
}

export interface MarkingValidationByGroup {
  key: string;
  total: number;
  exactAgreementRate: number;
  meanAbsoluteError: number;
  overMarkingRate: number;
  underMarkingRate: number;
}

export interface MarkingPointAgreement {
  totalPoints: number;
  creditedAgreement: number; // share of points where AI and human agree on credited vs missed
}

export interface MarkingValidationReport {
  provenance: ValidationProvenance;
  benchmarkVersion: string | null;
  summary: MarkingValidationSummary;
  bySubject: MarkingValidationByGroup[];
  byTopic: MarkingValidationByGroup[];
  byCommandWord: MarkingValidationByGroup[];
  byMarkTotal: MarkingValidationByGroup[];
  byQuestionType: MarkingValidationByGroup[];
  byDifficulty: MarkingValidationByGroup[];
  byAbility: MarkingValidationByGroup[];
  /** Error-class slices: contradictory, ECF, alternative-method, borderline, long-form, etc. */
  byErrorClass: MarkingValidationByGroup[];
  /** Confidence slices when the marker supplies a confidence signal. */
  byConfidence: MarkingValidationByGroup[];
  pointAgreement: MarkingPointAgreement | null;
  internalVsExternalWarning: string | null;
  /** Ingestion guard: non-empty when the corpus cannot support reliability claims. */
  ingestionWarnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function consensusMark(r: AnswerCorpusRecord): number | null {
  if (r.adjudicatedMark != null) return r.adjudicatedMark;
  if (r.humanMark1 != null && r.humanMark2 != null) {
    // When two markers agree exactly, that's consensus; otherwise average rounded
    if (r.humanMark1 === r.humanMark2) return r.humanMark1;
    return Math.round((r.humanMark1 + r.humanMark2) / 2);
  }
  return r.humanMark1 ?? r.humanMark2 ?? null;
}

function groupStats(records: AnswerCorpusRecord[], aiMark: (r: AnswerCorpusRecord) => number, keyFn: (r: AnswerCorpusRecord) => string | string[]): MarkingValidationByGroup[] {
  const groups = new Map<string, { errors: number[]; over: number; under: number; exact: number }>();
  for (const r of records) {
    const consensus = consensusMark(r);
    if (consensus == null) continue;
    const ai = aiMark(r);
    const err = ai - consensus;
    const keys = (() => {
      const k = keyFn(r);
      return (Array.isArray(k) ? k : [k]).map(String);
    })();
    for (const key of keys) {
      const g = groups.get(key) ?? { errors: [], over: 0, under: 0, exact: 0 };
      g.errors.push(Math.abs(err));
      if (err > 0) g.over += 1;
      if (err < 0) g.under += 1;
      if (err === 0) g.exact += 1;
      groups.set(key, g);
    }
  }
  const out: MarkingValidationByGroup[] = [];
  for (const [key, g] of groups) {
    const total = g.errors.length;
    out.push({
      key,
      total,
      exactAgreementRate: total ? round(g.exact / total, 3) : 0,
      meanAbsoluteError: total ? round(mean(g.errors), 3) : 0,
      overMarkingRate: total ? round(g.over / total, 3) : 0,
      underMarkingRate: total ? round(g.under / total, 3) : 0,
    });
  }
  return out.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Main report builder
// ---------------------------------------------------------------------------

export function buildMarkingValidationReport(input: MarkingValidationInput): MarkingValidationReport {
  const { records, aiMark, provenance, aiConfidence } = input;
  const adjudicated = records.filter((r) => consensusMark(r) != null);
  const n = adjudicated.length;
  const errors: number[] = [];
  const absErrors: number[] = [];
  let exact = 0;
  let withinOne = 0;
  let over = 0;
  let under = 0;
  let major = 0;
  let partialTotal = 0;
  let partialAgree = 0;
  let altTotal = 0;
  let altExact = 0;
  let escalated = 0;
  let escalatedTrueError = 0;

  const ERROR_CLASS_TAGS = new Set([
    "contradictory", "error-carried-forward", "method-marks", "equivalent-algebra",
    "borderline-explanation", "6plus-extended", "calculation", "partially-correct",
    "vague", "misconception", "first-incorrect-step", "significant-figures", "units",
  ]);

  for (const r of adjudicated) {
    const human = consensusMark(r)!;
    const ai = aiMark(r);
    const err = ai - human;
    const abs = Math.abs(err);
    errors.push(err);
    absErrors.push(abs);
    if (abs === 0) exact += 1;
    if (abs <= 1) withinOne += 1;
    if (err > 0) over += 1;
    if (err < 0) under += 1;
    if (abs >= 2) major += 1;
    const humanPartial = human > 0 && human < r.maximumMarks;
    const aiPartial = ai > 0 && ai < r.maximumMarks;
    if (humanPartial || aiPartial) {
      partialTotal += 1;
      if (humanPartial === aiPartial && abs <= 1) partialAgree += 1;
    }
    const tags = new Set(r.questionTypeTags.map(String));
    if (tags.has("equivalent-algebra") || tags.has("method-marks")) {
      altTotal += 1;
      if (abs === 0) altExact += 1;
    }
    if (aiConfidence) {
      const signal = aiConfidence(r);
      if (signal.escalated) {
        escalated += 1;
        if (abs >= 1) escalatedTrueError += 1;
      }
    }
  }

  const summary: MarkingValidationSummary = {
    total: n,
    exactAgreement: exact,
    exactAgreementRate: n ? round(exact / n, 3) : 0,
    withinOneAgreement: withinOne,
    withinOneRate: n ? round(withinOne / n, 3) : 0,
    meanAbsoluteError: n ? round(mean(absErrors), 3) : 0,
    medianAbsoluteError: n ? round(median(absErrors), 3) : 0,
    overMarkingRate: n ? round(over / n, 3) : 0,
    underMarkingRate: n ? round(under / n, 3) : 0,
    majorErrorRate: n ? round(major / n, 3) : 0,
    partialCreditAgreement: partialTotal ? round(partialAgree / partialTotal, 3) : null,
    alternativeMethodExactRate: altTotal ? round(altExact / altTotal, 3) : null,
    misconceptionDetectionAccuracy: null, // requires labelled misconception detection output
    feedbackQuality: null, // requires labelled feedback quality
    escalationRate: aiConfidence ? round(escalated / Math.max(1, n), 3) : null,
    escalationPrecision: escalated ? round(escalatedTrueError / escalated, 3) : null,
  };

  // Breakdown groups
  const bySubject = groupStats(adjudicated, aiMark, (r) => r.subject);
  const byTopic = groupStats(adjudicated, aiMark, (r) => r.topic);
  const byCommandWord = groupStats(adjudicated, aiMark, (r) => r.commandWord);
  const byMarkTotal = groupStats(adjudicated, aiMark, (r) => String(r.maximumMarks));
  const byQuestionType = groupStats(adjudicated, aiMark, (r) => r.questionTypeTags);
  const byDifficulty = groupStats(adjudicated, aiMark, (r) => String(r.difficulty));
  // Prior-attainment band of the student whose answer was marked, when the
  // corpus row records it. Unrecorded rows are grouped so coverage stays honest.
  const byAbility = groupStats(adjudicated, aiMark, (r) => r.abilityLevel ?? "unrecorded");
  const byErrorClass = groupStats(adjudicated, aiMark, (r) =>
    r.questionTypeTags.filter((tag) => ERROR_CLASS_TAGS.has(String(tag))).map(String).length
      ? r.questionTypeTags.filter((tag) => ERROR_CLASS_TAGS.has(String(tag))).map(String)
      : ["unclassified"],
  );
  const byConfidence = aiConfidence
    ? groupStats(adjudicated, aiMark, (r) => {
        const signal = aiConfidence(r);
        if (signal.escalated) return "escalated";
        if (signal.confidence == null) return "unscored-confidence";
        if (signal.confidence < 0.6) return "low-confidence";
        if (signal.confidence < 0.85) return "medium-confidence";
        return "high-confidence";
      })
    : [];

  // Point-level agreement requires structured per-point AI output — not available from scalar aiMark
  const pointAgreement: MarkingPointAgreement | null = null;

  const versions = [...new Set(adjudicated.map((r) => r.benchmarkVersion))];
  const benchmarkVersion = versions.length === 1 ? versions[0] : versions.length ? "mixed" : null;

  const internalVsExternalWarning =
    provenance === "internal-regression"
      ? "Internal regression: synthetic fixtures only — not examiner validation. Do not present as external human validation."
      : null;

  const ingestionWarnings = validateBenchmarkIngestion(records, provenance);

  return {
    provenance,
    benchmarkVersion,
    summary,
    bySubject,
    byTopic,
    byCommandWord,
    byMarkTotal,
    byQuestionType,
    byDifficulty,
    byAbility,
    byErrorClass,
    byConfidence,
    pointAgreement,
    internalVsExternalWarning,
    ingestionWarnings,
  };
}

/**
 * Ingestion guard for reviewer-labelled scripts. Real human labels must carry
 * independent double-marking (or adjudication), a non-synthetic source, and a
 * recorded review status. Synthetic fixtures are valid for regression but
 * must never be presented as external reliability evidence.
 */
export function validateBenchmarkIngestion(records: AnswerCorpusRecord[], provenance: ValidationProvenance): string[] {
  const warnings: string[] = [];
  if (!records.length) return ["Empty corpus: no reliability claim can be made."];
  const synthetic = records.filter((r) => r.source === "internally authored" || r.source === "ai-generated-draft" || r.source === "unreviewed");
  if (provenance === "external-human" && synthetic.length) {
    warnings.push(`${synthetic.length}/${records.length} rows are synthetic or unreviewed and cannot support external reliability claims.`);
  }
  const singleMarked = records.filter((r) => r.humanMark1 == null && r.humanMark2 == null && r.adjudicatedMark == null);
  if (singleMarked.length) warnings.push(`${singleMarked.length}/${records.length} rows have no human mark; they are excluded from agreement.`);
  const noIndependence = records.filter((r) =>
    r.humanMark1 != null && r.humanMark2 != null &&
    !(r.marker1Meta?.independentlyMarked && r.marker2Meta?.independentlyMarked) && r.adjudicatedMark == null);
  if (provenance === "external-human" && noIndependence.length) {
    warnings.push(`${noIndependence.length}/${records.length} double-marked rows lack independent-marking attestation or adjudication.`);
  }
  const longForm = records.filter((r) => r.maximumMarks >= 6 || r.questionTypeTags.includes("6plus-extended" as never));
  if (!longForm.length) warnings.push("No long-form (6+ mark) rows: extended-response reliability is unmeasured.");
  const borderline = records.filter((r) => r.questionTypeTags.includes("borderline-explanation" as never));
  if (!borderline.length) warnings.push("No borderline rows: threshold reliability is unmeasured.");
  if (records.length < 30 && provenance === "external-human") {
    warnings.push(`Small sample (n=${records.length}): report rates as provisional with wide uncertainty.`);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Human-human vs AI-human comparison helper
// ---------------------------------------------------------------------------

export interface HumanAgreementSummary {
  humanHumanExact: number;
  humanHumanWithinOne: number;
  humanHumanMae: number;
  aiVsConsensusExact: number;
  aiVsConsensusMae: number;
}

export function humanVsAiAgreement(records: AnswerCorpusRecord[], aiMark: (r: AnswerCorpusRecord) => number): HumanAgreementSummary {
  const doubleMarked = records.filter((r) => r.humanMark1 != null && r.humanMark2 != null);
  let hhExact = 0;
  let hhWithinOne = 0;
  let hhMaeSum = 0;
  for (const r of doubleMarked) {
    const d = Math.abs(r.humanMark1! - r.humanMark2!);
    if (d === 0) hhExact += 1;
    if (d <= 1) hhWithinOne += 1;
    hhMaeSum += d;
  }
  const hhN = doubleMarked.length;
  const consensusRecords = records.filter((r) => consensusMark(r) != null);
  let aiExact = 0;
  let aiMaeSum = 0;
  for (const r of consensusRecords) {
    const c = consensusMark(r)!;
    const ai = aiMark(r);
    if (ai === c) aiExact += 1;
    aiMaeSum += Math.abs(ai - c);
  }
  const aiN = consensusRecords.length;
  return {
    humanHumanExact: hhN ? round(hhExact / hhN, 3) : 0,
    humanHumanWithinOne: hhN ? round(hhWithinOne / hhN, 3) : 0,
    humanHumanMae: hhN ? round(hhMaeSum / hhN, 3) : 0,
    aiVsConsensusExact: aiN ? round(aiExact / aiN, 3) : 0,
    aiVsConsensusMae: aiN ? round(aiMaeSum / aiN, 3) : 0,
  };
}
