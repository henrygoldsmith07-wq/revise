// ---------------------------------------------------------------------------
// Past-paper import benchmark — turns "clever feature" into "trustworthy one".
//
// A gold set of papers + mark schemes is annotated by hand across nine
// dimensions: question boundaries, sub-question boundaries, mark values,
// figures, tables, mark-scheme alignment, spec points, topics and command
// words. An importer's output is scored against it with task-specific metrics:
//
//   question segmentation      F1 over boundary spans
//   subpart detection          F1 over part labels
//   mark extraction            exact accuracy per part and total
//   mark-scheme pairing        accuracy of scheme→part alignment
//   topic mapping              top-1 / top-3 accuracy
//   spec-point mapping         precision / recall over spec-point id sets
//   diagram association        accuracy of figure attachment
//
// Every imported question also carries an IMPORT CONFIDENCE built from the
// same signals. Low confidence routes to a human review queue instead of
// silently joining the bank — that is what makes the feature trustworthy.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

// --- gold annotations ---------------------------------------------------------

export interface GoldFigure {
  figureId: string;
  /** Question label(s) the figure belongs to ("4b"). */
  attachedTo: string[];
}

export interface GoldPart {
  label: string; // "(a)", "(b)(i)", …
  marks: number;
  commandWord: string | null;
  /** Mark-scheme line indices aligned to this part inside the scheme text. */
  schemeLineIndices: number[];
  specPointIds: Id[];
  topics: string[];
}

export interface GoldQuestion {
  /** Question label as printed ("4", "7"). */
  label: string;
  /** Index of the first character of the question stem in the source text. */
  startChar: number;
  endChar: number;
  totalMarks: number;
  hasTable: boolean;
  parts: GoldPart[];
  figures: GoldFigure[];
}

export interface GoldPaper {
  paperId: Id;
  board: string; // wjec | aqa | edexcel | ocr
  qualificationLevel: "gcse" | "alevel";
  subjectId: Id;
  year: number;
  series: string; // "Summer 2023"
  sourceText: string;
  markSchemeText: string;
  questions: GoldQuestion[];
  /** Provenance of the annotation itself. */
  annotators: Array<{ role: "examiner" | "teacher"; id: string }>;
  adjudicated: boolean;
}

/** Phase targets for corpus collection. */
export const IMPORT_PHASE_1_PAPERS = 100;
export const IMPORT_PHASE_2_PAPERS = 400;

// --- predicted import items -----------------------------------------------------

export interface ImportedPartPrediction {
  label: string;
  marks: number | null;
  marksTotal?: number | null;
  commandWord: string | null;
  schemeLineIndices: number[];
  specPointIds: Id[];
  specPointScores?: Array<{ id: Id; score: number }>;
  topics: Array<{ id: string; score: number }>;
  attachedFigureIds?: string[];
}

export interface ImportedQuestionPrediction {
  label: string;
  startChar: number;
  endChar: number;
  totalMarks: number | null;
  hasTable: boolean;
  parts: ImportedPartPrediction[];
  attachedFigureIds: string[];
}

export interface ImportRun {
  runId: string;
  paperId: Id;
  questions: ImportedQuestionPrediction[];
}

// --- metric primitives ----------------------------------------------------------

const round = (n: number): number => Math.round(n * 1000) / 1000;

function prf(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    precision: round(precision),
    recall: round(recall),
    f1: precision + recall ? round((2 * precision * recall) / (precision + recall)) : 0,
  };
}

// --- individual metrics -----------------------------------------------------------

export function segmentationF1(pred: ImportedQuestionPrediction[], gold: GoldQuestion[]): { n: number; tp: number; fp: number; fn: number } & ReturnType<typeof prf> {
  // A predicted boundary matches when its start char falls inside a gold
  // question span whose label agrees.
  let tp = 0;
  const matchedGold = new Set<GoldQuestion>();
  for (const p of pred) {
    const hit = gold.find(
      (g) => g.label === p.label && p.startChar >= g.startChar && p.startChar < g.endChar,
    );
    if (hit && !matchedGold.has(hit)) {
      tp++;
      matchedGold.add(hit);
    }
  }
  const fp = pred.length - tp;
  const fn = gold.length - matchedGold.size;
  return { n: gold.length, tp, fp, fn, ...prf(tp, fp, fn) };
}

function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[\s().]/g, "");
}

export function subpartDetectionF1(
  predQ: ImportedQuestionPrediction,
  goldQ: GoldQuestion,
): { n: number; tp: number; fp: number; fn: number } & ReturnType<typeof prf> {
  const goldLabels = new Set(goldQ.parts.map((p) => normaliseLabel(p.label)));
  const predLabels = predQ.parts.map((p) => normaliseLabel(p.label));
  const seen = new Set<string>();
  let tp = 0;
  for (const l of predLabels) {
    if (goldLabels.has(l) && !seen.has(l)) {
      tp++;
      seen.add(l);
    }
  }
  const fp = predLabels.length - tp;
  const fn = goldLabels.size - tp;
  return { n: goldLabels.size, tp, fp, fn, ...prf(tp, fp, fn) };
}

function matchGoldPart(
  pred: ImportedPartPrediction,
  goldParts: GoldPart[],
): GoldPart | null {
  const key = normaliseLabel(pred.label);
  return goldParts.find((g) => normaliseLabel(g.label) === key) ?? null;
}

export function markExtractionAccuracy(
  predQ: ImportedQuestionPrediction[],
  goldQ: GoldQuestion[],
): { partAccuracy: number | null; totalAccuracy: number | null; n: number } {
  let ok = 0;
  let totalOk = 0;
  let n = 0;
  const goldByLabel = new Map(goldQ.map((g) => [g.label, g]));
  for (const q of predQ) {
    const g = goldByLabel.get(q.label);
    if (!g) continue;
    n++;
    if (q.totalMarks != null && q.totalMarks === g.totalMarks) totalOk++;
    let partHits = 0;
    let known = 0;
    for (const p of q.parts) {
      const gp = matchGoldPart(p, g.parts);
      if (!gp) continue;
      known++;
      if (p.marks != null && p.marks === gp.marks) partHits++;
    }
    if (known && partHits === g.parts.length) ok++;
  }
  return {
    partAccuracy: n ? round(ok / n) : null,
    totalAccuracy: n ? round(totalOk / n) : null,
    n,
  };
}

export function markSchemePairingAccuracy(
  predQ: ImportedQuestionPrediction[],
  goldQ: GoldQuestion[],
): number | null {
  let hits = 0;
  let n = 0;
  const goldByLabel = new Map(goldQ.map((g) => [g.label, g]));
  for (const q of predQ) {
    const g = goldByLabel.get(q.label);
    if (!g) continue;
    for (const p of q.parts) {
      const gp = matchGoldPart(p, g.parts);
      if (!gp) continue;
      n++;
      const aligned = p.schemeLineIndices.some((idx) => gp.schemeLineIndices.includes(idx));
      if (aligned) hits++;
    }
  }
  return n ? round(hits / n) : null;
}

export function topicMappingAccuracy(
  predQ: ImportedQuestionPrediction[],
  goldQ: GoldQuestion[],
): { top1: number | null; top3: number | null; n: number } {
  let n = 0;
  let top1 = 0;
  let top3 = 0;
  const goldByLabel = new Map(goldQ.map((g) => [g.label, g]));
  for (const q of predQ) {
    const g = goldByLabel.get(q.label);
    if (!g) continue;
    for (const p of q.parts) {
      const gp = matchGoldPart(p, g.parts);
      if (!gp || !gp.topics.length || !p.topics.length) continue;
      n++;
      const ids = p.topics.map((t) => t.id);
      if (ids.slice(0, 1).some((id) => gp.topics.includes(id))) top1++;
      if (ids.slice(0, 3).some((id) => gp.topics.includes(id))) top3++;
    }
  }
  return {
    top1: n ? round(top1 / n) : null,
    top3: n ? round(top3 / n) : null,
    n,
  };
}

export function specPointPR(
  predQ: ImportedQuestionPrediction[],
  goldQ: GoldQuestion[],
): { n: number; tp: number; fp: number; fn: number } & ReturnType<typeof prf> {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const goldByLabel = new Map(goldQ.map((g) => [g.label, g]));
  for (const q of predQ) {
    const g = goldByLabel.get(q.label);
    if (!g) continue;
    for (const p of q.parts) {
      const gp = matchGoldPart(p, g.parts);
      if (!gp) continue;
      const predicted = new Set(p.specPointIds);
      const goldSet = new Set(gp.specPointIds);
      for (const id of predicted) {
        if (goldSet.has(id)) tp++;
        else fp++;
      }
      for (const id of goldSet) if (!predicted.has(id)) fn++;
    }
  }
  return { n: tp + fn, tp, fp, fn, ...prf(tp, fp, fn) };
}

export function diagramAssociationAccuracy(
  predQ: ImportedQuestionPrediction[],
  goldQ: GoldQuestion[],
): { n: number; tp: number; fp: number; fn: number; correct: number } & ReturnType<typeof prf> {
  // Per-figure association: a gold figure is correctly associated when the
  // importer attached it to at least one part of the right question.
  let tp = 0;
  let fn = 0;
  let fp = 0;
  const goldByLabel = new Map(goldQ.map((g) => [g.label, g]));
  const claimedGoldFigures = new Set<string>();
  for (const q of predQ) {
    const g = goldByLabel.get(q.label);
    if (!g) {
      fp += q.attachedFigureIds.length;
      continue;
    }
    const goldFigureIds = new Set(g.figures.map((f) => f.figureId));
    for (const fid of q.attachedFigureIds) {
      if (goldFigureIds.has(fid)) {
        if (!claimedGoldFigures.has(`${q.label}:${fid}`)) {
          claimedGoldFigures.add(`${q.label}:${fid}`);
          tp++;
        }
      } else {
        fp++; // hallucinated figure
      }
    }
  }
  for (const g of goldQ) {
    for (const f of g.figures) {
      if (claimedGoldFigures.has(`${g.label}:${f.figureId}`)) continue;
      fn++;
    }
  }
  const n = tp + fn;
  return { n, tp, fp, fn, correct: tp, ...prf(tp, fp, fn) };
}

// --- confidence -----------------------------------------------------------------

export interface ImportConfidenceInput {
  marksParsed: boolean;
  totalMarksParsed: boolean;
  schemePaired: boolean;
  topicTop1Score: number; // 0..1 margin of best topic guess
  specMappedCount: number;
  hasCommandWord: boolean;
  figureAttachedWithoutGoldSignal?: boolean;
}

/**
 * Documented, additive confidence model. Each signal contributes a fixed
 * weight; the sum is clamped to 0..1. Below REVIEW_THRESHOLD the question is
 * routed to human review instead of silently entering the bank.
 */
export const CONFIDENCE_WEIGHTS = {
  marks: 0.25,
  totalMarks: 0.15,
  schemePairing: 0.25,
  topicMargin: 0.15,
  specMapping: 0.1,
  commandWord: 0.05,
  figurePenalty: -0.1,
} as const;

export const IMPORT_REVIEW_THRESHOLD = 0.7;

export function importConfidence(input: ImportConfidenceInput): number {
  let c = 0;
  if (input.marksParsed) c += CONFIDENCE_WEIGHTS.marks;
  if (input.totalMarksParsed) c += CONFIDENCE_WEIGHTS.totalMarks;
  if (input.schemePaired) c += CONFIDENCE_WEIGHTS.schemePairing;
  c += CONFIDENCE_WEIGHTS.topicMargin * Math.max(0, Math.min(1, input.topicTop1Score));
  c += CONFIDENCE_WEIGHTS.specMapping * Math.min(1, input.specMappedCount / 2);
  if (input.hasCommandWord) c += CONFIDENCE_WEIGHTS.commandWord;
  if (input.figureAttachedWithoutGoldSignal) c += CONFIDENCE_WEIGHTS.figurePenalty;
  return round(Math.max(0, Math.min(1, c)));
}

export function needsReview(confidence: number): boolean {
  return confidence < IMPORT_REVIEW_THRESHOLD;
}

// --- full evaluation --------------------------------------------------------------

export interface ImportBenchmarkReport {
  papersAnnotated: number;
  phase1Progress: number;
  questions: number;
  segmentationF1: number;
  subpartF1: number;
  markExtraction: { partAccuracy: number | null; totalAccuracy: number | null };
  schemePairingAccuracy: number | null;
  topicMapping: { top1: number | null; top3: number | null };
  specPoint: { precision: number | null; recall: number | null; f1: number | null };
  diagramAssociation: { precision: number | null; recall: number | null };
  note: string;
}

export function evaluateImport(run: ImportRun, goldPapers: GoldPaper[]): ImportBenchmarkReport | null {
  const gold = goldPapers.find((g) => g.paperId === run.paperId);
  if (!gold) return null;
  const seg = segmentationF1(run.questions, gold.questions);

  let subTp = 0;
  let subFp = 0;
  let subFn = 0;
  for (const q of run.questions) {
    const g = gold.questions.find((x) => x.label === q.label);
    if (!g) continue;
    const r = subpartDetectionF1(q, g);
    subTp += r.tp;
    subFp += r.fp;
    subFn += r.fn;
  }

  const marks = markExtractionAccuracy(run.questions, gold.questions);
  const pairing = markSchemePairingAccuracy(run.questions, gold.questions);
  const topics = topicMappingAccuracy(run.questions, gold.questions);
  const spec = specPointPR(run.questions, gold.questions);
  const diagrams = diagramAssociationAccuracy(run.questions, gold.questions);

  return {
    papersAnnotated: 1,
    phase1Progress: round(goldPapers.length / IMPORT_PHASE_1_PAPERS),
    questions: gold.questions.length,
    segmentationF1: seg.f1,
    subpartF1: prf(subTp, subFp, subFn).f1,
    markExtraction: { partAccuracy: marks.partAccuracy, totalAccuracy: marks.totalAccuracy },
    schemePairingAccuracy: pairing,
    topicMapping: { top1: topics.top1, top3: topics.top3 },
    specPoint: { precision: spec.precision, recall: spec.recall, f1: spec.f1 },
    diagramAssociation: { precision: diagrams.precision, recall: diagrams.recall },
    note: `Scored against gold annotations for ${gold.board} ${gold.qualificationLevel.toUpperCase()} ${gold.subjectId} (${gold.series}), ${gold.adjudicated ? "adjudicated" : "single-annotated"}.`,
  };
}
