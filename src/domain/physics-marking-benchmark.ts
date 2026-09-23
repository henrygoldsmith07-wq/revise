import type { AnswerCorpusRecord, AnswerCorpusProvenance, AnswerCorpusReviewStatus, MarkerMetadata } from "./answer-corpus";
import { markPart } from "./marking";
import { firstIncorrectStep } from "./working-analysis";
import type { MarkedPart, Question, QuestionPart } from "./types";

/** One row comparing Revise's deterministic mark with human judgement. */
export interface PhysicsCorpusMarkComparison {
  recordId: string;
  questionId: string;
  partId: string;
  reviseMark: number;
  humanMark: number;
  marker1Mark: number | null;
  marker2Mark: number | null;
  maximumMarks: number;
  absoluteError: number;
  firstIncorrectStep: number | null;
  firstIncorrectReason: string | null;
  agreement: "exact" | "within-one" | "disagreement";
  gold: boolean;
  source: AnswerCorpusProvenance;
  reviewStatus: AnswerCorpusReviewStatus;
}

export interface PhysicsMarkingBenchmarkReport {
  subjectId: "wjec-alevel-physics";
  benchmarkVersion: string | null;
  provenance: "external-human" | "internal-regression";
  records: PhysicsCorpusMarkComparison[];
  missingQuestionIds: string[];
  missingPartRecordIds: string[];
  totalInputRecords: number;
  evaluatedRecords: number;
  goldRecords: number;
  exactAgreementRate: number;
  withinOneAgreementRate: number;
  meanAbsoluteError: number;
  overMarkingRate: number;
  underMarkingRate: number;
  firstIncorrectStepCoverage: number;
  humanMarkerPairs: number;
  humanMarkerExactAgreementRate: number;
  humanMarkerWithinOneAgreementRate: number;
  humanMarkerMeanAbsoluteDifference: number;
  qualifiedHumanMarkerPairs: number;
  adjudicatedRecords: number;
  caseCoverage: Record<PhysicsBenchmarkCaseTag, number>;
  caseCoverageComplete: boolean;
  /** True only when the supplied corpus is external, gold-labelled and usable. */
  usableForCalibration: boolean;
  note: string;
}

/**
 * Cases that must be represented before a Physics marking corpus can drive a
 * release calibration. They are deliberately tagged by the annotator rather
 * than inferred from Revise's own diagnosis.
 */
export const REQUIRED_PHYSICS_BENCHMARK_CASES = [
  "method-marks",
  "equivalent-algebra",
  "significant-figures",
  "units",
  "error-carried-forward",
  "contradictory",
  "first-incorrect-step",
  "borderline-explanation",
] as const;
export type PhysicsBenchmarkCaseTag = (typeof REQUIRED_PHYSICS_BENCHMARK_CASES)[number];

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function consensus(record: AnswerCorpusRecord): number | null {
  if (record.adjudicatedMark != null) return record.adjudicatedMark;
  if (record.humanMark1 != null && record.humanMark2 != null && record.humanMark1 === record.humanMark2) return record.humanMark1;
  return record.humanMark1 ?? record.humanMark2 ?? null;
}

function goldLabel(record: AnswerCorpusRecord): boolean {
  return record.reviewStatus === "adjudicated" &&
    record.adjudicatedMark != null && record.humanMark1 != null && record.humanMark2 != null;
}

function externalLabel(record: AnswerCorpusRecord): boolean {
  return ["official/past-paper", "examiner-reviewed", "teacher-reviewed"].includes(record.source);
}

function findPart(record: AnswerCorpusRecord, question: Question): QuestionPart | undefined {
  if (record.partId) return question.parts.find((part) => part.id === record.partId);
  return question.parts.length === 1 ? question.parts[0] : undefined;
}

function snapshotText(value: string): string {
  return value.normalize("NFKC").replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * A corpus row is only comparable to the bank version it names. Treat changed
 * prompt, mark points or mark allocation as a mapping failure rather than
 * silently measuring a response against a different assessment.
 */
function matchesBankSnapshot(record: AnswerCorpusRecord, question: Question, part: QuestionPart): boolean {
  return record.maximumMarks === part.marks &&
    snapshotText(record.questionText) === snapshotText(part.prompt) &&
    record.markScheme.length === part.markScheme.length &&
    record.markScheme.every((point, index) => snapshotText(point) === snapshotText(part.markScheme[index] ?? "")) &&
    (!question.specVersion || !record.specificationVersion || question.specVersion === record.specificationVersion) &&
    (!question.paperProvenance || question.paperProvenance.specification === record.specification);
}

function validHumanMark(mark: number | null, maximumMarks: number): boolean {
  return mark == null || (Number.isInteger(mark) && mark >= 0 && mark <= maximumMarks);
}

function qualifiedMarker(meta: MarkerMetadata | null | undefined): boolean {
  return Boolean(meta?.markerId?.trim() && /examiner|teacher|senior/i.test(meta.role ?? "") && /wjec/i.test(meta.boardFamiliarity ?? ""));
}

function qualifiedDoubleMark(record: AnswerCorpusRecord, maximumMarks: number): boolean {
  if (record.reviewStatus !== "adjudicated") return false;
  const markerIds = [record.marker1Meta?.markerId, record.marker2Meta?.markerId, record.adjudicatorMeta?.markerId]
    .map((id) => id?.trim()).filter((id): id is string => Boolean(id));
  return markerIds.length === 3 && new Set(markerIds).size === 3 &&
    Number.isInteger(record.humanMark1) && Number.isInteger(record.humanMark2) &&
    Number.isInteger(record.adjudicatedMark) &&
    validHumanMark(record.humanMark1, maximumMarks) && validHumanMark(record.humanMark2, maximumMarks) &&
    validHumanMark(record.adjudicatedMark, maximumMarks) &&
    qualifiedMarker(record.marker1Meta) && qualifiedMarker(record.marker2Meta) && qualifiedMarker(record.adjudicatorMeta) &&
    record.marker1Meta?.independentlyMarked === true && record.marker2Meta?.independentlyMarked === true;
}

function markedByRevise(part: QuestionPart, answer: string): MarkedPart {
  return markPart(part, answer);
}

/**
 * Evaluate real or test-only anonymised answers against the exact Question
 * bank version used by Revise. A missing question/part is reported rather than
 * silently scored, and only adjudicated/double-agreed external rows become
 * gold evidence for future calibration.
 */
export function evaluatePhysicsAnswerCorpus(input: {
  records: readonly AnswerCorpusRecord[];
  questions: readonly Question[];
  provenance?: "external-human" | "internal-regression";
}): PhysicsMarkingBenchmarkReport {
  const byQuestion = new Map(input.questions.filter((question) => question.subjectId === "wjec-alevel-physics").map((question) => [question.id, question]));
  const comparisons: PhysicsCorpusMarkComparison[] = [];
  const missingQuestionIds: string[] = [];
  const missingPartRecordIds: string[] = [];
  let externalGold = true;

  for (const record of input.records) {
    if (record.subject !== "wjec-alevel-physics") continue;
    const question = byQuestion.get(record.questionId);
    if (!question) {
      missingQuestionIds.push(record.questionId);
      continue;
    }
    const part = findPart(record, question);
    const human = consensus(record);
    if (!part || human == null) {
      if (!part) missingPartRecordIds.push(record.id);
      continue;
    }
    if (!matchesBankSnapshot(record, question, part) || !validHumanMark(human, part.marks) ||
      !validHumanMark(record.humanMark1, part.marks) || !validHumanMark(record.humanMark2, part.marks) ||
      !validHumanMark(record.adjudicatedMark, part.marks)) {
      missingPartRecordIds.push(record.id);
      continue;
    }
    const marked = markedByRevise(part, record.studentAnswer);
    const analysis = firstIncorrectStep(part, record.studentAnswer);
    const error = marked.awarded - human;
    comparisons.push({
      recordId: record.id,
      questionId: record.questionId,
      partId: part.id,
      reviseMark: marked.awarded,
      humanMark: human,
      marker1Mark: record.humanMark1,
      marker2Mark: record.humanMark2,
      maximumMarks: record.maximumMarks,
      absoluteError: Math.abs(error),
      firstIncorrectStep: analysis.firstIncorrect?.stepIndex ?? null,
      firstIncorrectReason: analysis.firstIncorrect?.reason ?? null,
      agreement: error === 0 ? "exact" : Math.abs(error) <= 1 ? "within-one" : "disagreement",
      gold: goldLabel(record),
      source: record.source,
      reviewStatus: record.reviewStatus,
    });
    if (!externalLabel(record) || !goldLabel(record)) externalGold = false;
  }

  const n = comparisons.length;
  const exact = comparisons.filter((row) => row.agreement === "exact").length;
  const within = comparisons.filter((row) => row.agreement !== "disagreement").length;
  const over = comparisons.filter((row) => row.reviseMark > row.humanMark).length;
  const under = comparisons.filter((row) => row.reviseMark < row.humanMark).length;
  const firstStepRows = comparisons.filter((row) => row.firstIncorrectStep != null).length;
  const versions = [...new Set(input.records.filter((record) => record.subject === "wjec-alevel-physics").map((record) => record.benchmarkVersion))];
  const pairs = comparisons.filter((row) => row.marker1Mark != null && row.marker2Mark != null);
  const pairExact = pairs.filter((row) => row.marker1Mark === row.marker2Mark).length;
  const pairWithinOne = pairs.filter((row) => Math.abs((row.marker1Mark ?? 0) - (row.marker2Mark ?? 0)) <= 1).length;
  const pairMeanAbsoluteDifference = pairs.length
    ? pairs.reduce((sum, row) => sum + Math.abs((row.marker1Mark ?? 0) - (row.marker2Mark ?? 0)), 0) / pairs.length
    : 0;
  const byId = new Map(input.records.map((record) => [record.id, record]));
  const qualifiedPairs = comparisons.filter((row) => {
    const record = byId.get(row.recordId);
    return record ? qualifiedDoubleMark(record, row.maximumMarks) : false;
  });
  const caseCoverage = Object.fromEntries(REQUIRED_PHYSICS_BENCHMARK_CASES.map((tag) => [tag, 0])) as Record<PhysicsBenchmarkCaseTag, number>;
  for (const row of qualifiedPairs) {
    const record = byId.get(row.recordId);
    for (const tag of REQUIRED_PHYSICS_BENCHMARK_CASES) {
      if (record?.questionTypeTags.includes(tag)) caseCoverage[tag]++;
    }
  }
  const adjudicatedRecords = comparisons.filter((row) => {
    const record = byId.get(row.recordId);
    return record?.reviewStatus === "adjudicated" && record.adjudicatedMark != null;
  }).length;
  const caseCoverageComplete = REQUIRED_PHYSICS_BENCHMARK_CASES.every((tag) => caseCoverage[tag] > 0);
  const provenance = input.provenance ?? "external-human";
  const usable = provenance === "external-human" && externalGold && comparisons.length >= 20 && qualifiedPairs.length >= 20 &&
    adjudicatedRecords >= 20 && caseCoverageComplete && missingQuestionIds.length === 0 && missingPartRecordIds.length === 0;
  return {
    subjectId: "wjec-alevel-physics",
    benchmarkVersion: versions.length === 1 ? versions[0]! : versions.length ? "mixed" : null,
    provenance,
    records: comparisons,
    missingQuestionIds: [...new Set(missingQuestionIds)],
    missingPartRecordIds: [...new Set(missingPartRecordIds)],
    totalInputRecords: input.records.filter((record) => record.subject === "wjec-alevel-physics").length,
    evaluatedRecords: n,
    goldRecords: comparisons.filter((row) => row.gold).length,
    exactAgreementRate: n ? round(exact / n) : 0,
    withinOneAgreementRate: n ? round(within / n) : 0,
    meanAbsoluteError: n ? round(comparisons.reduce((sum, row) => sum + row.absoluteError, 0) / n) : 0,
    overMarkingRate: n ? round(over / n) : 0,
    underMarkingRate: n ? round(under / n) : 0,
    firstIncorrectStepCoverage: n ? round(firstStepRows / n) : 0,
    humanMarkerPairs: pairs.length,
    humanMarkerExactAgreementRate: pairs.length ? round(pairExact / pairs.length) : 0,
    humanMarkerWithinOneAgreementRate: pairs.length ? round(pairWithinOne / pairs.length) : 0,
    humanMarkerMeanAbsoluteDifference: round(pairMeanAbsoluteDifference),
    qualifiedHumanMarkerPairs: qualifiedPairs.length,
    adjudicatedRecords,
    caseCoverage,
    caseCoverageComplete,
    usableForCalibration: usable,
    note: usable
      ? "External Physics rows have two qualified independent markers, adjudication and every required edge case; preserve this benchmark version when recalculating metrics."
      : provenance === "internal-regression"
        ? "Internal regression only: synthetic rows must never be presented as examiner validation."
        : "Not calibration-ready: require at least 20 complete external rows, qualified double marking with adjudication, every required Physics edge case and no missing bank mappings.",
  };
}
