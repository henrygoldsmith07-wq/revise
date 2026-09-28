// ---------------------------------------------------------------------------
// WJEC content lifecycle — one shared vocabulary for trust operations.
//
// States:
//   authored  — present in the bank with mapped spec points and mark scheme.
//   reviewed  — a named human has attested all six checks against the exact
//               fingerprint currently on the question.
//   verified  — reviewed AND the question record carries verification=verified
//               with a matching fingerprint and authenticated paper provenance.
//   release-ready — verified AND part of a bank whose quality, prerequisite
//               and marking-benchmark gates all pass (computed per subject,
//               never persisted per question).
//
// Anything else is blocked, with an explicit reason. No automated process
// may fabricate human approval: this module only reads attestations.
// ---------------------------------------------------------------------------

import {
  REQUIRED_HUMAN_CHECKS,
  humanVerifiedWjecQuestion,
  physicsContentFingerprint,
  requiresWjecContentReview,
} from "./physics-content-review";
import type { Id, Question } from "./types";

export type ContentLifecycleState = "authored" | "reviewed" | "verified" | "release-ready" | "blocked";

export interface ContentLifecycleStatus {
  questionId: Id;
  subjectId: Id;
  state: ContentLifecycleState;
  /** Why the item cannot advance; empty when verified. */
  blockedReasons: string[];
  /** Which of the six human checks are still missing. */
  missingChecks: Array<(typeof REQUIRED_HUMAN_CHECKS)[number]>;
  /** True when a stale fingerprint or edited content invalidated a prior approval. */
  staleFingerprint: boolean;
}

function hasAuthoredBasics(question: Question): boolean {
  const specPoints = [...(question.specPointIds ?? []), ...question.parts.flatMap((part) => part.specPointIds ?? [])];
  return question.stem.trim().length > 0 && question.parts.length > 0 &&
    question.parts.every((part) => part.markScheme.length > 0 && part.modelAnswer.trim().length > 0) &&
    specPoints.length > 0;
}

/** Per-question lifecycle: authored → reviewed → verified. Release-ready is bank-level. */
export function contentLifecycleStatus(question: Question): ContentLifecycleStatus {
  const missingChecks = REQUIRED_HUMAN_CHECKS.filter((check) => !question.humanVerification?.checks?.[check]);
  const blockedReasons: string[] = [];
  if (!hasAuthoredBasics(question)) blockedReasons.push("incomplete-authoring");
  if (!requiresWjecContentReview(question.subjectId)) {
    return { questionId: question.id, subjectId: question.subjectId, state: "authored", blockedReasons, missingChecks, staleFingerprint: false };
  }
  const record = question.humanVerification;
  const expected = physicsContentFingerprint(question);
  const staleFingerprint = Boolean(record?.contentFingerprint && record.contentFingerprint !== expected);
  if (staleFingerprint) blockedReasons.push("stale-fingerprint");
  if (!record || record.status !== "approved") {
    if (!record) blockedReasons.push("unreviewed");
    else if (record.status === "changes-requested") blockedReasons.push("changes-requested");
    else blockedReasons.push("pending-review");
  }
  if (record?.status === "approved" && missingChecks.length) blockedReasons.push("incomplete-checks");
  if (!record?.reviewerId?.trim()) blockedReasons.push("missing-reviewer");
  if (question.source === "past-paper" && question.paperProvenance?.status !== "verified") blockedReasons.push("unverified-provenance");
  if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) blockedReasons.push(`validation:${question.validation?.stage}`);
  if (question.verification !== "verified") blockedReasons.push("unverified-record");

  if (humanVerifiedWjecQuestion(question)) {
    return { questionId: question.id, subjectId: question.subjectId, state: "verified", blockedReasons: [], missingChecks: [], staleFingerprint: false };
  }
  // Reviewed means the six checks are attested against the current fingerprint,
  // even if the record-level verification flag has not yet been flipped.
  const reviewed = record?.status === "approved" && missingChecks.length === 0 && !staleFingerprint &&
    Boolean(record.reviewerId?.trim()) &&
    (question.source !== "past-paper" || question.paperProvenance?.status === "verified");
  return {
    questionId: question.id,
    subjectId: question.subjectId,
    state: reviewed ? "reviewed" : hasAuthoredBasics(question) && blockedReasons.length === 0 ? "authored" : "blocked",
    blockedReasons,
    missingChecks,
    staleFingerprint,
  };
}

/** Bank-level summary answering: authored? reviewed? blocked? why? what next? */
export interface LifecycleSummary {
  subjectId: Id;
  authored: number;
  reviewed: number;
  verified: number;
  blocked: number;
  blockedByReason: Record<string, number>;
  /** Highest-value next review batch: blocked items with most spec coverage first. */
  nextBatch: { questionId: Id; missingChecks: string[]; blockedReasons: string[] }[];
}

export function summariseLifecycle(questions: readonly Question[], subjectId: Id): LifecycleSummary {
  const rows = questions.filter((question) => question.subjectId === subjectId).map(contentLifecycleStatus);
  const blockedByReason: Record<string, number> = {};
  for (const row of rows) {
    if (row.state !== "verified" && row.state !== "reviewed") {
      for (const reason of row.blockedReasons) blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
    }
  }
  const scored = rows
    .filter((row) => row.state === "blocked")
    .map((row) => {
      const question = questions.find((q) => q.id === row.questionId)!;
      const specPoints = new Set([...(question.specPointIds ?? []), ...question.parts.flatMap((p) => p.specPointIds ?? [])]).size;
      return { row, specPoints };
    })
    .sort((a, b) => b.specPoints - a.specPoints || a.row.questionId.localeCompare(b.row.questionId))
    .slice(0, 20)
    .map(({ row }) => ({ questionId: row.questionId, missingChecks: [...row.missingChecks], blockedReasons: [...row.blockedReasons] }));
  return {
    subjectId,
    authored: rows.filter((row) => row.state === "authored").length,
    reviewed: rows.filter((row) => row.state === "reviewed").length,
    verified: rows.filter((row) => row.state === "verified").length,
    blocked: rows.filter((row) => row.state === "blocked").length,
    blockedByReason,
    nextBatch: scored,
  };
}

export interface LedgerAnomaly {
  kind: "orphaned-approval" | "stale-fingerprint" | "orphaned-question-ref";
  questionId: Id;
  detail: string;
}

/**
 * Detect ledger entries that reference missing questions, or approvals whose
 * fingerprint no longer matches the bank. Never mutates; fails closed by
 * reporting rather than trusting.
 */
export function findLedgerAnomalies(input: {
  questions: readonly Question[];
  approvals: readonly { questionId: Id; contentFingerprint: string }[];
}): LedgerAnomaly[] {
  const byId = new Map(input.questions.map((question) => [question.id, question]));
  const out: LedgerAnomaly[] = [];
  for (const approval of input.approvals) {
    const question = byId.get(approval.questionId);
    if (!question) {
      out.push({ kind: "orphaned-approval", questionId: approval.questionId, detail: "Approval references a question absent from the bank." });
      continue;
    }
    if (approval.contentFingerprint !== physicsContentFingerprint(question)) {
      out.push({ kind: "stale-fingerprint", questionId: approval.questionId, detail: "Bank content changed since attestation; re-review required." });
    }
  }
  return out;
}
