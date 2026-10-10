// ---------------------------------------------------------------------------
// Capability-first ordering for the reviewer portal.
//
// The portal used to list "Ready for you" alphabetically by question id, so a
// teacher's scarce minutes went to whatever id sorted first: often a reskin
// of a question already under review, or a topic that a second approval would
// not unlock. The domain already knows which review unlocks the most for
// students (src/domain/review-priority.ts, used by the CLI campaign and the
// readiness report); this adapter brings that ranking to the portal.
//
// Nothing here changes a review rule or what counts as trusted. Trust is read
// exactly as a student device reads it: the effective ledger (committed +
// runtime chain, `effectiveLedger`) applied with `applyHumanVerificationLedger`.
// The ranking only decides ORDER; every question stays reachable.
//
// Cost: the clustering inside buildReviewPriorities is ~1 s on the Physics
// bank, too slow to repeat on every render. The result depends only on the
// bank and the audit chain (no exam dates are passed, so not on the clock),
// so it is memoised per subject on the chain tail. A new decision changes the
// tail and recomputes once.
//
// Deliberately NOT `server-only`, so it stays unit-testable; it touches no
// network client or secret.
// ---------------------------------------------------------------------------

import { applyHumanVerificationLedger } from "@/domain/human-verification-ledger";
import { blockingGates, questionGateIssues, type GateContext } from "@/domain/review-gates";
import {
  buildReviewPriorities, CAPABILITY_LABEL, REQUIRED_TRUSTED_DISTINCT,
  type Capability, type SubjectReviewSummary,
} from "@/domain/review-priority";
import type { Id, Question, Topic } from "@/domain/types";
import { effectiveLedger, type CombinedAuditLog } from "./runtime-ledger";

export interface ReviewPriorityEntry {
  /** 1 = the single review that unlocks the most for students right now. */
  rank: number;
  topicId: Id;
  unlocks: Capability[];
  /** Planning estimate for all approvals still needed; never evidence. */
  reviewMinutes: number;
}

/** The cheapest set of reviews that lets one topic start proving improvement. */
export interface FastestProofPath {
  topicId: Id;
  questionIds: Id[];
  /** Independent approvals still needed across those questions. */
  approvals: number;
  /** Planning estimate only. */
  minutes: number;
}

export interface ReviewPriorityIndex {
  subjectId: Id;
  byQuestion: ReadonlyMap<Id, ReviewPriorityEntry>;
  /** Fails a blocking authoring gate: an author must fix it before review is worth a teacher's time. */
  blocked: ReadonlySet<Id>;
  summary: SubjectReviewSummary | null;
  fastestProof: FastestProofPath | null;
}

export interface ReviewPriorityInput {
  questions: readonly Question[];
  combined: CombinedAuditLog;
  committedLedger: unknown;
  subjectId: Id;
  topics: readonly Topic[];
  gate: GateContext;
}

export function unlockLabel(capability: Capability): string {
  return CAPABILITY_LABEL[capability];
}

export function buildReviewPriorityIndex(input: ReviewPriorityInput): ReviewPriorityIndex {
  const own = input.questions.filter((question) => question.subjectId === input.subjectId);
  // Trust exactly as students see it. A broken chain already fails closed to
  // the committed ledger inside effectiveLedger.
  const ledger = effectiveLedger(own, input.committedLedger, input.combined);
  const questions = applyHumanVerificationLedger(own, ledger).questions;
  const report = buildReviewPriorities({
    topics: input.topics,
    questions,
    auditEvents: input.combined.log.events,
    gate: input.gate,
    subjectIds: [input.subjectId],
  });

  const byQuestion = new Map<Id, ReviewPriorityEntry>();
  for (const item of report.queue) {
    byQuestion.set(item.questionId, { rank: item.rank, topicId: item.topicId, unlocks: item.unlocks, reviewMinutes: item.reviewMinutes });
  }
  const blocked = new Set<Id>();
  for (const question of questions) {
    if (blockingGates(questionGateIssues(question, input.gate)).length) blocked.add(question.id);
  }

  let fastestProof: FastestProofPath | null = null;
  let fastestFirstRank = Infinity;
  for (const row of report.topics) {
    const need = REQUIRED_TRUSTED_DISTINCT - row.trustedDistinct;
    if (need <= 0) continue;
    const items = report.queue.filter((item) => item.topicId === row.topicId).slice(0, need);
    if (items.length < need) continue; // reviewing alone cannot get there: needs new authoring
    const path: FastestProofPath = {
      topicId: row.topicId,
      questionIds: items.map((item) => item.questionId),
      approvals: items.reduce((sum, item) => sum + item.reviewsNeeded, 0),
      minutes: items.reduce((sum, item) => sum + item.reviewMinutes, 0),
    };
    const firstRank = items[0]!.rank;
    const better = !fastestProof
      || path.approvals < fastestProof.approvals
      || (path.approvals === fastestProof.approvals && (path.minutes < fastestProof.minutes || (path.minutes === fastestProof.minutes && firstRank < fastestFirstRank)));
    if (better) { fastestProof = path; fastestFirstRank = firstRank; }
  }

  return { subjectId: input.subjectId, byQuestion, blocked, summary: report.subjects[0] ?? null, fastestProof };
}

// --- memo --------------------------------------------------------------------

const cache = new Map<Id, { key: string; index: ReviewPriorityIndex }>();

function chainKey(input: ReviewPriorityInput): string {
  const events = input.combined.log.events;
  return `${input.questions.length}:${events.length}:${events.at(-1)?.hash ?? "genesis"}:${input.combined.issues.length}`;
}

/** Memoised per subject on the audit-chain tail; recomputes after any new decision. */
export function reviewPriorityIndex(input: ReviewPriorityInput): ReviewPriorityIndex {
  const key = chainKey(input);
  const hit = cache.get(input.subjectId);
  if (hit && hit.key === key) return hit.index;
  const index = buildReviewPriorityIndex(input);
  cache.set(input.subjectId, { key, index });
  return index;
}
