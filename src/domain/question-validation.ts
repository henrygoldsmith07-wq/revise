import { requiresWjecContentReview } from "./physics-content-review";
import { validAttestationInstant, validOfficialWjecUrl, validSha256Digest } from "./trust-attestation";
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
import { toLocalDateKey } from "./local-date";

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
  return toLocalDateKey(date);
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
  if (requiresWjecContentReview(question.subjectId) && question.source === "past-paper") {
    const paper = question.paperProvenance;
    const validPaper = Boolean(paper && paper.status === "verified" && paper.board.toLowerCase() === "wjec" &&
      paper.paperId === question.paperId && paper.questionNumber === question.paperQuestionNumber &&
      paper.specification.trim() && validOfficialWjecUrl(paper.sourceUrl) && validSha256Digest(paper.sourceDigest) &&
      paper.verifiedBy && validAttestationInstant(paper.verifiedAt));
    if (!validPaper) addIssue(issues, "missing-paper-provenance", `${question.id}: WJEC past-paper questions need a verified official source manifest, digest and reviewer`);
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

// ---------------------------------------------------------------------------
// Generated-content depth checks. Deterministic warnings only — they never
// approve content and never replace qualified human review. Generated
// questions must still pass validateQuestion + two independent human
// approvals before they can become trusted.
// ---------------------------------------------------------------------------

function addWarning(
  issues: QuestionValidationIssue[],
  code: QuestionValidationIssue["code"],
  message: string,
): void {
  issues.push({ code, message, severity: "warning" });
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordOverlap(a: string, b: string): number {
  const aw = new Set(normalise(a).split(" ").filter(Boolean));
  const bw = new Set(normalise(b).split(" ").filter(Boolean));
  if (!aw.size || !bw.size) return 0;
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared += 1;
  return shared / Math.max(aw.size, bw.size);
}

/**
 * Extra deterministic gates for generated questions: spec alignment, mark
 * allocation, answerability, duplicate similarity, difficulty, AO mapping,
 * ambiguity and factual consistency. All findings are warnings; `ok` still
 * depends only on the error-level structural checks above.
 */
export function validateGeneratedContent(
  question: Question,
  topics: readonly Topic[] = [],
  bank: readonly Question[] = [],
): QuestionValidationIssue[] {
  const warnings: QuestionValidationIssue[] = [];
  if (question.origin !== "ai" && question.source !== "generated") return warnings;

  // Spec alignment: generated questions must map to at least one spec point
  // with learning claims, otherwise they cannot be trusted for assessment.
  const mapped = mappedSpecPointIds(question);
  if (mapped.size === 0) {
    addWarning(warnings, "weak-spec-alignment", `${question.id}: generated question has no spec point mapping`);
  } else if (topics.length) {
    const known = new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id)));
    if ([...mapped].every((id) => !known.has(id))) {
      addWarning(warnings, "weak-spec-alignment", `${question.id}: spec mapping matches no known statement`);
    }
  }
  for (const part of question.parts) {
    if ((part.learningClaims ?? []).filter((c) => c.trim()).length === 0) {
      addWarning(warnings, "weak-spec-alignment", `${question.id}/${part.id}: no learning claim for the mark scheme`);
    }
  }

  // Mark allocation: one claim may earn several marks, but every mark should
  // trace to an explicit scheme point.
  for (const part of question.parts) {
    if (part.markScheme.length > 0 && part.markScheme.length < part.marks) {
      addWarning(warnings, "mark-allocation-mismatch", `${question.id}/${part.id}: ${part.marks} marks but only ${part.markScheme.length} scheme points`);
    }
  }

  // Answerability: a model answer must exist and reference the scheme.
  for (const part of question.parts) {
    const answer = (part.modelAnswer ?? "").trim();
    if (answer.length < 12) {
      addWarning(warnings, "unanswerable", `${question.id}/${part.id}: model answer too short to be answerable`);
    }
  }

  // Duplicate similarity: near-identical stems to existing bank items.
  for (const other of bank) {
    if (other.id === question.id) continue;
    if (other.subjectId !== question.subjectId) continue;
    if (wordOverlap(question.stem, other.stem) >= 0.82) {
      addWarning(warnings, "duplicate-similar", `${question.id}: very similar to ${other.id}; reskins never count as proof`);
      break;
    }
  }

  // Difficulty: 1-mark recall should not claim level 5 and vice versa.
  if (question.totalMarks <= 2 && question.difficulty >= 4) {
    addWarning(warnings, "difficulty-mismatch", `${question.id}: low marks with high difficulty claim`);
  }
  if (question.totalMarks >= 6 && question.difficulty <= 1) {
    addWarning(warnings, "difficulty-mismatch", `${question.id}: high marks with low difficulty claim`);
  }

  // AO mapping: every part needs an explicit AO; generated content often omits AO3.
  for (const part of question.parts) {
    if (!part.aos?.length) {
      addWarning(warnings, "ao-mapping-gap", `${question.id}/${part.id}: no AO mapping`);
    }
  }

  // Ambiguity: hedged prompts ("maybe", "etc.", "something like") need review.
  if (/\b(maybe|etc\.|something like|and so on|various)\b/i.test(question.stem)) {
    addWarning(warnings, "ambiguous-prompt", `${question.id}: prompt contains ambiguous phrasing`);
  }

  // Factual consistency: numbers in the model answer should appear in the
  // scheme or stem, otherwise the answer may contradict its own marks.
  for (const part of question.parts) {
    const numbers = (part.modelAnswer ?? "").match(/-?\d+(\.\d+)?/g) ?? [];
    const context = `${part.markScheme.join(" ")} ${question.stem}`;
    const stray = numbers.filter((n) => !context.includes(n));
    if (numbers.length >= 2 && stray.length >= 2) {
      addWarning(warnings, "factual-consistency-risk", `${question.id}/${part.id}: model answer numbers not traceable to the scheme`);
      break;
    }
  }

  return warnings;
}
