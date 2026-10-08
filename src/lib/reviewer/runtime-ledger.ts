// ---------------------------------------------------------------------------
// The runtime half of the ONE review audit log.
//
// The committed log (src/content/reviews/wjec-review-audit-log.json) is the
// head of a hash chain built by src/domain/review-workflow.ts. A deployed web
// app cannot write repo files, so decisions made in the reviewer portal are
// appended to Supabase `public.review_audit_events` as the continuation of
// that same chain: identical event objects, the same `eventHash`, and the
// first runtime event's `previousHash` is the committed tail's `hash`.
//
// Everything here is a thin adapter over the existing pure domain functions:
//   - appendReviewDecisions   builds and validates the next event
//   - auditLogIssues          verifies the combined chain end to end
//   - reviewStateOf           drives the queue
//   - promotableLedgerEntries derives human-verification ledger entries
//   - mergeHumanVerificationLedger joins them onto the committed ledger
// There is no separate review store and no re-implemented rule.
//
// Deliberately NOT `server-only`, so it stays unit-testable; it never touches
// a network client or a secret.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS, requiresWjecContentReview } from "@/domain/content-trust";
import { mergeHumanVerificationLedger, type HumanVerificationLedgerFile } from "@/domain/human-verification-ledger";
import {
  appendReviewDecisions,
  auditLogIssues,
  promotableLedgerEntries,
  REQUIRED_INDEPENDENT_APPROVALS,
  REVIEW_AUDIT_LOG_VERSION,
  reviewStateOf,
  type ReviewAuditEvent,
  type ReviewAuditLog,
  type ReviewDecisionInput,
  type ReviewProblem,
  type ReviewStage,
} from "@/domain/review-workflow";
import type { HumanVerificationRecord, Id, Question } from "@/domain/types";

/** One row of `public.review_audit_events` as PostgREST returns it. */
export interface RuntimeEventRow {
  seq: number;
  previous_hash: string;
  hash: string;
  event: unknown;
}

/** Row shape written to `public.review_audit_events`. */
export interface RuntimeEventInsert extends RuntimeEventRow {
  question_id: string;
  subject_id: string;
  content_fingerprint: string;
  decision: ReviewAuditEvent["decision"];
  reviewer_id: string;
  reviewer_user_id: string;
}

export interface CombinedAuditLog {
  log: ReviewAuditLog;
  /** Integrity problems. Any entry means the runtime chain must not be trusted. */
  issues: string[];
  /** Events that exist only at runtime (not yet exported to the repo). */
  runtimeOnly: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Join the committed log and the runtime rows into one log and verify it with
 * the domain's own chain checker. Runtime rows whose seq is already in the
 * committed log (because a developer exported them back to the repo) must be
 * byte-identical by hash; anything else is an integrity issue.
 */
export function combineAuditLog(committedRaw: unknown, rows: readonly RuntimeEventRow[]): CombinedAuditLog {
  const committedIssues = auditLogIssues(committedRaw);
  if (committedIssues.length) {
    return { log: { formatVersion: REVIEW_AUDIT_LOG_VERSION, events: [] }, issues: committedIssues.map((i) => `committed log: ${i}`), runtimeOnly: 0 };
  }
  const committed = committedRaw as ReviewAuditLog;
  const issues: string[] = [];
  const runtime: ReviewAuditEvent[] = [];
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    const event = row.event;
    if (!isObject(event) || event.seq !== row.seq || event.hash !== row.hash || event.previousHash !== row.previous_hash) {
      issues.push(`runtime event ${row.seq}: stored columns do not match the hashed event`);
      continue;
    }
    const prior = committed.events[row.seq - 1];
    if (prior) {
      if (prior.hash !== row.hash) issues.push(`runtime event ${row.seq}: differs from the committed event with the same sequence number`);
      continue;
    }
    runtime.push(event as unknown as ReviewAuditEvent);
  }
  const log: ReviewAuditLog = { formatVersion: REVIEW_AUDIT_LOG_VERSION, events: [...committed.events, ...runtime] };
  issues.push(...auditLogIssues(log));
  return { log, issues, runtimeOnly: runtime.length };
}

/**
 * The human-verification ledger the runtime should apply: the committed
 * ledger plus an entry for every question whose CURRENT content has a
 * verified (two different reviewers) chain in the combined log. When the
 * chain fails verification only the committed ledger is returned (fail closed).
 */
export function effectiveLedger(questions: readonly Question[], committedLedgerRaw: unknown, combined: CombinedAuditLog): HumanVerificationLedgerFile {
  const additions = combined.issues.length ? [] : promotableLedgerEntries(questions, combined.log);
  return mergeHumanVerificationLedger(committedLedgerRaw, additions);
}

// --- decisions ----------------------------------------------------------------

const checksShape = Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((check) => [check, z.boolean()])) as Record<(typeof REQUIRED_HUMAN_CHECKS)[number], z.ZodBoolean>;

/** What the portal posts. Identity, role, qualification and time are never taken from the client. */
export const reviewDecisionRequestSchema = z.object({
  questionId: z.string().min(1).max(200),
  contentFingerprint: z.string().min(1).max(200),
  decision: z.enum(["approve", "revise"]),
  checks: z.object(checksShape).strict(),
  comments: z.string().max(2000).default(""),
  classification: z.object({
    transferConfirmed: z.boolean().optional(),
    dataAnalysisConfirmed: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type ReviewDecisionRequest = z.infer<typeof reviewDecisionRequestSchema>;

export interface ReviewerGrant {
  userId: string;
  reviewerLabel: string;
  role: NonNullable<HumanVerificationRecord["reviewerRole"]>;
  qualification: string;
}

export type PreparedDecision =
  | { ok: true; event: ReviewAuditEvent; row: RuntimeEventInsert }
  | { ok: false; problems: ReviewProblem[] };

/**
 * Build the next audit event with the domain's `appendReviewDecisions` (which
 * runs every rule in `decisionProblems`: stale fingerprint, six checks, same
 * reviewer twice, blocked validation stage, comment on revise, ...).
 */
export function prepareDecision(
  combined: CombinedAuditLog,
  request: ReviewDecisionRequest,
  questions: readonly Question[],
  reviewer: ReviewerGrant,
  nowMs: number,
): PreparedDecision {
  if (combined.issues.length) {
    return { ok: false, problems: [{ questionId: request.questionId, detail: "the review audit chain failed verification; no decision can be recorded until it is repaired" }] };
  }
  const input: ReviewDecisionInput = {
    questionId: request.questionId,
    contentFingerprint: request.contentFingerprint,
    decision: request.decision,
    reviewerId: reviewer.reviewerLabel,
    reviewerRole: reviewer.role,
    reviewerQualification: reviewer.qualification,
    reviewedAt: new Date(nowMs).toISOString(),
    checks: { ...request.checks },
    comments: request.comments.trim(),
    ...(request.classification ? { classification: { ...request.classification } } : {}),
  };
  const result = appendReviewDecisions(combined.log, [input], questions, nowMs);
  if (result.problems.length || result.accepted !== 1) return { ok: false, problems: result.problems };
  const event = result.log.events.at(-1)!;
  return {
    ok: true,
    event,
    row: {
      seq: event.seq,
      previous_hash: event.previousHash,
      hash: event.hash,
      question_id: event.questionId,
      subject_id: event.subjectId,
      content_fingerprint: event.contentFingerprint,
      decision: event.decision,
      reviewer_id: event.reviewerId,
      reviewer_user_id: reviewer.userId,
      event,
    },
  };
}

// --- queue ----------------------------------------------------------------------

export interface ReviewQueueItem {
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  stage: ReviewStage;
  approvalsNeeded: number;
  approvers: string[];
  lastDecision: ReviewAuditEvent["decision"] | null;
  openComment: string | null;
  needsReReview: boolean;
  totalMarks: number;
  stemPreview: string;
}

export interface ReviewQueue {
  /** Ready for this reviewer, one-approval-from-verified first. */
  ready: ReviewQueueItem[];
  /** Sent back for changes on the current content; waits for an author edit. */
  changesRequested: ReviewQueueItem[];
  /** This reviewer already approved the current content; needs someone else. */
  awaitingOtherReviewer: ReviewQueueItem[];
  verified: number;
}

const preview = (text: string) => (text.length > 140 ? `${text.slice(0, 137)}…` : text);

export function buildReviewQueue(questions: readonly Question[], log: ReviewAuditLog, reviewerLabel: string, subjectId?: Id): ReviewQueue {
  const queue: ReviewQueue = { ready: [], changesRequested: [], awaitingOtherReviewer: [], verified: 0 };
  for (const question of questions) {
    if (!requiresWjecContentReview(question.subjectId)) continue;
    if (subjectId && question.subjectId !== subjectId) continue;
    const state = reviewStateOf(question, log.events);
    if (state.stage === "verified") { queue.verified++; continue; }
    const item: ReviewQueueItem = {
      questionId: question.id,
      subjectId: question.subjectId,
      topicIds: question.topicIds,
      stage: state.stage,
      approvalsNeeded: state.approvalsNeeded,
      approvers: state.approvers,
      lastDecision: state.lastDecision,
      openComment: state.openComment,
      needsReReview: state.needsReReview,
      totalMarks: question.totalMarks,
      stemPreview: preview(question.stem),
    };
    if (state.approvers.includes(reviewerLabel)) queue.awaitingOtherReviewer.push(item);
    else if (state.lastDecision === "revise" || state.lastDecision === "reject") queue.changesRequested.push(item);
    else queue.ready.push(item);
  }
  queue.ready.sort((a, b) => a.approvalsNeeded - b.approvalsNeeded || a.questionId.localeCompare(b.questionId));
  return queue;
}

/** History on the question's current content, oldest first, for the review screen. */
export function currentContentHistory(question: Question, log: ReviewAuditLog): ReviewAuditEvent[] {
  const fingerprint = physicsContentFingerprint(question);
  return log.events.filter((event) => event.questionId === question.id && event.contentFingerprint === fingerprint);
}

export { REQUIRED_INDEPENDENT_APPROVALS };
