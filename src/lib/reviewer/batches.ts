// ---------------------------------------------------------------------------
// Transfer-pair review batch for the reviewer portal (and the owner CLI).
//
// Why this exists: a transfer question can only ever help prove that a
// student improved if BOTH it and the baseline it is linked to are trusted
// (each approved by REQUIRED_INDEPENDENT_APPROVALS different reviewers). In
// the capability-first queue those questions are scattered: on the shipped
// Physics bank the 14 linked transfer items sat around position 1,370 of
// ~1,640 "Ready for you" rows, behind a list that renders the first 200, and
// their baselines anywhere from ~120 to ~1,270. A teacher could not find
// them, and the review screen asked them to tick "Genuine transfer" without
// showing the baseline it transfers from.
//
// A batch is a fixed, shareable worklist: every structurally linked
// (baseline, transfer) pair in one subject, baseline first. It is ORDERING
// and CONTEXT only. Every state below comes from the domain's reviewStateOf
// on the verified audit chain; nothing here approves, skips a check, or
// changes what counts as trusted. A reviewer who already approved a question
// is never offered it again, and the "needs" line names who has approved so
// the second reviewer is visibly someone else.
//
// Deliberately NOT `server-only`: pure, unit-testable, and also loaded by
// scripts/wjec-review-pairs.mjs for the owner's status report.
// ---------------------------------------------------------------------------

import { REQUIRED_INDEPENDENT_APPROVALS, reviewStateOf, type ReviewAuditEvent, type QuestionReviewState } from "@/domain/review-workflow";
import type { Id, Question, QuestionPart } from "@/domain/types";

export interface TransferPair {
  topicId: Id;
  baselineQuestionId: Id;
  baselinePartId: Id;
  transferQuestionId: Id;
  transferPartId: Id;
}

/** Every structurally linked (baseline, transfer) pair in one subject, in bank order. Links to a missing baseline are skipped. */
export function transferPairs(bank: readonly Question[], subjectId: Id): TransferPair[] {
  const partOwner = new Map<Id, Question>();
  for (const question of bank) for (const part of question.parts) partOwner.set(part.id, question);
  const pairs: TransferPair[] = [];
  for (const question of bank) {
    if (question.subjectId !== subjectId) continue;
    for (const part of question.parts) {
      const baselinePartId = part.learning?.transferLink?.baselinePartId?.trim();
      if (!baselinePartId) continue;
      const baseline = partOwner.get(baselinePartId);
      if (!baseline || baseline.id === question.id) continue;
      pairs.push({ topicId: question.topicIds[0] ?? baseline.topicIds[0] ?? "", baselineQuestionId: baseline.id, baselinePartId, transferQuestionId: question.id, transferPartId: part.id });
    }
  }
  return pairs;
}

/** What one reviewer can do with one question right now. */
export type BatchAction =
  | "review"            // ready for this reviewer
  | "awaiting-other"    // this reviewer approved the current content; someone else must
  | "changes-requested" // waits for an author edit before anyone can approve
  | "verified";

export interface BatchMember {
  questionId: Id;
  role: "baseline" | "transfer";
  /** The other question(s) in its pair(s). */
  partnerIds: Id[];
  stage: QuestionReviewState["stage"];
  approvers: string[];
  approvalsNeeded: number;
  openComment: string | null;
  needsReReview: boolean;
  action: BatchAction;
}

export interface BatchPairView extends TransferPair {
  baseline: BatchMember;
  transfer: BatchMember;
  /** Both halves verified: this pair can now carry transfer proof for students. */
  ready: boolean;
}

export interface TransferBatchView {
  subjectId: Id;
  pairs: BatchPairView[];
  /** Unique questions, in review order (each pair's baseline before its transfer). */
  members: BatchMember[];
  /** Independent approvals the batch needs in total, and how many are on the current content. */
  approvalsNeeded: number;
  approvalsRecorded: number;
  verifiedQuestions: number;
  readyPairs: number;
  /** Questions this reviewer can act on now. */
  actionable: number;
}

function memberOf(question: Question, role: BatchMember["role"], partnerIds: Id[], events: readonly ReviewAuditEvent[], reviewerLabel: string | null): BatchMember {
  const state = reviewStateOf(question, events);
  const action: BatchAction = state.stage === "verified" ? "verified"
    : reviewerLabel !== null && state.approvers.includes(reviewerLabel) ? "awaiting-other"
    : state.lastDecision === "revise" || state.lastDecision === "reject" ? "changes-requested"
    : "review";
  return {
    questionId: question.id, role, partnerIds, stage: state.stage, approvers: state.approvers,
    approvalsNeeded: state.approvalsNeeded, openComment: state.openComment, needsReReview: state.needsReReview, action,
  };
}

/**
 * The batch as one reviewer (or, with reviewerLabel null, the owner) sees it.
 * States come straight from reviewStateOf on the given (already verified) chain.
 */
export function buildTransferBatch(bank: readonly Question[], events: readonly ReviewAuditEvent[], subjectId: Id, reviewerLabel: string | null): TransferBatchView {
  const byId = new Map(bank.map((question) => [question.id, question] as const));
  const pairs = transferPairs(bank, subjectId);
  const partners = new Map<Id, Set<Id>>();
  const link = (a: Id, b: Id) => { const set = partners.get(a) ?? new Set<Id>(); set.add(b); partners.set(a, set); };
  for (const pair of pairs) { link(pair.baselineQuestionId, pair.transferQuestionId); link(pair.transferQuestionId, pair.baselineQuestionId); }

  const members = new Map<Id, BatchMember>();
  const member = (id: Id, role: BatchMember["role"]) => {
    const existing = members.get(id);
    if (existing) return existing;
    const created = memberOf(byId.get(id)!, role, [...(partners.get(id) ?? [])], events, reviewerLabel);
    members.set(id, created);
    return created;
  };
  const views: BatchPairView[] = pairs.map((pair) => {
    const baseline = member(pair.baselineQuestionId, "baseline");
    const transfer = member(pair.transferQuestionId, "transfer");
    return { ...pair, baseline, transfer, ready: baseline.stage === "verified" && transfer.stage === "verified" };
  });
  const list = [...members.values()];
  return {
    subjectId,
    pairs: views,
    members: list,
    approvalsNeeded: list.length * REQUIRED_INDEPENDENT_APPROVALS,
    approvalsRecorded: list.reduce((sum, entry) => sum + Math.min(entry.approvers.length, REQUIRED_INDEPENDENT_APPROVALS), 0),
    verifiedQuestions: list.filter((entry) => entry.stage === "verified").length,
    readyPairs: views.filter((view) => view.ready).length,
    actionable: list.filter((entry) => entry.action === "review").length,
  };
}

/** The next question in batch order this reviewer can act on, after `currentId` (wrapping). Null when nothing is left for them. */
export function nextInBatch(view: TransferBatchView, currentId: Id | null): Id | null {
  const list = view.members;
  const start = currentId ? list.findIndex((entry) => entry.questionId === currentId) : -1;
  for (let step = 1; step <= list.length; step++) {
    const candidate = list[(start + step + list.length) % list.length]!;
    if (candidate.questionId !== currentId && candidate.action === "review") return candidate.questionId;
  }
  return null;
}

/** Who still has to act, in plain words; never names anyone who could not approve. */
export function needsLabel(entry: Pick<BatchMember, "stage" | "approvers" | "approvalsNeeded" | "action" | "needsReReview">): string {
  if (entry.stage === "verified") return "Verified";
  if (entry.action === "changes-requested") return "Changes requested: waits for an author edit";
  const re = entry.needsReReview ? "Edited since last review; " : "";
  if (entry.approvers.length === 0) return `${re}needs ${REQUIRED_INDEPENDENT_APPROVALS} reviewers`;
  return `${re}needs ${entry.approvalsNeeded} more reviewer${entry.approvalsNeeded === 1 ? "" : "s"}, not ${entry.approvers.join(" or ")}`;
}

/** The part a transfer item is linked to, for showing the baseline beside it on the review screen. */
export function linkedPartFor(bank: readonly Question[], question: Question): { role: "transfer" | "baseline"; links: { question: Question; part: QuestionPart; ownPartId: Id }[] } | null {
  const partOwner = new Map<Id, { question: Question; part: QuestionPart }>();
  for (const entry of bank) for (const part of entry.parts) partOwner.set(part.id, { question: entry, part });
  const asTransfer = question.parts.flatMap((part) => {
    const target = part.learning?.transferLink?.baselinePartId?.trim();
    const found = target ? partOwner.get(target) : undefined;
    return found && found.question.id !== question.id ? [{ ...found, ownPartId: part.id }] : [];
  });
  if (asTransfer.length) return { role: "transfer", links: asTransfer };
  const ownParts = new Set(question.parts.map((part) => part.id));
  const asBaseline = bank.filter((entry) => entry.subjectId === question.subjectId && entry.id !== question.id).flatMap((entry) => entry.parts.flatMap((part) => {
    const target = part.learning?.transferLink?.baselinePartId?.trim();
    return target && ownParts.has(target) ? [{ question: entry, part, ownPartId: target }] : [];
  }));
  return asBaseline.length ? { role: "baseline", links: asBaseline } : null;
}
