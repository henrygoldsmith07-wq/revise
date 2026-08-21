import type { Id, IsoInstant } from "./types";

export const DOUBLE_MARKED_CORPUS_VERSION = 1 as const;

export type CorpusProvenance = "imported" | "synthetic-demo";
export type CorpusRowStatus = "agreement" | "disagreement" | "adjudicated";
export type CorpusSampleQuality = "empty" | "early" | "usable" | "stable";

export interface MarkerScore {
  markerId: string;
  awarded: number;
  note?: string;
}

export interface Adjudication {
  awarded: number;
  note?: string;
  resolvedAt?: IsoInstant;
}

/** One answer scored independently by two markers before any adjudication. */
export interface DoubleMarkedAnswer {
  id: Id;
  questionId: Id;
  partId: Id;
  subjectId: Id;
  prompt: string;
  answer: string;
  maxMarks: number;
  markerA: MarkerScore;
  markerB: MarkerScore;
  adjudication?: Adjudication;
  provenance: CorpusProvenance;
}

export interface DoubleMarkedCorpusFile {
  formatVersion: typeof DOUBLE_MARKED_CORPUS_VERSION;
  rows: DoubleMarkedAnswer[];
}

export interface DoubleMarkedAnswerAnalysis {
  row: DoubleMarkedAnswer;
  status: CorpusRowStatus;
  difference: number;
  normalisedDifference: number;
}

export interface CorpusSubjectSummary {
  subjectId: Id;
  rows: number;
  exactAgreement: number;
  exactAgreementRate: number;
  meanAbsoluteDifference: number;
}

export interface DoubleMarkedCorpusReport {
  rows: number;
  totalMaxMarks: number;
  exactAgreement: number;
  exactAgreementRate: number;
  withinOneMark: number;
  withinOneMarkRate: number;
  meanAbsoluteDifference: number;
  meanNormalisedDifference: number;
  markerBias: number;
  disagreements: number;
  pendingAdjudication: number;
  adjudicatedRows: number;
  quality: CorpusSampleQuality;
  analyses: DoubleMarkedAnswerAnalysis[];
  bySubject: CorpusSubjectSummary[];
}

export interface CorpusParseResult {
  rows: DoubleMarkedAnswer[];
  errors: string[];
}

function rounded(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function rowStatus(row: DoubleMarkedAnswer, difference: number): CorpusRowStatus {
  if (row.adjudication) return "adjudicated";
  return difference === 0 ? "agreement" : "disagreement";
}

export function analyseDoubleMarkedAnswer(row: DoubleMarkedAnswer): DoubleMarkedAnswerAnalysis {
  const difference = Math.abs(row.markerA.awarded - row.markerB.awarded);
  return {
    row,
    status: rowStatus(row, difference),
    difference,
    normalisedDifference: row.maxMarks ? rounded(difference / row.maxMarks) : 0,
  };
}

function sampleQuality(rows: number): CorpusSampleQuality {
  if (rows === 0) return "empty";
  if (rows < 10) return "early";
  if (rows < 30) return "usable";
  return "stable";
}

/** Aggregate agreement without allowing adjudicated marks to hide original disagreement. */
export function buildDoubleMarkedCorpusReport(rows: DoubleMarkedAnswer[]): DoubleMarkedCorpusReport {
  const analyses = rows.map(analyseDoubleMarkedAnswer);
  const exactAgreement = analyses.filter((analysis) => analysis.difference === 0).length;
  const withinOneMark = analyses.filter((analysis) => analysis.difference <= 1).length;
  const totalMaxMarks = rows.reduce((sum, row) => sum + row.maxMarks, 0);
  const meanAbsoluteDifference = analyses.length
    ? rounded(analyses.reduce((sum, analysis) => sum + analysis.difference, 0) / analyses.length)
    : 0;
  const meanNormalisedDifference = analyses.length
    ? rounded(analyses.reduce((sum, analysis) => sum + analysis.normalisedDifference, 0) / analyses.length)
    : 0;
  const markerBias = analyses.length
    ? rounded(analyses.reduce((sum, analysis) => sum + analysis.row.markerB.awarded - analysis.row.markerA.awarded, 0) / analyses.length)
    : 0;
  const subjects = new Map<Id, DoubleMarkedAnswerAnalysis[]>();
  for (const analysis of analyses) {
    const list = subjects.get(analysis.row.subjectId) ?? [];
    list.push(analysis);
    subjects.set(analysis.row.subjectId, list);
  }

  const bySubject = [...subjects.entries()]
    .map(([subjectId, subjectAnalyses]) => {
      const exact = subjectAnalyses.filter((analysis) => analysis.difference === 0).length;
      return {
        subjectId,
        rows: subjectAnalyses.length,
        exactAgreement: exact,
        exactAgreementRate: subjectAnalyses.length ? rounded(exact / subjectAnalyses.length) : 0,
        meanAbsoluteDifference: rounded(
          subjectAnalyses.reduce((sum, analysis) => sum + analysis.difference, 0) / subjectAnalyses.length,
        ),
      };
    })
    .sort((a, b) => b.rows - a.rows || a.subjectId.localeCompare(b.subjectId));

  return {
    rows: rows.length,
    totalMaxMarks,
    exactAgreement,
    exactAgreementRate: rows.length ? rounded(exactAgreement / rows.length) : 0,
    withinOneMark,
    withinOneMarkRate: rows.length ? rounded(withinOneMark / rows.length) : 0,
    meanAbsoluteDifference,
    meanNormalisedDifference,
    markerBias,
    disagreements: analyses.filter((analysis) => analysis.difference > 0).length,
    pendingAdjudication: analyses.filter((analysis) => analysis.status === "disagreement").length,
    adjudicatedRows: rows.filter((row) => Boolean(row.adjudication)).length,
    quality: sampleQuality(rows.length),
    analyses,
    bySubject,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, rowNumber: number): string | null {
  if (typeof value !== "string" || !value.trim()) return `Row ${rowNumber}: ${field} must be a non-empty string.`;
  if (value.length > 20_000) return `Row ${rowNumber}: ${field} is too long.`;
  return null;
}

function parseMarker(value: unknown, field: string, rowNumber: number, maxMarks: number): { marker?: MarkerScore; error?: string } {
  if (!isRecord(value)) return { error: `Row ${rowNumber}: ${field} is missing.` };
  const markerId = value.markerId;
  if (typeof markerId !== "string" || !markerId.trim()) return { error: `Row ${rowNumber}: ${field}.markerId must be a non-empty string.` };
  const awarded = value.awarded;
  if (typeof awarded !== "number" || !Number.isInteger(awarded) || awarded < 0 || awarded > maxMarks) {
    return { error: `Row ${rowNumber}: ${field}.awarded must be an integer from 0 to ${maxMarks}.` };
  }
  if (value.note !== undefined && typeof value.note !== "string") return { error: `Row ${rowNumber}: ${field}.note must be a string.` };
  return { marker: { markerId: markerId.trim(), awarded, note: typeof value.note === "string" ? value.note : undefined } };
}

function parseRow(value: unknown, index: number): { row?: DoubleMarkedAnswer; error?: string } {
  const rowNumber = index + 1;
  if (!isRecord(value)) return { error: `Row ${rowNumber}: expected an object.` };
  const stringFields = ["questionId", "partId", "subjectId", "prompt"] as const;
  for (const field of stringFields) {
    const error = requiredString(value[field], field, rowNumber);
    if (error) return { error };
  }
  const maxMarks = value.maxMarks;
  if (typeof maxMarks !== "number" || !Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 100) {
    return { error: `Row ${rowNumber}: maxMarks must be an integer from 1 to 100.` };
  }
  if (typeof value.answer !== "string" || value.answer.length > 20_000) return { error: `Row ${rowNumber}: answer must be a string no longer than 20,000 characters.` };
  const markerA = parseMarker(value.markerA, "markerA", rowNumber, maxMarks);
  if (markerA.error) return { error: markerA.error };
  const markerB = parseMarker(value.markerB, "markerB", rowNumber, maxMarks);
  if (markerB.error) return { error: markerB.error };
  if (markerA.marker!.markerId === markerB.marker!.markerId) return { error: `Row ${rowNumber}: markerA and markerB must be independent marker IDs.` };

  let adjudication: Adjudication | undefined;
  if (value.adjudication !== undefined) {
    if (!isRecord(value.adjudication)) return { error: `Row ${rowNumber}: adjudication must be an object.` };
    const awarded = value.adjudication.awarded;
    if (typeof awarded !== "number" || !Number.isInteger(awarded) || awarded < 0 || awarded > maxMarks) {
      return { error: `Row ${rowNumber}: adjudication.awarded must be an integer from 0 to ${maxMarks}.` };
    }
    if (value.adjudication.note !== undefined && typeof value.adjudication.note !== "string") {
      return { error: `Row ${rowNumber}: adjudication.note must be a string.` };
    }
    adjudication = {
      awarded,
      note: typeof value.adjudication.note === "string" ? value.adjudication.note : undefined,
      resolvedAt: typeof value.adjudication.resolvedAt === "string" ? value.adjudication.resolvedAt : undefined,
    };
  }

  return {
    row: {
      id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `imported-answer-${rowNumber}`,
      questionId: value.questionId as string,
      partId: value.partId as string,
      subjectId: value.subjectId as string,
      prompt: value.prompt as string,
      answer: value.answer,
      maxMarks,
      markerA: markerA.marker!,
      markerB: markerB.marker!,
      adjudication,
      provenance: "imported",
    },
  };
}

/** Parse a versioned JSON export, retaining valid rows while reporting bad ones. */
export function parseDoubleMarkedCorpus(raw: string): CorpusParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rows: [], errors: ["The corpus file is not valid JSON."] };
  }

  const rowsValue = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.rows : undefined;
  if (!Array.isArray(rowsValue)) return { rows: [], errors: ["Expected a JSON array or an object with a rows array."] };
  if (isRecord(parsed) && parsed.formatVersion !== undefined && parsed.formatVersion !== DOUBLE_MARKED_CORPUS_VERSION) {
    return { rows: [], errors: [`Unsupported corpus format version: ${String(parsed.formatVersion)}.`] };
  }

  const rows: DoubleMarkedAnswer[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  rowsValue.forEach((value, index) => {
    const result = parseRow(value, index);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    if (ids.has(result.row!.id)) {
      errors.push(`Row ${index + 1}: duplicate answer ID ${result.row!.id}.`);
      return;
    }
    ids.add(result.row!.id);
    rows.push(result.row!);
  });
  return { rows, errors };
}

export function serialiseDoubleMarkedCorpus(rows: DoubleMarkedAnswer[]): string {
  const file: DoubleMarkedCorpusFile = { formatVersion: DOUBLE_MARKED_CORPUS_VERSION, rows };
  return JSON.stringify(file, null, 2);
}

