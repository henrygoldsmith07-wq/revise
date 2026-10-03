// ---------------------------------------------------------------------------
// Human-review workflow for flagship questions:
//
//   unverified -> checked (one qualified approval) -> verified (a second,
//   different qualified reviewer approves the same exact content)
//
// Every decision is an event in an append-only, hash-chained audit log. A
// ledger entry (the only thing that makes a question trusted at runtime) can
// only be produced from a verified chain on the question's CURRENT content
// fingerprint, so editing a question silently drops it back to "needs
// re-review". Nothing here approves anything: decisions come from named humans.
// ---------------------------------------------------------------------------

import { canonicalJson, sha256Hex } from "./content-fingerprint";
import {
  physicsContentFingerprint, REQUIRED_HUMAN_CHECKS, requiresWjecContentReview, validHumanReviewInstant, WJEC_REVIEWER_ROLES,
} from "./content-trust";
import { hasActualTransfer, hasDataRepresentation } from "./review-gates";
import { isDataAnalysis } from "./supply-audit";
import type { HumanVerificationLedgerEntry } from "./human-verification-ledger";
import type { HumanVerificationRecord, Id, Question } from "./types";

export const REVIEW_AUDIT_LOG_VERSION = 1 as const;
/** Independent approvals (different reviewers, same fingerprint) needed to verify. */
export const REQUIRED_INDEPENDENT_APPROVALS = 2;
export const GENESIS_HASH = "genesis";

export type ReviewStage = "unverified" | "checked" | "verified";
export type ReviewDecision = "approve" | "reject" | "revise";
export type ReviewCheck = (typeof REQUIRED_HUMAN_CHECKS)[number];

export interface ReviewClassification {
  /** The reviewer confirms the question genuinely tests transfer to an unfamiliar setup. */
  transferConfirmed?: boolean;
  /** The reviewer confirms the question genuinely requires reading data/graph/practical results. */
  dataAnalysisConfirmed?: boolean;
}

/** What a reviewer (or an external review file) supplies. */
export interface ReviewDecisionInput {
  questionId: Id;
  contentFingerprint: string;
  decision: ReviewDecision;
  reviewerId: string;
  reviewerRole: NonNullable<HumanVerificationRecord["reviewerRole"]>;
  reviewerQualification: string;
  reviewedAt: string;
  checks: Record<ReviewCheck, boolean>;
  comments: string;
  classification?: ReviewClassification;
}

export interface ReviewAuditEvent extends ReviewDecisionInput {
  seq: number;
  subjectId: Id;
  previousHash: string;
  hash: string;
}

export interface ReviewAuditLog { formatVersion: typeof REVIEW_AUDIT_LOG_VERSION; events: ReviewAuditEvent[] }

export const emptyAuditLog = (): ReviewAuditLog => ({ formatVersion: REVIEW_AUDIT_LOG_VERSION, events: [] });

export function eventHash(event: Omit<ReviewAuditEvent, "hash">): string {
  return `sha256:${sha256Hex(canonicalJson(event))}`;
}

const nonBlank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

// --- validation of one decision ------------------------------------------------

export interface ReviewProblem { questionId: Id; detail: string }

/** Rules every decision must pass before it can enter the log. */
export function decisionProblems(input: ReviewDecisionInput, question: Question | undefined, priorApprovers: readonly string[], nowMs = Date.now()): string[] {
  const out: string[] = [];
  if (!question) return ["the question is not in the current bank"];
  if (!requiresWjecContentReview(question.subjectId)) out.push("the subject is not review-gated");
  if (!["approve", "reject", "revise"].includes(input.decision)) out.push("decision must be approve, reject or revise");
  if (!nonBlank(input.reviewerId)) out.push("missing reviewer id");
  if (!input.reviewerRole || !WJEC_REVIEWER_ROLES.includes(input.reviewerRole)) out.push("missing or unknown reviewer role");
  if (!nonBlank(input.reviewerQualification)) out.push("missing reviewer qualification");
  if (!validHumanReviewInstant(input.reviewedAt, nowMs)) out.push("review date is missing, malformed or in the future");
  if (input.contentFingerprint !== physicsContentFingerprint(question)) out.push("the question or its marking changed since this review (stale fingerprint)");
  if (input.decision === "approve") {
    if (REQUIRED_HUMAN_CHECKS.some((check) => input.checks?.[check] !== true)) out.push("an approval needs all six checks ticked");
    if (priorApprovers.includes(input.reviewerId)) out.push("this reviewer already approved this exact content; a different reviewer must confirm it");
    if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) out.push("the question is in a blocked validation stage");
    if (input.classification?.transferConfirmed && !hasActualTransfer(question)) out.push("transfer confirmed, but the question has no structural transfer link");
    if (input.classification?.dataAnalysisConfirmed && !(isDataAnalysis(question) && hasDataRepresentation(question))) out.push("data analysis confirmed, but the question has no authored data representation");
  } else if (!nonBlank(input.comments)) out.push("a rejection or revision request needs a comment");
  return out;
}

// --- stage of a question --------------------------------------------------------

export interface QuestionReviewState {
  questionId: Id;
  stage: ReviewStage;
  /** Latest decision on the current content, if any. */
  lastDecision: ReviewDecision | null;
  approvers: string[];
  /** Approvals still needed to verify. */
  approvalsNeeded: number;
  /** Reviewed before, but the content has changed since: needs a fresh review. */
  needsReReview: boolean;
  /** Latest comment on the current content (e.g. what must be revised). */
  openComment: string | null;
  /** The approvals that make up a verified chain (newest chain only). */
  chain: ReviewAuditEvent[];
}

/** Events on the current fingerprint, after the latest reject/revise, in order. */
export function reviewStateOf(question: Question, events: readonly ReviewAuditEvent[]): QuestionReviewState {
  const fingerprint = physicsContentFingerprint(question);
  const mine = events.filter((e) => e.questionId === question.id);
  const current = mine.filter((e) => e.contentFingerprint === fingerprint).sort((a, b) => a.seq - b.seq);
  let lastBlock = -1;
  current.forEach((e, i) => { if (e.decision !== "approve") lastBlock = i; });
  const open = lastBlock >= 0 ? current[lastBlock]! : null;
  const chain: ReviewAuditEvent[] = [];
  for (const e of current.slice(lastBlock + 1)) if (e.decision === "approve" && !chain.some((c) => c.reviewerId === e.reviewerId)) chain.push(e);
  const stage: ReviewStage = chain.length >= REQUIRED_INDEPENDENT_APPROVALS ? "verified" : chain.length > 0 ? "checked" : "unverified";
  const last = current.at(-1) ?? null;
  return {
    questionId: question.id, stage, lastDecision: last?.decision ?? null, approvers: chain.map((e) => e.reviewerId),
    approvalsNeeded: Math.max(0, REQUIRED_INDEPENDENT_APPROVALS - chain.length),
    needsReReview: mine.length > 0 && current.length === 0,
    openComment: open?.comments ?? null,
    chain: stage === "verified" ? chain : [],
  };
}

export const approversOnCurrentContent = (question: Question, events: readonly ReviewAuditEvent[]): string[] =>
  reviewStateOf(question, events).approvers;

// --- append -----------------------------------------------------------------------

export interface AppendResult { log: ReviewAuditLog; accepted: number; problems: ReviewProblem[] }

/** Atomic: if any decision in the batch is invalid nothing is appended. */
export function appendReviewDecisions(log: ReviewAuditLog, decisions: readonly ReviewDecisionInput[], questions: readonly Question[], nowMs = Date.now()): AppendResult {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const problems: ReviewProblem[] = [];
  let events = [...log.events];
  for (const input of decisions) {
    const question = byId.get(input.questionId);
    const prior = question ? approversOnCurrentContent(question, events) : [];
    const detail = decisionProblems(input, question, prior, nowMs);
    if (detail.length) { problems.push(...detail.map((d) => ({ questionId: input.questionId, detail: d }))); continue; }
    const previousHash = events.at(-1)?.hash ?? GENESIS_HASH;
    const base = { ...input, comments: input.comments ?? "", seq: events.length + 1, subjectId: question!.subjectId, previousHash };
    events = [...events, { ...base, hash: eventHash(base) }];
  }
  if (problems.length) return { log, accepted: 0, problems };
  return { log: { formatVersion: REVIEW_AUDIT_LOG_VERSION, events }, accepted: decisions.length, problems };
}

// --- log integrity -----------------------------------------------------------------

export function auditLogIssues(log: unknown): string[] {
  const issues: string[] = [];
  if (typeof log !== "object" || log === null || (log as ReviewAuditLog).formatVersion !== REVIEW_AUDIT_LOG_VERSION || !Array.isArray((log as ReviewAuditLog).events)) {
    return ["audit log must be a version-1 object with an events array"];
  }
  let previous = GENESIS_HASH;
  (log as ReviewAuditLog).events.forEach((event, i) => {
    const where = `event ${i + 1} (${event?.questionId})`;
    if (event.seq !== i + 1) issues.push(`${where}: sequence number ${event.seq} is out of order`);
    if (event.previousHash !== previous) issues.push(`${where}: chain is broken (history was edited or removed)`);
    const { hash, ...rest } = event;
    if (hash !== eventHash(rest)) issues.push(`${where}: content does not match its hash (the record was edited)`);
    if (!nonBlank(event.reviewerId) || !event.reviewerRole || !nonBlank(event.reviewerQualification) || !validHumanReviewInstant(event.reviewedAt)) issues.push(`${where}: missing reviewer identity, qualification or date`);
    previous = hash;
  });
  // Transition rule: a reviewer cannot approve the same exact content twice without a rejection between.
  const approvers = new Map<string, Set<string>>();
  for (const event of (log as ReviewAuditLog).events) {
    const key = `${event.questionId}::${event.contentFingerprint}`;
    if (event.decision !== "approve") { approvers.delete(key); continue; }
    const seen = approvers.get(key) ?? new Set<string>();
    if (seen.has(event.reviewerId)) issues.push(`event ${event.seq} (${event.questionId}): ${event.reviewerId} approved the same content twice`);
    seen.add(event.reviewerId);
    approvers.set(key, seen);
  }
  return issues;
}

// --- promotion ------------------------------------------------------------------------

/** Ledger entries for every question whose CURRENT content has a verified chain. */
export function promotableLedgerEntries(questions: readonly Question[], log: ReviewAuditLog): HumanVerificationLedgerEntry[] {
  const out: HumanVerificationLedgerEntry[] = [];
  for (const question of questions) {
    if (!requiresWjecContentReview(question.subjectId)) continue;
    const state = reviewStateOf(question, log.events);
    if (state.stage !== "verified") continue;
    const final = state.chain.at(-1)!;
    const fingerprint = physicsContentFingerprint(question);
    out.push({
      questionId: question.id, subjectId: question.subjectId, contentFingerprint: fingerprint,
      review: {
        status: "approved", reviewerId: final.reviewerId, reviewerRole: final.reviewerRole,
        reviewerQualification: final.reviewerQualification, reviewedAt: final.reviewedAt, contentFingerprint: fingerprint,
        checks: { ...final.checks },
        notes: `Verified by ${state.chain.map((e) => e.reviewerId).join(" and ")} (audit events ${state.chain.map((e) => e.seq).join(", ")}).`,
      },
    });
  }
  return out;
}

export interface PromotionGateResult { issues: string[]; verified: number; checked: number; needsReReview: number }

/**
 * Release gate: a ledger entry exists only for a verified, current audit chain
 * with matching content, and no trusted question exists without one.
 */
export function promotionGateIssues(questions: readonly Question[], log: ReviewAuditLog, ledger: readonly HumanVerificationLedgerEntry[], trusted: (q: Question) => boolean): PromotionGateResult {
  const issues = auditLogIssues(log);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const expected = new Map(promotableLedgerEntries(questions, log).map((e) => [e.questionId, e]));
  for (const entry of ledger) {
    const question = byId.get(entry.questionId);
    if (!question) continue; // retained as history by the ledger itself
    if (entry.contentFingerprint !== physicsContentFingerprint(question)) continue; // historical, never applied
    const backed = expected.get(entry.questionId);
    if (!backed) issues.push(`${entry.questionId}: ledger approval has no verified audit chain (needs ${REQUIRED_INDEPENDENT_APPROVALS} different reviewers on this exact content)`);
    else if (backed.review.reviewerId !== entry.review.reviewerId || backed.review.reviewedAt !== entry.review.reviewedAt) issues.push(`${entry.questionId}: ledger approval does not match the audit chain`);
  }
  for (const question of questions) {
    if (requiresWjecContentReview(question.subjectId) && trusted(question) && !expected.has(question.id)) issues.push(`${question.id}: trusted at runtime without a verified audit chain`);
  }
  const states = questions.filter((q) => requiresWjecContentReview(q.subjectId)).map((q) => reviewStateOf(q, log.events));
  return {
    issues, verified: states.filter((s) => s.stage === "verified").length, checked: states.filter((s) => s.stage === "checked").length,
    needsReReview: states.filter((s) => s.needsReReview).length,
  };
}

// --- external review: export/import --------------------------------------------------------

export const REVIEW_RETURN_VERSION = 1 as const;

export interface ReviewReturnFile { formatVersion: typeof REVIEW_RETURN_VERSION; packId: string; decisions: ReviewDecisionInput[] }

/** Blank return file for external reviewers: one row per question, decision left for the human. */
export function reviewReturnTemplate(packId: string, questions: readonly Question[]): ReviewReturnFile {
  const blankChecks = Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c) => [c, false])) as Record<ReviewCheck, boolean>;
  return {
    formatVersion: REVIEW_RETURN_VERSION, packId,
    decisions: questions.map((q) => ({
      questionId: q.id, contentFingerprint: physicsContentFingerprint(q), decision: "revise" as ReviewDecision, reviewerId: "", reviewerRole: "teacher" as const,
      reviewerQualification: "", reviewedAt: "", checks: { ...blankChecks }, comments: "", classification: {},
    })),
  };
}

/** Parse an external review file. Rows left blank (no reviewer) are skipped, not guessed. */
export function parseReviewReturn(raw: string): { decisions: ReviewDecisionInput[]; skipped: number; errors: string[] } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { decisions: [], skipped: 0, errors: ["file is not valid JSON"] }; }
  const file = value as Partial<ReviewReturnFile> | null;
  if (!file || file.formatVersion !== REVIEW_RETURN_VERSION || !Array.isArray(file.decisions)) return { decisions: [], skipped: 0, errors: ["expected a version-1 review file with a decisions array"] };
  const decisions: ReviewDecisionInput[] = [];
  let skipped = 0;
  for (const row of file.decisions) {
    if (!row || !nonBlank(row.questionId) || !nonBlank(row.contentFingerprint)) return { decisions: [], skipped: 0, errors: ["a row has no questionId or contentFingerprint"] };
    if (!nonBlank(row.reviewerId) && !nonBlank(row.reviewedAt)) { skipped++; continue; }
    decisions.push({ ...row, comments: row.comments ?? "" });
  }
  return { decisions, skipped, errors: [] };
}
