import type { Id, Question } from "./types";

export interface HumanMarkingCorpusRow {
  id: Id;
  question: Question;
  answers: Record<Id, string>;
  /** Human/examiner award for each question part, in part order. */
  humanAwards: readonly number[];
  label: string;
}

export interface HumanMarkingCorpus {
  id: Id;
  version: string;
  description: string;
  /** Internal regression fixture: no learner-identifying data is included. */
  provenance: "teacher/examiner-labelled internal fixture";
  rows: readonly HumanMarkingCorpusRow[];
}

export interface HumanMarkingCorpusValidation {
  ok: boolean;
  issues: string[];
}

export interface HumanMarkingEvaluation {
  marked: ReadonlyArray<{ awarded: number }>;
  awarded?: number;
}

export type HumanMarkingEvaluator = (question: Question, answers: Record<Id, string>) => HumanMarkingEvaluation;

export interface HumanMarkingCorpusRowResult {
  rowId: Id;
  label: string;
  humanAwards: readonly number[];
  predictedAwards: number[];
  humanTotal: number;
  predictedTotal: number;
  partMae: number;
  exact: boolean;
}

export interface HumanMarkingCorpusReport {
  corpusId: Id;
  corpusVersion: string;
  rowCount: number;
  exactCount: number;
  exactMatchAccuracy: number;
  perPartMae: number;
  totalMae: number;
  rows: HumanMarkingCorpusRowResult[];
}

export const HUMAN_MARKING_CORPUS_FLOOR = {
  minExactMatchAccuracy: 0.5,
  maxPerPartMae: 0.8,
} as const;

function probeQuestion(): Question {
  return {
    id: "seed-q:probe",
    subjectId: "wjec-alevel-chemistry",
    topicIds: ["wjec-alevel-chemistry.moles"],
    kind: "structured",
    stem: "Probe",
    parts: [
      {
        id: "seed-q:probe:0",
        label: "(a)",
        prompt: "Calculate the concentration",
        marks: 2,
        markScheme: ["Uses n=cV with correct units", "Answer 0.25 mol dm-3 (accept 0.24-0.26)"],
        modelAnswer: "n=cV",
        aos: ["AO2"],
        specPointIds: ["wjec-alevel-chemistry.moles.sp-01"],
        learningClaims: ["perform calculations using n=cV"],
      },
      {
        id: "seed-q:probe:1",
        label: "(b)",
        prompt: "Explain the trend",
        marks: 2,
        markScheme: ["References increased nuclear charge and similar shielding", "Links to first ionisation energy"],
        modelAnswer: "Trend",
        aos: ["AO1"],
        specPointIds: ["wjec-alevel-chemistry.atomic-structure.sp-01"],
        learningClaims: ["explain ionisation trends"],
      },
    ],
    totalMarks: 4,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    source: "authored",
    verification: "checked",
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function algebraQuestion(): Question {
  return {
    id: "seed-q:algebra",
    subjectId: "aqa-gcse-maths",
    topicIds: ["aqa-gcse-maths.algebra"],
    kind: "structured",
    stem: "Expand (x+2)(x-3).",
    parts: [
      {
        id: "seed-q:algebra:0",
        label: "(a)",
        prompt: "Expand (x+2)(x-3).",
        marks: 3,
        markScheme: ["Expands the brackets", "Collects like terms", "x^2 - x - 6"],
        modelAnswer: "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6",
        learningClaims: ["expands two linear brackets", "collects like terms", "states the simplified quadratic"],
        aos: ["AO2"],
        specPointIds: ["aqa-gcse-maths.algebra.sp-01"],
      },
    ],
    totalMarks: 3,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    source: "authored",
    verification: "checked",
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

export const HUMAN_MARKING_CORPUS: HumanMarkingCorpus = {
  id: "revise-human-marking",
  version: "2026.08.v1",
  description: "Small teacher/examiner-labelled regression corpus for offline marking checks.",
  provenance: "teacher/examiner-labelled internal fixture",
  rows: [
    {
      id: "chemistry-complete-correct",
      question: probeQuestion(),
      answers: {
        "seed-q:probe:0": "n=cV, so n = 0.25 mol dm-3.",
        "seed-q:probe:1": "Nuclear charge increases and shielding is similar, so first ionisation energy increases.",
      },
      humanAwards: [2, 2],
      label: "complete, correct response",
    },
    {
      id: "chemistry-blank",
      question: probeQuestion(),
      answers: {},
      humanAwards: [0, 0],
      label: "blank script",
    },
    {
      id: "chemistry-answer-only",
      question: probeQuestion(),
      answers: { "seed-q:probe:0": "0.25", "seed-q:probe:1": "" },
      humanAwards: [1, 0],
      label: "answer only, no method",
    },
    {
      id: "chemistry-method-only",
      question: probeQuestion(),
      answers: { "seed-q:probe:0": "I used n = c × V", "seed-q:probe:1": "" },
      humanAwards: [1, 0],
      label: "method shown, no final answer",
    },
    {
      id: "chemistry-explanation-only",
      question: probeQuestion(),
      answers: {
        "seed-q:probe:0": "",
        "seed-q:probe:1": "More nuclear charge, less shielding, so ionisation energy goes up.",
      },
      humanAwards: [0, 2],
      label: "explanation only",
    },
    {
      id: "chemistry-wrong-content",
      question: probeQuestion(),
      answers: { "seed-q:probe:0": "The sky is blue", "seed-q:probe:1": "The sky is blue" },
      humanAwards: [0, 0],
      label: "wrong content",
    },
    {
      id: "algebra-final-answer-only",
      question: algebraQuestion(),
      answers: { "seed-q:algebra:0": "x^2 - x - 6" },
      humanAwards: [1],
      label: "final answer only, no working",
    },
    {
      id: "algebra-restated-question",
      question: algebraQuestion(),
      answers: { "seed-q:algebra:0": "(x+2)(x-3)" },
      humanAwards: [0],
      label: "restates the question (factored form) — documents rubric generosity",
    },
    {
      id: "algebra-sign-error-final",
      question: algebraQuestion(),
      answers: { "seed-q:algebra:0": "x^2 + x - 6" },
      humanAwards: [0],
      label: "wrong final expression, sign error",
    },
    {
      id: "algebra-full-working",
      question: algebraQuestion(),
      answers: {
        "seed-q:algebra:0": "(x+2)(x-3)\n= x^2 - 3x + 2x - 6\n= x^2 - x - 6",
      },
      humanAwards: [3],
      label: "full correct working",
    },
    {
      id: "algebra-sign-error-mid-working",
      question: algebraQuestion(),
      answers: {
        "seed-q:algebra:0": "(x+2)(x-3)\n= x^2 + 3x + 2x - 6\n= x^2 + x - 6",
      },
      humanAwards: [1],
      label: "sign error mid-working, wrong final",
    },
    {
      id: "algebra-blank",
      question: algebraQuestion(),
      answers: { "seed-q:algebra:0": "" },
      humanAwards: [0],
      label: "blank script",
    },
  ],
};

export function validateHumanMarkingCorpus(corpus: HumanMarkingCorpus): HumanMarkingCorpusValidation {
  const issues: string[] = [];
  const seenIds = new Set<Id>();
  if (!corpus.id.trim()) issues.push("corpus id is required");
  if (!corpus.version.trim()) issues.push("corpus version is required");
  if (!corpus.rows.length) issues.push("corpus must contain at least one row");

  for (const row of corpus.rows) {
    if (seenIds.has(row.id)) issues.push(`duplicate row id: ${row.id}`);
    seenIds.add(row.id);
    if (row.humanAwards.length !== row.question.parts.length) {
      issues.push(`${row.id}: human awards must match question part count`);
    }
    for (const [index, part] of row.question.parts.entries()) {
      const award = row.humanAwards[index];
      if (!Number.isFinite(award) || award < 0 || award > part.marks) {
        issues.push(`${row.id}: award for part ${index} is outside the part mark range`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

export function scoreHumanMarkingCorpus(
  corpus: HumanMarkingCorpus,
  evaluator: HumanMarkingEvaluator,
): HumanMarkingCorpusReport {
  const rows = corpus.rows.map((row): HumanMarkingCorpusRowResult => {
    const evaluation = evaluator(row.question, row.answers);
    const predictedAwards = evaluation.marked.map((part) => part.awarded);
    const partCount = Math.max(row.humanAwards.length, predictedAwards.length);
    const partMae = partCount
      ? Array.from({ length: partCount }, (_, index) => Math.abs((predictedAwards[index] ?? 0) - (row.humanAwards[index] ?? 0)))
        .reduce((sum, error) => sum + error, 0) / partCount
      : 0;
    const humanTotal = total(row.humanAwards);
    const predictedTotal = Number.isFinite(evaluation.awarded)
      ? evaluation.awarded!
      : total(predictedAwards);
    return {
      rowId: row.id,
      label: row.label,
      humanAwards: row.humanAwards,
      predictedAwards,
      humanTotal,
      predictedTotal,
      partMae,
      exact: predictedTotal === humanTotal,
    };
  });
  const rowCount = rows.length;
  const exactCount = rows.filter((row) => row.exact).length;
  return {
    corpusId: corpus.id,
    corpusVersion: corpus.version,
    rowCount,
    exactCount,
    exactMatchAccuracy: rowCount ? exactCount / rowCount : 0,
    perPartMae: rowCount ? rows.reduce((sum, row) => sum + row.partMae, 0) / rowCount : 0,
    totalMae: rowCount ? rows.reduce((sum, row) => sum + Math.abs(row.predictedTotal - row.humanTotal), 0) / rowCount : 0,
    rows,
  };
}

export function passesHumanMarkingFloor(
  report: HumanMarkingCorpusReport,
  floor = HUMAN_MARKING_CORPUS_FLOOR,
): boolean {
  return report.exactMatchAccuracy >= floor.minExactMatchAccuracy && report.perPartMae <= floor.maxPerPartMae;
}
