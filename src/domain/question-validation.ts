import type {
  Id,
  IsoDate,
  Attempt,
  Question,
  QuestionValidationIssue,
  QuestionValidationRecord,
  QuestionValidationStage,
  Topic,
} from "./types";
import { validateDistractorQuality } from "./distractor-quality";

export type QuestionValidationDecision = "validate" | "request_changes" | "reject";

export interface QuestionValidationCheckOptions {
  now?: Date;
  today?: IsoDate;
  staleAfterDays?: number;
  /** Optional MCQ responses used to validate distractor behaviour. */
  attempts?: Attempt[];
  /** Minimum valid responses before distractor distribution warnings are emitted. */
  minDistractorResponses?: number;
}

export interface QuestionValidationCreateOptions extends QuestionValidationCheckOptions {
  version?: string;
}

export interface QuestionValidationReviewOptions extends QuestionValidationCheckOptions {
  note?: string;
}

export interface QuestionValidationAuditOptions extends QuestionValidationCheckOptions {
  actorId?: Id;
}

const DEFAULT_STALE_DAYS = 365;

function at(options: { now?: Date }): Date {
  return options.now ?? new Date();
}

function dateOnly(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function addIssue(issues: QuestionValidationIssue[], code: QuestionValidationIssue["code"], message: string): void {
  issues.push({ code, message, severity: "error" });
}

function daysBetween(start: IsoDate, end: IsoDate): number | null {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.floor((endMs - startMs) / 86_400_000);
}

function mappedSpecPointIds(question: Question): Set<Id> {
  return new Set([
    ...(question.specPointIds ?? []),
    ...question.parts.flatMap((part) => part.specPointIds ?? []),
  ]);
}

function reportErrors(report: QuestionValidationRecord["report"]): string {
  return report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message)
    .slice(0, 3)
    .join("; ");
}

/**
 * Run the deterministic checks required before a question can enter review.
 * The optional topic list enables cross-reference checks without coupling this
 * module to a particular curriculum registry.
 */
export function validateQuestion(
  question: Question,
  topics: readonly Topic[] = [],
  options: QuestionValidationCheckOptions = {},
): QuestionValidationRecord["report"] {
  const checkedAt = at(options).toISOString();
  const today = options.today ?? dateOnly(at(options));
  const issues: QuestionValidationIssue[] = [];

  if (!question.stem.trim()) addIssue(issues, "missing-stem", `${question.id}: stem is required`);
  if (question.parts.length === 0) addIssue(issues, "missing-parts", `${question.id}: at least one part is required`);

  const totalPartMarks = question.parts.reduce((sum, part) => sum + part.marks, 0);
  if (!Number.isFinite(question.totalMarks) || question.totalMarks <= 0 || question.totalMarks !== totalPartMarks) {
    addIssue(issues, "invalid-total-marks", `${question.id}: totalMarks must equal the sum of part marks`);
  }

  for (const part of question.parts) {
    const invalid = [
      !part.prompt.trim(),
      !Number.isFinite(part.marks) || part.marks <= 0,
      part.markScheme.length === 0,
      !part.modelAnswer.trim(),
      !part.learningClaims?.some((claim) => claim.trim()),
    ].some(Boolean);
    if (invalid) addIssue(issues, "invalid-part", `${question.id}/${part.id}: prompt, marks, scheme, answer, and learning claims are required`);
    if (!part.aos?.length) addIssue(issues, "missing-aos", `${question.id}/${part.id}: at least one assessment objective is required`);
  }

  if (question.kind === "mcq") {
    const optionsValid = (question.options?.length ?? 0) >= 2 && question.options?.every((option) => option.trim());
    const indexValid = Number.isInteger(question.correctIndex)
      && question.correctIndex! >= 0
      && question.correctIndex! < (question.options?.length ?? 0);
    if (!optionsValid || !indexValid) addIssue(issues, "invalid-mcq", `${question.id}: MCQs need two options and a valid correctIndex`);
  }

  const distractorQuality = validateDistractorQuality({
    question,
    attempts: options.attempts,
    minResponses: options.minDistractorResponses,
  });
  issues.push(...distractorQuality.issues);

  if (question.topicIds.length === 0) addIssue(issues, "missing-topic", `${question.id}: at least one topic is required`);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  for (const topicId of question.topicIds) {
    const topic = topicById.get(topicId);
    if (!topic) {
      if (topics.length > 0) addIssue(issues, "unknown-topic", `${question.id}: unknown topic ${topicId}`);
      continue;
    }
    const mapped = mappedSpecPointIds(question);
    const topicSpecPointIds = new Set(topic.specPoints?.map((point) => point.id) ?? []);
    if (topicSpecPointIds.size > 0 && ![...mapped].some((id) => topicSpecPointIds.has(id))) {
      addIssue(issues, "unmapped-spec-point", `${question.id}: no mapped spec point belongs to ${topicId}`);
    }
  }

  const mapped = mappedSpecPointIds(question);
  if (mapped.size === 0) addIssue(issues, "missing-spec-points", `${question.id}: at least one spec point mapping is required`);
  if (!question.aos?.length && !question.parts.some((part) => (part.aos?.length ?? 0) > 0)) {
    addIssue(issues, "missing-aos", `${question.id}: at least one assessment objective is required`);
  }

  if (!question.source) addIssue(issues, "missing-provenance", `${question.id}: source is required`);
  if (!question.verification || question.verification === "unverified") {
    addIssue(issues, "unverified-provenance", `${question.id}: provenance must be checked before review`);
  }
  if (!question.specVersion?.trim()) addIssue(issues, "missing-spec-version", `${question.id}: specVersion is required`);
  if (!question.reviewer?.trim()) addIssue(issues, "missing-reviewer", `${question.id}: reviewer is required`);
  if (!question.lastChecked) addIssue(issues, "missing-last-checked", `${question.id}: lastChecked is required`);
  if (question.source === "licensed" && !question.licensedSource?.citation?.trim()) {
    addIssue(issues, "missing-licence", `${question.id}: licensed questions need a citation`);
  }
  if (question.lastChecked) {
    const age = daysBetween(question.lastChecked, today);
    if (age !== null && age > (options.staleAfterDays ?? DEFAULT_STALE_DAYS)) {
      addIssue(issues, "stale-provenance", `${question.id}: lastChecked ${question.lastChecked} is stale`);
    }
  }

  return {
    questionId: question.id,
    checkedAt,
    issues,
    ok: issues.every((issue) => issue.severity !== "error"),
    distractorQuality,
  };
}

export function createQuestionValidation(
  question: Question,
  options: QuestionValidationCreateOptions = {},
): QuestionValidationRecord {
  const now = at(options);
  const report = validateQuestion(question, [], options);
  const timestamp = now.toISOString();
  return {
    questionId: question.id,
    version: options.version ?? "1",
    stage: "draft",
    report,
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function withQuestionValidation(question: Question, validation: QuestionValidationRecord): Question {
  if (validation.questionId !== question.id) {
    throw new Error(`Cannot attach validation for ${validation.questionId} to ${question.id}`);
  }
  return { ...question, validation };
}

function recordFor(question: Question, options: QuestionValidationCreateOptions): QuestionValidationRecord {
  return question.validation ?? createQuestionValidation(question, options);
}

function transition(
  record: QuestionValidationRecord,
  to: QuestionValidationStage,
  by: Id,
  now: Date,
  report: QuestionValidationRecord["report"],
  note?: string,
): QuestionValidationRecord {
  return {
    ...record,
    stage: to,
    report,
    updatedAt: now.toISOString(),
    history: [...record.history, { from: record.stage, to, at: now.toISOString(), by, ...(note ? { note } : {}) }],
  };
}

export function submitQuestionForValidation(
  question: Question,
  topics: readonly Topic[] = [],
  actorId: Id,
  options: QuestionValidationCheckOptions = {},
): Question {
  const record = recordFor(question, options);
  if (record.stage !== "draft" && record.stage !== "needs_changes" && record.stage !== "rejected") {
    throw new Error(`Cannot submit question ${question.id} from ${record.stage}`);
  }
  const report = validateQuestion(question, topics, options);
  if (!report.ok) throw new Error(`Cannot submit question ${question.id} for validation: ${reportErrors(report)}`);
  const now = at(options);
  const next = transition(record, "in_review", actorId, now, report);
  return withQuestionValidation(question, {
    ...next,
    reviewerId: undefined,
    reviewedAt: undefined,
    submittedAt: now.toISOString(),
  });
}

export function reviewQuestionValidation(
  question: Question,
  topics: readonly Topic[] = [],
  decision: QuestionValidationDecision,
  reviewerId: Id,
  options: QuestionValidationReviewOptions = {},
): Question {
  const record = question.validation;
  if (!record) throw new Error(`Cannot review question ${question.id} without a validation record`);
  if (record.stage !== "in_review") throw new Error(`Cannot review question ${question.id} from ${record.stage}`);

  const report = validateQuestion(question, topics, options);
  if (decision === "validate" && !report.ok) {
    throw new Error(`Cannot validate question ${question.id}: ${reportErrors(report)}`);
  }
  const to: QuestionValidationStage = decision === "validate"
    ? "validated"
    : decision === "request_changes" ? "needs_changes" : "rejected";
  const now = at(options);
  const next = transition(record, to, reviewerId, now, report, options.note);
  return withQuestionValidation(question, {
    ...next,
    reviewerId,
    reviewedAt: now.toISOString(),
  });
}

export function auditQuestionValidation(
  question: Question,
  topics: readonly Topic[] = [],
  options: QuestionValidationAuditOptions = {},
): Question {
  const record = recordFor(question, options);
  const report = validateQuestion(question, topics, options);
  const now = at(options);
  if (record.stage === "validated" && !report.ok) {
    return withQuestionValidation(question, transition(
      record,
      "needs_changes",
      options.actorId ?? "system",
      now,
      report,
      "Automatic revalidation found content or provenance gaps.",
    ));
  }
  return withQuestionValidation(question, { ...record, report, updatedAt: now.toISOString() });
}

export function retireQuestionValidation(
  question: Question,
  actorId: Id,
  options: { now?: Date } = {},
): Question {
  const record = question.validation;
  if (!record) throw new Error(`Cannot retire question ${question.id} without a validation record`);
  if (record.stage !== "validated" && record.stage !== "needs_changes" && record.stage !== "rejected") {
    throw new Error(`Cannot retire question ${question.id} from ${record.stage}`);
  }
  const now = at(options);
  return withQuestionValidation(question, transition(record, "retired", actorId, now, record.report));
}

export function isQuestionValidated(question: Question): boolean {
  return question.validation?.stage === "validated" && question.validation.report.ok;
}
