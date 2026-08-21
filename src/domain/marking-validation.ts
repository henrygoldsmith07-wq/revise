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
  misconceptionDetectionAccuracy: number | null;
  feedbackQuality: number | null; // reserved: null until labelled feedback exists
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
  pointAgreement: MarkingPointAgreement | null;
  internalVsExternalWarning: string | null;
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
  const { records, aiMark, provenance } = input;
  const adjudicated = records.filter((r) => consensusMark(r) != null);
  const n = adjudicated.length;
  const errors: number[] = [];
  const absErrors: number[] = [];
  let exact = 0;
  let withinOne = 0;
  let over = 0;
  let under = 0;
  let major = 0;

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
    misconceptionDetectionAccuracy: null, // requires labelled misconception detection output
    feedbackQuality: null, // requires labelled feedback quality
  };

  // Breakdown groups
  const bySubject = groupStats(adjudicated, aiMark, (r) => r.subject);
  const byTopic = groupStats(adjudicated, aiMark, (r) => r.topic);
  const byCommandWord = groupStats(adjudicated, aiMark, (r) => r.commandWord);
  const byMarkTotal = groupStats(adjudicated, aiMark, (r) => String(r.maximumMarks));
  const byQuestionType = groupStats(adjudicated, aiMark, (r) => r.questionTypeTags);
  const byDifficulty = groupStats(adjudicated, aiMark, (r) => String(r.difficulty));

  // Point-level agreement requires structured per-point AI output — not available from scalar aiMark
  const pointAgreement: MarkingPointAgreement | null = null;

  const versions = [...new Set(adjudicated.map((r) => r.benchmarkVersion))];
  const benchmarkVersion = versions.length === 1 ? versions[0] : versions.length ? "mixed" : null;

  const internalVsExternalWarning =
    provenance === "internal-regression"
      ? "Internal regression: synthetic fixtures only — not examiner validation. Do not present as external human validation."
      : null;

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
    pointAgreement,
    internalVsExternalWarning,
  };
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
