import {
  applyHumanVerification,
  humanVerificationIssues,
  physicsContentFingerprint,
  requiresWjecContentReview,
} from "./physics-content-review";
import type { HumanVerificationRecord, Id, Question } from "./types";

export const WJEC_HUMAN_VERIFICATION_LEDGER_VERSION = 1 as const;

export interface HumanVerificationLedgerEntry {
  questionId: Id;
  subjectId: Id;
  contentFingerprint: string;
  review: HumanVerificationRecord;
}

export interface HumanVerificationLedgerFile {
  formatVersion: typeof WJEC_HUMAN_VERIFICATION_LEDGER_VERSION;
  entries: HumanVerificationLedgerEntry[];
}

export interface HumanVerificationLedgerIssue {
  key: string;
  kind:
    | "duplicate-entry"
    | "invalid-entry"
    | "unknown-question"
    | "subject-mismatch"
    | "historical-fingerprint"
    | "invalid-current-approval";
  detail: string;
  blocking: boolean;
}

export interface HumanVerificationLedgerApplication {
  questions: Question[];
  appliedKeys: string[];
  historicalKeys: string[];
  issues: HumanVerificationLedgerIssue[];
}

export function humanVerificationLedgerKey(questionId: Id, contentFingerprint: string): string {
  return `${questionId}::${contentFingerprint}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isReview(value: unknown): value is HumanVerificationRecord {
  if (!isObject(value) || !isObject(value.checks)) return false;
  return value.status === "pending" || value.status === "approved" || value.status === "changes-requested";
}

export function parseHumanVerificationLedger(value: unknown): {
  file: HumanVerificationLedgerFile;
  issues: HumanVerificationLedgerIssue[];
} {
  const issues: HumanVerificationLedgerIssue[] = [];
  if (!isObject(value) || value.formatVersion !== WJEC_HUMAN_VERIFICATION_LEDGER_VERSION || !Array.isArray(value.entries)) {
    return {
      file: { formatVersion: WJEC_HUMAN_VERIFICATION_LEDGER_VERSION, entries: [] },
      issues: [{
        key: "ledger",
        kind: "invalid-entry",
        detail: "Ledger must be a version-1 object with an entries array.",
        blocking: true,
      }],
    };
  }

  const entries: HumanVerificationLedgerEntry[] = [];
  const seen = new Set<string>();
  for (const [index, row] of value.entries.entries()) {
    const fallbackKey = `row-${index + 1}`;
    if (!isObject(row) || !nonEmptyText(row.questionId) || !nonEmptyText(row.subjectId) ||
      !nonEmptyText(row.contentFingerprint) || !isReview(row.review)) {
      issues.push({
        key: fallbackKey,
        kind: "invalid-entry",
        detail: "Entry needs questionId, subjectId, contentFingerprint and a review record.",
        blocking: true,
      });
      continue;
    }
    const entry = {
      questionId: row.questionId,
      subjectId: row.subjectId,
      contentFingerprint: row.contentFingerprint,
      review: row.review,
    } satisfies HumanVerificationLedgerEntry;
    const key = humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint);
    if (seen.has(key)) {
      issues.push({
        key,
        kind: "duplicate-entry",
        detail: "Ledger contains the same question/fingerprint attestation more than once.",
        blocking: true,
      });
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }

  return {
    file: { formatVersion: WJEC_HUMAN_VERIFICATION_LEDGER_VERSION, entries },
    issues,
  };
}

/**
 * Apply only attestations that match the exact current content fingerprint.
 * Older fingerprints remain in the ledger as audit history but cannot make the
 * edited question trusted.
 */
export function applyHumanVerificationLedger(
  questions: readonly Question[],
  rawLedger: unknown,
): HumanVerificationLedgerApplication {
  const parsed = parseHumanVerificationLedger(rawLedger);
  const issues = [...parsed.issues];
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  const currentEntries = new Map<Id, HumanVerificationLedgerEntry>();
  const historicalKeys: string[] = [];

  for (const entry of parsed.file.entries) {
    const key = humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint);
    const question = byId.get(entry.questionId);
    if (!question) {
      historicalKeys.push(key);
      issues.push({
        key,
        kind: "unknown-question",
        detail: "Question is no longer present in the current bank; attestation is retained as history only.",
        blocking: false,
      });
      continue;
    }
    if (question.subjectId !== entry.subjectId) {
      issues.push({
        key,
        kind: "subject-mismatch",
        detail: `Ledger subject ${entry.subjectId} does not match current question subject ${question.subjectId}.`,
        blocking: true,
      });
      continue;
    }
    const currentFingerprint = physicsContentFingerprint(question);
    if (currentFingerprint !== entry.contentFingerprint) {
      historicalKeys.push(key);
      issues.push({
        key,
        kind: "historical-fingerprint",
        detail: "Attestation belongs to an older content fingerprint and is not applied.",
        blocking: false,
      });
      continue;
    }
    if (!requiresWjecContentReview(question.subjectId)) {
      issues.push({
        key,
        kind: "invalid-current-approval",
        detail: "Ledger approval targets a subject outside the WJEC flagship trust gate.",
        blocking: true,
      });
      continue;
    }
    const trustIssues = humanVerificationIssues(question, entry.review);
    if (trustIssues.length) {
      issues.push({
        key,
        kind: "invalid-current-approval",
        detail: `Current approval fails the canonical trust contract: ${trustIssues.join(", ")}.`,
        blocking: true,
      });
      continue;
    }
    if (entry.review.contentFingerprint !== entry.contentFingerprint) {
      issues.push({
        key,
        kind: "invalid-current-approval",
        detail: "Review fingerprint and ledger key fingerprint disagree.",
        blocking: true,
      });
      continue;
    }
    currentEntries.set(entry.questionId, entry);
  }

  const appliedKeys: string[] = [];
  const nextQuestions = questions.map((question) => {
    const entry = currentEntries.get(question.id);
    if (!entry) return question;
    appliedKeys.push(humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint));
    return applyHumanVerification(question, entry.review);
  });

  return { questions: nextQuestions, appliedKeys, historicalKeys, issues };
}

export function buildHumanVerificationLedgerEntry(question: Question): HumanVerificationLedgerEntry {
  const review = question.humanVerification;
  const trustIssues = humanVerificationIssues(question, review);
  if (!review || trustIssues.length) {
    throw new Error(`Question ${question.id} is not eligible for the human-verification ledger: ${trustIssues.join(", ") || "missing review"}`);
  }
  const contentFingerprint = physicsContentFingerprint(question);
  return { questionId: question.id, subjectId: question.subjectId, contentFingerprint, review: { ...review, contentFingerprint } };
}

export function mergeHumanVerificationLedger(
  rawLedger: unknown,
  additions: readonly HumanVerificationLedgerEntry[],
): HumanVerificationLedgerFile {
  const parsed = parseHumanVerificationLedger(rawLedger);
  const blocking = parsed.issues.filter((issue) => issue.blocking);
  if (blocking.length) {
    throw new Error(`Cannot update invalid review ledger: ${blocking.map((issue) => issue.detail).join("; ")}`);
  }
  const byKey = new Map(parsed.file.entries.map((entry) => [
    humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint),
    entry,
  ] as const));
  for (const entry of additions) {
    const key = humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint);
    byKey.set(key, entry);
  }
  return {
    formatVersion: WJEC_HUMAN_VERIFICATION_LEDGER_VERSION,
    entries: [...byKey.values()].sort((left, right) =>
      left.subjectId.localeCompare(right.subjectId) ||
      left.questionId.localeCompare(right.questionId) ||
      left.contentFingerprint.localeCompare(right.contentFingerprint)),
  };
}
