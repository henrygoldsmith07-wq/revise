// ---------------------------------------------------------------------------
// Deterministic quality gates for AI-generated and AI-extracted questions.
//
// A generated question that parses against the response schema is only
// well-formed, not good. These gates check what can be checked without a
// model: that the marks add up, that the question's own model answer earns
// its marks under the deterministic marker, that numbers agree, that it is
// on the topic's specification, that it is not a reworded duplicate, that the
// command word and difficulty make sense, and that its provenance says
// exactly what it is.
//
// Passing every gate does NOT make a question trusted. Generated content is
// always saved as unverified, with no reviewer, no human-verification record
// and no validation stage beyond "not yet reviewed"; only the existing human
// review workflow (domain/content-trust.ts, a fingerprinted
// HumanVerificationRecord) can ever change that. `withGeneratedProvenance`
// enforces the ceiling, and the provenance gate refuses anything that
// claims more.
//
// Pure: no React, no network, no storage.
// ---------------------------------------------------------------------------

import { commandWordForPart, validateCommandWord } from "./command-word-validation";
import { markQuestion } from "./marking";
import { contentTokens, textOverload } from "./text-similarity";
import type { GeneratedQuestionQualityRecord, Question, Topic } from "./types";

export const GENERATED_QUALITY_VERSION = "generated-quality-v1";

export type QualityGateId =
  | "provenance"
  | "mark-allocation"
  | "model-answer-coverage"
  | "numerical-consistency"
  | "duplicate"
  | "difficulty-metadata"
  | "command-word"
  | "spec-alignment"
  | "learning-objective";

export interface QualityGateResult {
  id: QualityGateId;
  passed: boolean;
  /** A failing blocking gate rejects the question; a failing warning gate only labels it. */
  blocking: boolean;
  detail: string;
}

export type GeneratedOrigin = "generated" | "extracted";

export interface GeneratedQuestionQuality {
  version: string;
  decision: "accept" | "accept-with-warnings" | "reject";
  gates: QualityGateResult[];
}

/** Similarity at or above which a question counts as a reworded duplicate. */
export const DUPLICATE_THRESHOLD = 0.9;
/** Share of a part's marks the model answer must earn under deterministic marking. */
export const MODEL_ANSWER_COVERAGE = 0.8;
/** Below this share the model answer and mark scheme plainly contradict each other. */
export const MODEL_ANSWER_COVERAGE_FLOOR = 0.5;
/** Share of the question's content words that must appear in the topic's specification content. */
export const SPEC_ALIGNMENT_WARN = 0.15;
export const SPEC_ALIGNMENT_FLOOR = 0.05;

type TopicContext = Pick<Topic, "title" | "summary" | "keyPoints"> & Partial<Pick<Topic, "specPoints" | "commonErrors">>;

function questionText(question: Pick<Question, "stem" | "parts">): string {
  return [question.stem, ...question.parts.map((p) => p.prompt)].join(" ");
}

function numbersIn(text: string): number[] {
  const matches = text.replace(/,(?=\d{3}\b)/g, "").match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

function sameNumber(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && Math.abs(a - b) / scale <= 0.01;
}

/**
 * Pin the provenance of generated or extracted content to "unverified
 * machine output". Any trust field a model or a caller might have set is
 * removed; nothing here can make content look reviewed.
 */
export function withGeneratedProvenance(question: Question, origin: GeneratedOrigin): Question {
  const {
    humanVerification: _humanVerification,
    validation: _validation,
    reviewer: _reviewer,
    lastChecked: _lastChecked,
    licensedSource: _licensedSource,
    paperProvenance: _paperProvenance,
    ...rest
  } = question;
  void _humanVerification;
  void _validation;
  void _reviewer;
  void _lastChecked;
  void _licensedSource;
  void _paperProvenance;
  return {
    ...rest,
    origin: origin === "generated" ? "ai" : "past-paper",
    source: origin === "generated" ? "generated" : "import",
    verification: "unverified",
  };
}

/** True when nothing on the question claims more trust than unverified machine output. */
export function generatedProvenanceIsHonest(question: Question, origin: GeneratedOrigin): boolean {
  return (
    question.verification === "unverified" &&
    question.source === (origin === "generated" ? "generated" : "import") &&
    !question.humanVerification &&
    !question.validation &&
    !question.reviewer &&
    !question.licensedSource &&
    !question.paperProvenance
  );
}

export function assessGeneratedQuestion(input: {
  question: Question;
  origin: GeneratedOrigin;
  topic: TopicContext | null;
  /** Questions already in the bank (and earlier ones in the same batch) for duplicate detection. */
  existing: readonly Pick<Question, "id" | "stem" | "parts">[];
}): GeneratedQuestionQuality {
  const { question, origin, topic } = input;
  const gates: QualityGateResult[] = [];
  const isMcq = question.kind === "mcq";

  // 1. Provenance: generated content never claims review it has not had.
  const honest = generatedProvenanceIsHonest(question, origin);
  gates.push({
    id: "provenance",
    passed: honest,
    blocking: true,
    detail: honest
      ? "Saved as unverified machine output; only human review can change that."
      : "The question claims a review or verification status that generated content cannot have.",
  });

  // 2. Mark allocation.
  const partProblems: string[] = [];
  if (!question.parts.length) partProblems.push("no parts");
  for (const part of question.parts) {
    if (!Number.isInteger(part.marks) || part.marks < 1) partProblems.push(`part ${part.label || part.id} has no whole-number tariff`);
    if (!isMcq && part.markScheme.length < part.marks && origin === "generated") {
      partProblems.push(`part ${part.label || part.id} has ${part.marks} marks but ${part.markScheme.length} mark-scheme points`);
    }
  }
  const sum = question.parts.reduce((a, p) => a + p.marks, 0);
  if (sum !== question.totalMarks) partProblems.push(`parts add up to ${sum}, not ${question.totalMarks}`);
  if (isMcq) {
    const options = question.options ?? [];
    const distinct = new Set(options.map((o) => o.trim().toLowerCase()));
    if (options.length < 2) partProblems.push("a multiple-choice question needs at least two options");
    if (distinct.size !== options.length) partProblems.push("options repeat");
    if (question.correctIndex == null || question.correctIndex < 0 || question.correctIndex >= options.length) {
      partProblems.push("the correct option is missing or out of range");
    }
  }
  gates.push({
    id: "mark-allocation",
    passed: partProblems.length === 0,
    blocking: true,
    detail: partProblems.length ? `Mark allocation is inconsistent: ${partProblems.join("; ")}.` : "Marks add up and every mark has a mark-scheme point.",
  });

  // 3. Model-answer coverage: the question's own model answer, marked by the
  //    deterministic marker against its own scheme, must earn its marks.
  if (!isMcq && question.parts.length) {
    const answers = Object.fromEntries(question.parts.map((p) => [p.id, p.modelAnswer ?? ""]));
    let coverage = 1;
    try {
      const marked = markQuestion(question, answers).marked;
      const earned = marked.reduce((a, m) => a + m.awarded, 0);
      coverage = sum > 0 ? earned / sum : 0;
    } catch {
      coverage = 0;
    }
    const passed = coverage >= MODEL_ANSWER_COVERAGE;
    gates.push({
      id: "model-answer-coverage",
      passed,
      blocking: origin === "generated" && coverage < MODEL_ANSWER_COVERAGE_FLOOR,
      detail: passed
        ? "The model answer earns its marks against its own mark scheme."
        : `The model answer earns only ${Math.round(coverage * 100)}% of the marks against its own mark scheme.`,
    });
  }

  // 4. Numerical consistency: a calculation's model answer and mark scheme
  //    must agree on at least one value, and a calculation needs numbers.
  if (!isMcq) {
    const problems: string[] = [];
    for (const part of question.parts) {
      const schemeNumbers = numbersIn(part.markScheme.join(" "));
      const answerNumbers = numbersIn(part.modelAnswer ?? "");
      const isCalculation = question.kind === "calculation" || /\bcalculate\b|\bshow that\b|\bdetermine\b/i.test(part.prompt);
      if (isCalculation && !answerNumbers.length) problems.push(`part ${part.label || part.id} is a calculation with no numerical answer`);
      if (schemeNumbers.length && answerNumbers.length && !answerNumbers.some((a) => schemeNumbers.some((s) => sameNumber(a, s)))) {
        problems.push(`part ${part.label || part.id}: the model answer's values do not appear in the mark scheme`);
      }
    }
    gates.push({
      id: "numerical-consistency",
      passed: problems.length === 0,
      blocking: question.kind === "calculation" && problems.length > 0,
      detail: problems.length ? `${problems.join("; ")}.` : "Values in the model answer agree with the mark scheme.",
    });
  }

  // 5. Duplicate / near-duplicate detection (value-stripped, so number swaps count).
  const text = questionText(question);
  let closest = 0;
  for (const other of input.existing) {
    if (other.id === question.id) continue;
    closest = Math.max(closest, textOverload(text, questionText(other)));
    if (closest >= DUPLICATE_THRESHOLD) break;
  }
  gates.push({
    id: "duplicate",
    passed: closest < DUPLICATE_THRESHOLD,
    blocking: true,
    detail: closest >= DUPLICATE_THRESHOLD ? "This is a reworded copy of a question already in the bank." : "Not a duplicate of an existing question.",
  });

  // 6. Difficulty metadata.
  const difficultyValid = Number.isInteger(question.difficulty) && question.difficulty >= 1 && question.difficulty <= 5;
  const implausible = difficultyValid && ((sum >= 8 && question.difficulty === 1) || (sum <= 1 && question.difficulty === 5));
  gates.push({
    id: "difficulty-metadata",
    passed: difficultyValid && !implausible,
    blocking: !difficultyValid,
    detail: !difficultyValid
      ? "Difficulty is missing or outside 1–5."
      : implausible
        ? `A ${sum}-mark question rated difficulty ${question.difficulty} looks mis-rated.`
        : "Difficulty is recorded and plausible for the tariff.",
  });

  // 7. Command-word alignment: each written part starts from a recognised
  //    command word, and its model answer has the shape that word demands.
  if (!isMcq) {
    const problems: string[] = [];
    for (const part of question.parts) {
      const command = commandWordForPart(question, part);
      if (command === "other") {
        problems.push(`part ${part.label || part.id} has no recognised command word`);
        continue;
      }
      const shape = validateCommandWord(question, part, part.modelAnswer ?? "");
      if (shape.status === "needs-attention") problems.push(`part ${part.label || part.id}'s model answer does not match "${shape.label}"`);
    }
    gates.push({
      id: "command-word",
      passed: problems.length === 0,
      blocking: false,
      detail: problems.length ? `${problems.join("; ")}.` : "Command words are clear and the model answers match them.",
    });
  }

  // 8 & 9. Specification and learning-objective alignment against the topic.
  if (topic) {
    const corpus = [topic.title, topic.summary, ...topic.keyPoints, ...(topic.specPoints ?? []).map((sp) => sp.text)].join(" ");
    const corpusTokens = contentTokens(corpus);
    const qTokens = contentTokens([text, ...question.parts.flatMap((p) => p.markScheme)].join(" "));
    let shared = 0;
    for (const token of qTokens) if (corpusTokens.has(token)) shared++;
    const alignment = qTokens.size ? shared / qTokens.size : 0;
    gates.push({
      id: "spec-alignment",
      passed: alignment >= SPEC_ALIGNMENT_WARN,
      // Extracted questions are mapped to topics heuristically, so a weak match
      // there may be a mapping problem rather than an off-topic question.
      blocking: origin === "generated" && alignment < SPEC_ALIGNMENT_FLOOR,
      detail:
        alignment >= SPEC_ALIGNMENT_WARN
          ? "The question uses this topic's specification content."
          : alignment < SPEC_ALIGNMENT_FLOOR
            ? "The question does not appear to be about this topic's specification content."
            : "The question only loosely matches this topic's specification content.",
    });

    const objectives = [...topic.keyPoints, ...(topic.specPoints ?? []).map((sp) => sp.text)].map((o) => contentTokens(o));
    const assessesObjective = question.parts.some((part) =>
      part.markScheme.some((point) => {
        const tokens = contentTokens(point);
        return objectives.some((objective) => {
          let overlap = 0;
          for (const token of tokens) if (objective.has(token)) overlap++;
          return overlap >= 2;
        });
      }),
    );
    gates.push({
      id: "learning-objective",
      passed: assessesObjective,
      blocking: false,
      detail: assessesObjective
        ? "At least one mark rewards a key point of the topic."
        : "No mark clearly rewards one of the topic's key points.",
    });
  }

  const failed = gates.filter((g) => !g.passed);
  const decision = failed.some((g) => g.blocking) ? "reject" : failed.length ? "accept-with-warnings" : "accept";
  return { version: GENERATED_QUALITY_VERSION, decision, gates };
}

/** The durable record stored on an accepted question. Rejected questions are not saved. */
export function generatedQualityRecord(
  quality: GeneratedQuestionQuality,
  origin: GeneratedOrigin,
  checkedAt: string,
): GeneratedQuestionQualityRecord | null {
  if (quality.decision === "reject") return null;
  return {
    version: quality.version,
    origin,
    decision: quality.decision,
    failedGates: quality.gates.filter((g) => !g.passed).map((g) => g.id),
    checkedAt,
  };
}

/**
 * Gate a batch: provenance is pinned first, each question is checked against
 * the bank and against the questions accepted before it in the same batch,
 * and only accepted questions are returned (with their quality record).
 */
export function gateGeneratedQuestions(input: {
  questions: readonly Question[];
  origin: GeneratedOrigin;
  topicFor: (question: Question) => TopicContext | null;
  bank: readonly Pick<Question, "id" | "stem" | "parts">[];
  checkedAt: string;
}): { accepted: Question[]; rejected: { question: Question; quality: GeneratedQuestionQuality }[] } {
  const accepted: Question[] = [];
  const rejected: { question: Question; quality: GeneratedQuestionQuality }[] = [];
  for (const raw of input.questions) {
    const question = withGeneratedProvenance(raw, input.origin);
    const quality = assessGeneratedQuestion({
      question,
      origin: input.origin,
      topic: input.topicFor(question),
      existing: [...input.bank, ...accepted],
    });
    const record = generatedQualityRecord(quality, input.origin, input.checkedAt);
    if (record) accepted.push({ ...question, generationQuality: record });
    else rejected.push({ question, quality });
  }
  return { accepted, rejected };
}
