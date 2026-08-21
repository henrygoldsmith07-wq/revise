// ---------------------------------------------------------------------------
// Human-marked answer corpus — scalable benchmark/data architecture.
// This is the *richer* corpus that satisfies the PRIMARY GOAL checklist:
// every field the spec asks for is modelled explicitly so that future
// import tooling can carry provenance without conflating internal fixtures
// with genuine examiner evidence.
// ---------------------------------------------------------------------------

import type { CommandWord, Id, IsoInstant, MisconceptionTag } from "./types";

// ---------------------------------------------------------------------------
// Enumerations — deliberately exhaustive for the benchmark checklist
// ---------------------------------------------------------------------------

export type AnswerCorpusProvenance =
  | "official/past-paper"
  | "examiner-reviewed"
  | "teacher-reviewed"
  | "internally authored"
  | "ai-generated-draft"
  | "unreviewed";

export type AnswerCorpusReviewStatus =
  | "draft"
  | "needs_review"
  | "single-marked"
  | "double-marked"
  | "adjudicated"
  | "verified"
  | "rejected";

export type QuestionTypeTag =
  | "1-mark"
  | "2-4-mark"
  | "6plus-extended"
  | "calculation"
  | "describe"
  | "explain"
  | "evaluate"
  | "compare"
  | "practical-method"
  | "data-interpretation"
  | "partially-correct"
  | "vague"
  | "contradictory"
  | "irrelevant-but-correct"
  | "misconception"
  | "different-ability";

export type AbilityLevel = "foundation" | "intermediate" | "higher" | "mixed";

// ---------------------------------------------------------------------------
// Marker metadata
// ---------------------------------------------------------------------------

export interface MarkerMetadata {
  markerId: string;
  /** e.g. "examiner", "teacher", "senior-examiner" */
  role?: string;
  /** years of marking experience, when disclosed */
  experienceYears?: number;
  /** board familiarity, e.g. "AQA", "WJEC" */
  boardFamiliarity?: string;
  markedAt?: IsoInstant;
}

// ---------------------------------------------------------------------------
// Single corpus record — one student answer to one question part
// ---------------------------------------------------------------------------

export interface AnswerCorpusRecord {
  // Identity & routing
  id: Id;
  questionId: Id;
  partId?: Id;
  subject: Id; // e.g. wjec-alevel-physics
  specification: string; // e.g. A200QS, 7405, 8461
  specificationVersion?: string; // e.g. 2024-1.0
  topic: Id;
  subtopic?: Id;

  // Question payload
  questionText: string;
  markScheme: string[]; // ordered mark points
  maximumMarks: number;
  commandWord: CommandWord;
  difficulty: 1 | 2 | 3 | 4 | 5;
  questionTypeTags: QuestionTypeTag[];

  // Student response & human judgement
  studentAnswer: string;
  humanMark1: number | null; // independent marker A
  humanMark2: number | null; // independent marker B (null until double-marked)
  adjudicatedMark: number | null; // final consensus (null until adjudicated)
  humanFeedback: string | null;
  identifiedMisconceptions: MisconceptionTag[];

  // Provenance & review
  source: AnswerCorpusProvenance;
  reviewStatus: AnswerCorpusReviewStatus;
  provenance: string; // free-text source description, e.g. "WJEC 2019 Paper 2 Q4(b) — anonymised cohort"
  marker1Meta?: MarkerMetadata | null;
  marker2Meta?: MarkerMetadata | null;
  adjudicatorMeta?: MarkerMetadata | null;

  // Benchmark bookkeeping
  benchmarkVersion: string; // e.g. 2026.08.v2
  abilityLevel?: AbilityLevel;
  createdAt: IsoInstant;
  updatedAt?: IsoInstant;
}

// ---------------------------------------------------------------------------
// Corpus file (versioned JSON export)
// ---------------------------------------------------------------------------

export const ANSWER_CORPUS_FORMAT_VERSION = 2 as const;

export interface AnswerCorpusFile {
  formatVersion: typeof ANSWER_CORPUS_FORMAT_VERSION;
  benchmarkVersion: string;
  createdAt: IsoInstant;
  provenance: string;
  records: AnswerCorpusRecord[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface AnswerCorpusValidation {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

const VALID_SPEC_RE = /^[A-Z0-9/\-]+$/;

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateAnswerCorpusRecord(record: unknown, index: number): { record?: AnswerCorpusRecord; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];
  const rowNum = index + 1;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return { issues: [`Record ${rowNum}: expected an object`], warnings };
  }
  const r = record as Record<string, unknown>;

  // Required string fields
  for (const f of ["id", "questionId", "subject", "specification", "topic", "questionText", "provenance", "benchmarkVersion"] as const) {
    if (!isNonEmptyString(r[f])) issues.push(`Record ${rowNum}: ${f} is required and must be a non-empty string`);
  }
  if (r.id !== undefined && typeof r.id === "string" && r.id.length > 200) issues.push(`Record ${rowNum}: id too long`);
  if (r.questionText !== undefined && typeof r.questionText === "string" && r.questionText.length > 20_000) issues.push(`Record ${rowNum}: questionText too long`);
  if (r.studentAnswer !== undefined && typeof r.studentAnswer !== "string") issues.push(`Record ${rowNum}: studentAnswer must be a string`);
  else if (typeof r.studentAnswer === "string" && r.studentAnswer.length > 20_000) issues.push(`Record ${rowNum}: studentAnswer too long`);

  // Specification format
  if (typeof r.specification === "string" && r.specification.trim() && !VALID_SPEC_RE.test(r.specification.trim())) {
    warnings.push(`Record ${rowNum}: specification '${r.specification}' looks unusual`);
  }

  // max marks
  const maxMarks = r.maximumMarks;
  if (typeof maxMarks !== "number" || !Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 20) {
    issues.push(`Record ${rowNum}: maximumMarks must be integer 1..20`);
  }

  // difficulty
  const diff = r.difficulty;
  if (typeof diff !== "number" || ![1, 2, 3, 4, 5].includes(diff)) issues.push(`Record ${rowNum}: difficulty must be 1..5`);

  // command word
  const commandWords: CommandWord[] = ["state","describe","explain","calculate","show that","suggest","compare","evaluate","discuss","justify","deduce","predict","outline","other"];
  if (r.commandWord !== undefined && !commandWords.includes(r.commandWord as CommandWord)) issues.push(`Record ${rowNum}: commandWord invalid`);

  // markScheme
  if (!Array.isArray(r.markScheme)) issues.push(`Record ${rowNum}: markScheme must be an array`);
  else {
    if (r.markScheme.length === 0) warnings.push(`Record ${rowNum}: markScheme is empty`);
    for (const p of r.markScheme) {
      if (typeof p !== "string" || !p.trim()) issues.push(`Record ${rowNum}: markScheme entries must be non-empty strings`);
    }
    if (typeof maxMarks === "number" && r.markScheme.length > 0 && r.markScheme.length !== maxMarks && maxMarks <= 6) {
      warnings.push(`Record ${rowNum}: markScheme length ${r.markScheme.length} differs from maximumMarks ${maxMarks}`);
    }
  }

  // questionTypeTags
  if (r.questionTypeTags !== undefined && !Array.isArray(r.questionTypeTags)) issues.push(`Record ${rowNum}: questionTypeTags must be an array`);
  if (Array.isArray(r.questionTypeTags) && r.questionTypeTags.length === 0) warnings.push(`Record ${rowNum}: questionTypeTags is empty`);

  // human marks
  for (const field of ["humanMark1", "humanMark2", "adjudicatedMark"] as const) {
    const v = r[field];
    if (v !== null && v !== undefined) {
      if (typeof v !== "number" || !Number.isInteger(v)) issues.push(`Record ${rowNum}: ${field} must be integer or null`);
      else if (typeof maxMarks === "number" && (v < 0 || v > maxMarks)) issues.push(`Record ${rowNum}: ${field} ${v} outside 0..${maxMarks}`);
    }
  }

  // misconceptions
  if (r.identifiedMisconceptions !== undefined && !Array.isArray(r.identifiedMisconceptions)) issues.push(`Record ${rowNum}: identifiedMisconceptions must be an array`);

  // provenance / reviewStatus
  const validStatuses: AnswerCorpusReviewStatus[] = ["draft","needs_review","single-marked","double-marked","adjudicated","verified","rejected"];
  if (r.reviewStatus !== undefined && !validStatuses.includes(r.reviewStatus as AnswerCorpusReviewStatus)) issues.push(`Record ${rowNum}: reviewStatus invalid`);
  const validSources: AnswerCorpusProvenance[] = ["official/past-paper","examiner-reviewed","teacher-reviewed","internally authored","ai-generated-draft","unreviewed"];
  if (r.source !== undefined && !validSources.includes(r.source as AnswerCorpusProvenance)) issues.push(`Record ${rowNum}: source invalid`);

  // marker meta
  for (const metaField of ["marker1Meta","marker2Meta","adjudicatorMeta"] as const) {
    const v = r[metaField];
    if (v !== null && v !== undefined && typeof v === "object") {
      const mm = v as Record<string, unknown>;
      if (mm.markerId !== undefined && typeof mm.markerId !== "string") issues.push(`Record ${rowNum}: ${metaField}.markerId must be string`);
    } else if (v !== null && v !== undefined && typeof v !== "object") {
      issues.push(`Record ${rowNum}: ${metaField} must be object or null`);
    }
  }

  // Cross-field warnings
  if (r.humanMark2 != null && r.humanMark1 == null) warnings.push(`Record ${rowNum}: humanMark2 present but humanMark1 is null`);
  if (r.adjudicatedMark != null && r.humanMark1 == null && r.humanMark2 == null) warnings.push(`Record ${rowNum}: adjudicatedMark without human marks`);

  // If no issues, construct typed record (cast)
  if (issues.length === 0) {
    return { record: r as unknown as AnswerCorpusRecord, issues, warnings };
  }
  return { issues, warnings };
}

export function validateAnswerCorpusFile(file: AnswerCorpusFile): AnswerCorpusValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<Id>();
  if (file.formatVersion !== ANSWER_CORPUS_FORMAT_VERSION) issues.push(`Unsupported formatVersion ${file.formatVersion}, expected ${ANSWER_CORPUS_FORMAT_VERSION}`);
  if (!file.benchmarkVersion?.trim()) issues.push("benchmarkVersion is required");
  if (!Array.isArray(file.records)) issues.push("records must be an array");
  else {
    if (file.records.length === 0) warnings.push("corpus contains no records");
    file.records.forEach((rec, idx) => {
      const res = validateAnswerCorpusRecord(rec, idx);
      issues.push(...res.issues);
      warnings.push(...res.warnings);
      if (seenIds.has(rec.id)) issues.push(`Duplicate record id: ${rec.id}`);
      else seenIds.add(rec.id);
    });
  }
  return { ok: issues.length === 0, issues, warnings };
}

// ---------------------------------------------------------------------------
// Parse / serialise helpers (JSON + CSV import)
// ---------------------------------------------------------------------------

export interface AnswerCorpusParseResult {
  file: AnswerCorpusFile | null;
  records: AnswerCorpusRecord[];
  errors: string[];
  warnings: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseAnswerCorpusJson(raw: string): AnswerCorpusParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { file: null, records: [], errors: ["File is not valid JSON"], warnings: [] };
  }
  // Accept either { formatVersion, records } or raw array of records
  let file: AnswerCorpusFile;
  if (Array.isArray(parsed)) {
    file = {
      formatVersion: ANSWER_CORPUS_FORMAT_VERSION,
      benchmarkVersion: "imported",
      createdAt: new Date().toISOString(),
      provenance: "imported-array",
      records: parsed as AnswerCorpusRecord[],
    };
  } else if (isRecord(parsed) && Array.isArray(parsed.records)) {
    if (parsed.formatVersion !== undefined && parsed.formatVersion !== ANSWER_CORPUS_FORMAT_VERSION) {
      return { file: null, records: [], errors: [`Unsupported corpus formatVersion ${String(parsed.formatVersion)}`], warnings: [] };
    }
    file = {
      formatVersion: ANSWER_CORPUS_FORMAT_VERSION,
      benchmarkVersion: typeof parsed.benchmarkVersion === "string" ? parsed.benchmarkVersion : "imported",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      provenance: typeof parsed.provenance === "string" ? parsed.provenance : "imported",
      records: parsed.records as AnswerCorpusRecord[],
    };
  } else {
    return { file: null, records: [], errors: ["Expected a JSON array or an object with a records array"], warnings: [] };
  }

  const validation = validateAnswerCorpusFile(file);
  // Return valid records only, collecting errors per record
  if (validation.issues.length && file.records.length === 0) {
    return { file: null, records: [], errors: validation.issues, warnings: validation.warnings };
  }
  // Filter to valid rows, keep errors for invalid rows
  const validRecords: AnswerCorpusRecord[] = [];
  const errors: string[] = [];
  const warnings: string[] = [...validation.warnings];
  const seen = new Set<string>();
  file.records.forEach((rec, idx) => {
    const res = validateAnswerCorpusRecord(rec, idx);
    if (res.issues.length) errors.push(...res.issues);
    else if (seen.has(rec.id)) errors.push(`Record ${idx + 1}: duplicate id ${rec.id}`);
    else {
      seen.add(rec.id);
      validRecords.push(res.record!);
      warnings.push(...res.warnings);
    }
  });
  return {
    file: { ...file, records: validRecords },
    records: validRecords,
    errors,
    warnings,
  };
}

export function serialiseAnswerCorpus(file: AnswerCorpusFile): string {
  return JSON.stringify(file, null, 2);
}

export function createAnswerCorpusFile(records: AnswerCorpusRecord[], benchmarkVersion: string, provenance: string): AnswerCorpusFile {
  return {
    formatVersion: ANSWER_CORPUS_FORMAT_VERSION,
    benchmarkVersion,
    createdAt: new Date().toISOString(),
    provenance,
    records,
  };
}

// ---------------------------------------------------------------------------
// Statistics — quick health check for the corpus
// ---------------------------------------------------------------------------

export interface AnswerCorpusStats {
  total: number;
  bySubject: Record<string, number>;
  bySpecification: Record<string, number>;
  byCommandWord: Record<string, number>;
  byDifficulty: Record<string, number>;
  byQuestionType: Record<string, number>;
  bySource: Record<string, number>;
  byReviewStatus: Record<string, number>;
  byMarks: Record<string, number>;
  singleMarked: number;
  doubleMarked: number;
  adjudicated: number;
  withMisconceptions: number;
}

export function answerCorpusStats(records: AnswerCorpusRecord[]): AnswerCorpusStats {
  const bySubject: Record<string, number> = {};
  const bySpecification: Record<string, number> = {};
  const byCommandWord: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byQuestionType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byReviewStatus: Record<string, number> = {};
  const byMarks: Record<string, number> = {};
  let singleMarked = 0;
  let doubleMarked = 0;
  let adjudicated = 0;
  let withMisconceptions = 0;
  for (const r of records) {
    bySubject[r.subject] = (bySubject[r.subject] ?? 0) + 1;
    bySpecification[r.specification] = (bySpecification[r.specification] ?? 0) + 1;
    byCommandWord[r.commandWord] = (byCommandWord[r.commandWord] ?? 0) + 1;
    byDifficulty[String(r.difficulty)] = (byDifficulty[String(r.difficulty)] ?? 0) + 1;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    byReviewStatus[r.reviewStatus] = (byReviewStatus[r.reviewStatus] ?? 0) + 1;
    byMarks[String(r.maximumMarks)] = (byMarks[String(r.maximumMarks)] ?? 0) + 1;
    for (const t of r.questionTypeTags) byQuestionType[t] = (byQuestionType[t] ?? 0) + 1;
    if (r.humanMark1 != null && r.humanMark2 == null) singleMarked += 1;
    if (r.humanMark1 != null && r.humanMark2 != null) doubleMarked += 1;
    if (r.adjudicatedMark != null) adjudicated += 1;
    if (r.identifiedMisconceptions.length > 0) withMisconceptions += 1;
  }
  return {
    total: records.length,
    bySubject,
    bySpecification,
    byCommandWord,
    byDifficulty,
    byQuestionType,
    bySource,
    byReviewStatus,
    byMarks,
    singleMarked,
    doubleMarked,
    adjudicated,
    withMisconceptions,
  };
}

// ---------------------------------------------------------------------------
// Development fixtures — clearly labelled, never reported as human evidence.
// ---------------------------------------------------------------------------

export const DEV_FIXTURE_BENCHMARK_VERSION = "dev-fixture-v1" as const;

function nowIso(): IsoInstant {
  return new Date().toISOString();
}

export function devFixtureRecords(): AnswerCorpusRecord[] {
  // 8 illustrative fixtures covering the checklist categories, all marked as
  // internally authored / unreviewed and with dev-fixture benchmark version.
  const base = {
    specificationVersion: "2024-1.0",
    markScheme: ["State correct formula", "Substitute values with correct units", "Final answer 42 J"],
    humanFeedback: null,
    identifiedMisconceptions: [] as MisconceptionTag[],
    provenance: "Synthetic development fixture — not human evidence",
    benchmarkVersion: DEV_FIXTURE_BENCHMARK_VERSION,
    createdAt: nowIso(),
  } as const;
  return [
    {
      id: "dev-001-1mark-state",
      questionId: "seed-q:dev-1mark",
      partId: "seed-q:dev-1mark:a",
      subject: "wjec-alevel-physics",
      specification: "A200QS",
      ...base,
      topic: "wjec-alevel-physics.quantum",
      questionText: "State the unit of Planck's constant.",
      markScheme: ["J s or kg m^2 s^-1"],
      maximumMarks: 1,
      commandWord: "state",
      difficulty: 1,
      questionTypeTags: ["1-mark"],
      studentAnswer: "Joule seconds",
      humanMark1: 1,
      humanMark2: null,
      adjudicatedMark: null,
      source: "internally authored",
      reviewStatus: "single-marked",
      abilityLevel: "foundation",
    },
    {
      id: "dev-002-calculation",
      questionId: "seed-q:dev-calc",
      partId: "seed-q:dev-calc:a",
      subject: "aqa-alevel-chemistry",
      specification: "7405",
      ...base,
      topic: "aqa-alevel-chemistry.moles",
      questionText: "Calculate the concentration in mol dm^-3.",
      markScheme: ["Uses n=cV", "Answer 0.25 mol dm^-3"],
      maximumMarks: 2,
      commandWord: "calculate",
      difficulty: 2,
      questionTypeTags: ["2-4-mark", "calculation"],
      studentAnswer: "c = n/V = 0.25 mol dm^-3",
      humanMark1: 2,
      humanMark2: 2,
      adjudicatedMark: 2,
      source: "internally authored",
      reviewStatus: "adjudicated",
      abilityLevel: "intermediate",
      marker1Meta: { markerId: "dev-marker-1", role: "teacher" },
      marker2Meta: { markerId: "dev-marker-2", role: "teacher" },
    },
    {
      id: "dev-003-explain-partial",
      questionId: "seed-q:dev-explain",
      partId: "seed-q:dev-explain:a",
      subject: "wjec-alevel-chemistry",
      specification: "A100QS",
      ...base,
      topic: "wjec-alevel-chemistry.energetics",
      questionText: "Explain why the enthalpy of vaporisation is positive.",
      markScheme: ["Bonds broken require energy", "Intermolecular forces overcome", "Energy supplied > energy released"],
      maximumMarks: 3,
      commandWord: "explain",
      difficulty: 3,
      questionTypeTags: ["2-4-mark", "explain", "partially-correct"],
      studentAnswer: "Energy is needed to break bonds so it is endothermic.",
      humanMark1: 1,
      humanMark2: 1,
      adjudicatedMark: 1,
      source: "internally authored",
      reviewStatus: "double-marked",
      abilityLevel: "intermediate",
    },
    {
      id: "dev-004-evaluate-extended",
      questionId: "seed-q:dev-evaluate",
      partId: "seed-q:dev-evaluate:a",
      subject: "aqa-gcse-biology",
      specification: "8461",
      ...base,
      topic: "aqa-gcse-biology.genetics",
      questionText: "Evaluate the use of genetic testing for inherited disease. (6 marks)",
      markScheme: ["Benefit: early diagnosis", "Benefit: informed decisions", "Risk: anxiety", "Risk: discrimination", "Ethical consideration", "Balanced conclusion"],
      maximumMarks: 6,
      commandWord: "evaluate",
      difficulty: 4,
      questionTypeTags: ["6plus-extended", "evaluate", "vague"],
      studentAnswer: "It is good because it helps but also bad because it worries people. So it is mixed.",
      humanMark1: 2,
      humanMark2: 1,
      adjudicatedMark: 2,
      source: "internally authored",
      reviewStatus: "adjudicated",
      abilityLevel: "higher",
      identifiedMisconceptions: ["conceptual"],
    },
    {
      id: "dev-005-practical-method",
      questionId: "seed-q:dev-practical",
      partId: "seed-q:dev-practical:a",
      subject: "edexcel-gcse-chemistry",
      specification: "1CH0",
      ...base,
      topic: "edexcel-gcse-chemistry.rates",
      questionText: "Describe a method to measure the rate of reaction between acid and marble chips.",
      markScheme: ["Use gas syringe", "Measure volume vs time", "Control temperature", "Repeat and average"],
      maximumMarks: 4,
      commandWord: "describe",
      difficulty: 3,
      questionTypeTags: ["2-4-mark", "describe", "practical-method"],
      studentAnswer: "Collect gas in syringe, record volume every 30s, keep temp same, repeat.",
      humanMark1: 4,
      humanMark2: 3,
      adjudicatedMark: 4,
      source: "internally authored",
      reviewStatus: "adjudicated",
      abilityLevel: "intermediate",
    },
    {
      id: "dev-006-data-interpretation",
      questionId: "seed-q:dev-data",
      partId: "seed-q:dev-data:a",
      subject: "ocr-alevel-biology",
      specification: "H420",
      ...base,
      topic: "ocr-alevel-biology.genetics-inheritance",
      questionText: "Using the table, interpret the chi-squared value.",
      markScheme: ["Compare to critical value", "State significance", "Interpret null hypothesis"],
      maximumMarks: 3,
      commandWord: "compare",
      difficulty: 3,
      questionTypeTags: ["2-4-mark", "data-interpretation", "compare"],
      studentAnswer: "Chi-squared 5.2 > 3.84 so significant, reject null, genes are linked.",
      humanMark1: 2,
      humanMark2: 2,
      adjudicatedMark: 2,
      source: "internally authored",
      reviewStatus: "double-marked",
      abilityLevel: "higher",
    },
    {
      id: "dev-007-contradictory",
      questionId: "seed-q:dev-contradictory",
      partId: "seed-q:dev-contradictory:a",
      subject: "wjec-alevel-biology",
      specification: "A400QS",
      ...base,
      topic: "wjec-alevel-biology.respiration",
      questionText: "Explain why respiration is exothermic.",
      markScheme: ["Respiration releases energy", "Bonds formed > bonds broken overall"],
      maximumMarks: 2,
      commandWord: "explain",
      difficulty: 2,
      questionTypeTags: ["2-4-mark", "explain", "contradictory"],
      studentAnswer: "Respiration is exothermic so it takes in energy, but it also releases energy overall. Contradiction but energy is lost.",
      humanMark1: 0,
      humanMark2: 1,
      adjudicatedMark: 0,
      source: "internally authored",
      reviewStatus: "adjudicated",
      abilityLevel: "foundation",
      identifiedMisconceptions: ["conceptual"],
    },
    {
      id: "dev-008-irrelevant-but-correct",
      questionId: "seed-q:dev-irrelevant",
      partId: "seed-q:dev-irrelevant:a",
      subject: "aqa-gcse-physics",
      specification: "8463",
      ...base,
      topic: "aqa-gcse-physics.energy",
      questionText: "Calculate the kinetic energy of a 0.5 kg ball at 10 m/s.",
      markScheme: ["Use KE = 0.5 m v^2", "Answer 25 J"],
      maximumMarks: 2,
      commandWord: "calculate",
      difficulty: 1,
      questionTypeTags: ["2-4-mark", "calculation", "irrelevant-but-correct"],
      studentAnswer: "KE = 0.5*0.5*100 = 25 J. Also F=ma is important in physics.",
      humanMark1: 2,
      humanMark2: 2,
      adjudicatedMark: 2,
      source: "internally authored",
      reviewStatus: "double-marked",
      abilityLevel: "mixed",
    },
  ] as AnswerCorpusRecord[];
}
