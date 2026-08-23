// ---------------------------------------------------------------------------
// The examiner benchmark — the instrument that proves Revise marks like an
// examiner, or honestly shows it does not.
//
// Protocol (preregistered):
//   * Four blind, independent markers per answer:
//       Examiner A · Examiner B · Revise rubric · Revise AI.
//     Markers never see each other's scores; disagreements are adjudicated
//     afterwards and the adjudication is kept separately from raw marks.
//   * Stratification quotas per phase guarantee coverage across subject,
//     qualification level, tariff band, question type and answer-quality band.
//
// Headline criterion — NOT "AI agrees with one examiner 100%" (humans don't
// either). The target is:
//     Revise-vs-examiner disagreement  ≈  examiner-vs-examiner disagreement
// expressed as a ratio of mean absolute errors (target <= 1.0).
//
// Agreement statistics: exact, ±1, MAE, signed over/under-marking bias,
// Cohen's kappa and linearly/quadratically weighted kappa. Confidence
// calibration bins each AI/rubric self-reported confidence against whether
// the mark landed within one mark of examiner consensus.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export type RaterId = "examinerA" | "examinerB" | "reviseRubric" | "reviseAi";
export const RATERS: RaterId[] = ["examinerA", "examinerB", "reviseRubric", "reviseAi"];
export type QualificationLevel = "gcse" | "alevel";
export type TariffBand = "1-2" | "3-4" | "6+";
export type QuestionKind = "calculation" | "practical" | "evaluate-explain" | "other";
export type AbilityBand = "foundation" | "intermediate" | "higher";
export type QualityBand = "weak" | "borderline" | "near-perfect";

export interface BenchmarkRow {
  id: Id;
  questionId: Id;
  subjectId: Id;
  qualificationLevel: QualificationLevel;
  tariffBand: TariffBand;
  questionKind: QuestionKind;
  abilityBand?: AbilityBand;
  qualityBand?: QualityBand;
  maxMarks: number;
  /** Blind marks; null while that marker has not yet marked the answer. */
  marks: Record<RaterId, number | null>;
  /** Marker self-confidence (0..1) where captured. */
  confidence?: Partial<Record<"reviseRubric" | "reviseAi", number>>;
}

// --- phases & stratification -------------------------------------------------

export const PHASE_1_TARGET = 250;
export const PHASE_2_TARGET = 1000;

/** Minimum counts per marginal stratum for Phase 1 (250 answers). */
export const PHASE_1_STRATIFICATION: Record<string, number> = {
  "subject:biology": 55,
  "subject:chemistry": 60,
  "subject:physics": 60,
  "subject:maths": 55,
  "level:gcse": 115,
  "level:alevel": 115,
  "tariff:1-2": 95,
  "tariff:3-4": 95,
  "tariff:6+": 45,
  "kind:calculation": 60,
  "kind:practical": 55,
  "kind:evaluate-explain": 70,
  "kind:other": 40,
  "quality:weak": 75,
  "quality:borderline": 90,
  "quality:near-perfect": 70,
};

export function stratificationReport(
  rows: BenchmarkRow[],
  minimums: Record<string, number> = PHASE_1_STRATIFICATION,
): { key: string; required: number; actual: number; met: boolean }[] {
  return Object.entries(minimums)
    .map(([key, required]) => {
      const [dimension, value] = key.split(":");
      let actual = 0;
      for (const row of rows) {
        const field =
          dimension === "subject" ? String(row.subjectId).toLowerCase()
          : dimension === "level" ? row.qualificationLevel
          : dimension === "tariff" ? row.tariffBand
          : dimension === "kind" ? row.questionKind
          : dimension === "quality" ? row.qualityBand
          : undefined;
        if (field != null && String(field).includes(value)) actual++;
      }
      return { key, required, actual, met: actual >= required };
    });
}

// --- kappa -------------------------------------------------------------------

/**
 * Cohen's kappa over integer marks 0..maxMarks (unweighted: any mismatch is
 * equally wrong). Returns null when the chance-agreement denominator is zero.
 */
export function cohensKappa(a: number[], b: number[], maxMarks: number): number | null {
  if (a.length !== b.length || !a.length || maxMarks < 1) return null;
  const categories = maxMarks + 1;
  const matrix = Array.from({ length: categories }, () => new Array<number>(categories).fill(0));
  for (let i = 0; i < a.length; i++) {
    if (!Number.isInteger(a[i]) || !Number.isInteger(b[i])) continue;
    if (a[i] < 0 || b[i] < 0 || a[i] > maxMarks || b[i] > maxMarks) continue;
    matrix[a[i]][b[i]]++;
  }
  const n = matrix.flat().reduce((x, y) => x + y, 0);
  if (!n) return null;
  const rowSums = matrix.map((r) => r.reduce((x, y) => x + y, 0));
  const colSums = Array.from({ length: categories }, (_, j) => matrix.reduce((x, r) => x + r[j], 0));
  const observedDiagonal = matrix.reduce((acc, row, i) => acc + row[i], 0);
  const pO = observedDiagonal / n;
  let pE = 0;
  for (let i = 0; i < categories; i++) pE += (rowSums[i] / n) * (colSums[i] / n);
  if (pE >= 1) return null;
  return (pO - pE) / (1 - pE);
}

/**
 * Weighted Cohen's kappa (Cohen 1968) for ordinal marks. Linear weights treat
 * a one-mark miss as half as bad as a full-band miss; quadratic weights
 * forgive near misses more harshly penalising distant ones.
 */
export function weightedKappa(
  a: number[],
  b: number[],
  maxMarks: number,
  weighting: "linear" | "quadratic" = "linear",
): number | null {
  if (a.length !== b.length || !a.length || maxMarks < 1) return null;
  const categories = maxMarks + 1;
  const matrix = Array.from({ length: categories }, () => new Array<number>(categories).fill(0));
  for (let i = 0; i < a.length; i++) {
    if (!Number.isInteger(a[i]) || !Number.isInteger(b[i])) continue;
    if (a[i] < 0 || b[i] < 0 || a[i] > maxMarks || b[i] > maxMarks) continue;
    matrix[a[i]][b[i]]++;
  }
  const n = matrix.flat().reduce((x, y) => x + y, 0);
  if (!n) return null;
  const w = (i: number, j: number): number => {
    const d = Math.abs(i - j) / maxMarks;
    return 1 - (weighting === "linear" ? d : d * d);
  };
  const rowSums = matrix.map((r) => r.reduce((x, y) => x + y, 0));
  const colSums = Array.from({ length: categories }, (_, j) => matrix.reduce((x, r) => x + r[j], 0));
  let pO = 0;
  let pE = 0;
  for (let i = 0; i < categories; i++) {
    for (let j = 0; j < categories; j++) {
      const weight = w(i, j);
      pO += (matrix[i][j] / n) * weight;
      pE += (rowSums[i] / n) * (colSums[j] / n) * weight;
    }
  }
  if (pE >= 1) return null;
  return (pO - pE) / (1 - pE);
}

// --- four-rater agreement engine ---------------------------------------------

export interface PairAgreement {
  raterX: RaterId;
  raterY: RaterId;
  n: number;
  exactRate: number;
  withinOneRate: number;
  mae: number;
  overMarkingBias: number;
  underMarkingBias: number;
  kappa: number | null;
  weightedKappaLinear: number | null;
  weightedKappaQuadratic: number | null;
}

function consensus(row: BenchmarkRow): number | null {
  const { examinerA: a, examinerB: b } = row.marks;
  if (a == null || b == null) return null;
  if (a === b) return a;
  return Math.round((a + b) / 2);
}

function pairStats(rows: BenchmarkRow[], x: RaterId, y: RaterId, yIsConsensus = false): PairAgreement {
  let n = 0;
  let exact = 0;
  let withinOne = 0;
  let absSum = 0;
  let over = 0;
  let under = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const row of rows) {
    const xv = row.marks[x];
    const yv = yIsConsensus ? consensus(row) : row.marks[y];
    if (xv == null || yv == null) continue;
    n++;
    xs.push(xv);
    ys.push(yv);
    const diff = xv - yv;
    const abs = Math.abs(diff);
    if (abs === 0) exact++;
    if (abs <= 1) withinOne++;
    absSum += abs;
    if (diff > 0) over += diff;
    if (diff < 0) under += -diff;
  }
  return {
    raterX: x,
    raterY: y,
    n,
    exactRate: n ? Math.round((exact / n) * 1000) / 1000 : 0,
    withinOneRate: n ? Math.round((withinOne / n) * 1000) / 1000 : 0,
    mae: n ? Math.round((absSum / n) * 1000) / 1000 : 0,
    overMarkingBias: n ? Math.round((over / n) * 1000) / 1000 : 0,
    underMarkingBias: n ? Math.round((under / n) * 1000) / 1000 : 0,
    // Kappas are computed on the pooled mark scale (max across rows keeps
    // categories consistent enough for ordinal comparison at these sizes).
    kappa: cohensKappa(xs, ys, Math.max(0, ...rows.map((r) => r.maxMarks))),
    weightedKappaLinear: weightedKappa(xs, ys, Math.max(0, ...rows.map((r) => r.maxMarks)), "linear"),
    weightedKappaQuadratic: weightedKappa(xs, ys, Math.max(0, ...rows.map((r) => r.maxMarks)), "quadratic"),
  };
}

export interface CalibrationBin {
  range: string;
  n: number;
  meanConfidence: number;
  withinOneShare: number;
}

export interface ExaminerBenchmarkReport {
  n: number;
  phase1Progress: number; // fraction of PHASE_1_TARGET collected
  phase2Progress: number;
  stratification: ReturnType<typeof stratificationReport>;
  humanVsHuman: PairAgreement | null;
  rubricVsHuman: PairAgreement | null;
  aiVsHuman: PairAgreement | null;
  rubricVsExaminerA: PairAgreement | null;
  rubricVsExaminerB: PairAgreement | null;
  aiVsExaminerA: PairAgreement | null;
  aiVsExaminerB: PairAgreement | null;
  /** MAE(revise, examiner) ÷ MAE(examinerA, examinerB) — target <= 1. */
  disagreementRatioRubric: number | null;
  disagreementRatioAi: number | null;
  headlineNote: string;
  calibration: { rubric: CalibrationBin[]; ai: CalibrationBin[] };
}

const CONFIDENCE_BINS: Array<[number, number]> = [
  [0, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0000001],
];

function calibrationBins(
  rows: BenchmarkRow[],
  rater: "reviseRubric" | "reviseAi",
): CalibrationBin[] {
  const usable = rows.filter((r) => r.marks[rater] != null && r.confidence?.[rater] != null && consensus(r) != null);
  return CONFIDENCE_BINS.map(([lo, hi]) => {
    const inBin = usable.filter((r) => {
      const c = r.confidence![rater]!;
      return c >= lo && c < hi;
    });
    const withinOne = inBin.filter((r) => {
      const c = consensus(r)!;
      return Math.abs(r.marks[rater]! - c) <= 1;
    }).length;
    const meanConfidence = inBin.length
      ? Math.round((inBin.reduce((acc, r) => acc + r.confidence![rater]!, 0) / inBin.length) * 1000) / 1000
      : 0;
    return {
      range: `${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`,
      n: inBin.length,
      meanConfidence,
      withinOneShare: inBin.length ? Math.round((withinOne / inBin.length) * 1000) / 1000 : 0,
    };
  });
}

export function buildExaminerBenchmark(rows: BenchmarkRow[]): ExaminerBenchmarkReport {
  const complete = rows.filter(
    (r) => r.marks.examinerA != null && r.marks.examinerB != null && (r.marks.reviseRubric != null || r.marks.reviseAi != null),
  );
  const humanHuman = complete.length ? pairStats(complete, "examinerA", "examinerB") : null;

  const rubricVsHuman = complete.some((r) => r.marks.reviseRubric != null)
    ? pairStats(complete.filter((r) => r.marks.reviseRubric != null), "reviseRubric", "examinerA")
    : null;
  const aiVsHuman = complete.some((r) => r.marks.reviseAi != null)
    ? pairStats(complete.filter((r) => r.marks.reviseAi != null), "reviseAi", "examinerA")
    : null;
  const rubricVsExaminerA = rubricVsHuman;
  const rubricVsExaminerB = complete.some((r) => r.marks.reviseRubric != null)
    ? pairStats(complete.filter((r) => r.marks.reviseRubric != null), "reviseRubric", "examinerB")
    : null;
  const aiVsExaminerA = aiVsHuman;
  const aiVsExaminerB = complete.some((r) => r.marks.reviseAi != null)
    ? pairStats(complete.filter((r) => r.marks.reviseAi != null), "reviseAi", "examinerB")
    : null;

  const ratio = (pair: PairAgreement | null): number | null =>
    humanHuman && humanHuman.mae > 0 && pair ? Math.round((pair.mae / humanHuman.mae) * 1000) / 1000 : null;

  const bestReviseMae = (): number | null => {
    const candidates = [rubricVsHuman?.mae, aiVsHuman?.mae].filter((m): m is number => m != null);
    return candidates.length ? Math.min(...candidates) : null;
  };
  const bestRatio = (() => {
    const h = humanHuman?.mae ?? 0;
    const r = bestReviseMae();
    return h > 0 && r != null ? Math.round((r / h) * 1000) / 1000 : null;
  })();

  return {
    n: complete.length,
    phase1Progress: Math.round((complete.length / PHASE_1_TARGET) * 1000) / 1000,
    phase2Progress: Math.round((complete.length / PHASE_2_TARGET) * 1000) / 1000,
    stratification: stratificationReport(rows),
    humanVsHuman: humanHuman,
    rubricVsHuman,
    aiVsHuman,
    rubricVsExaminerA,
    rubricVsExaminerB,
    aiVsExaminerA,
    aiVsExaminerB,
    disagreementRatioRubric: ratio(rubricVsHuman),
    disagreementRatioAi: ratio(aiVsHuman),
    calibration: {
      rubric: calibrationBins(complete, "reviseRubric"),
      ai: calibrationBins(complete, "reviseAi"),
    },
    headlineNote:
      bestRatio == null
        ? "Awaiting double-marked examiner rows — the human ceiling must exist before Revise's disagreement can be compared to it."
        : `Revise's worst-marker MAE is ${bestRatio}× examiner-vs-examiner MAE. Target: <= 1.00 (comparable disagreement to two qualified examiners).`,
  };
}
