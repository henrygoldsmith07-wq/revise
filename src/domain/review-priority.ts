// ---------------------------------------------------------------------------
// Review prioritisation: which existing question should a human review next to
// unlock the most product capability per review?
//
// Pure and deterministic. The supply audit's clusters are the source of truth
// for "what already counts": a cluster (one question in disguise) with a
// trusted member is covered, and only one member of an uncovered cluster is
// ever proposed, so reviewers never spend time on reskins. A greedy marginal
// simulation scores each candidate by the capabilities it newly unlocks for its
// topic given everything ranked above it, divided by the approvals it still
// needs (finishing a half-reviewed question is cheaper than starting one).
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { questionGateIssues, blockingGates, hasDataRepresentation, type GateContext } from "./review-gates";
import { reviewStateOf, type ReviewAuditEvent, type ReviewStage } from "./review-workflow";
import { quickItemSeconds } from "./quick-diagnostic";
import { FLAGSHIP_SUBJECTS } from "./flagship";
import { isDataAnalysis, topicQuestionClusters, type SupplyAuditOptions } from "./supply-audit";
import { relativeTopicWeight, topicShares } from "./topic-weight";
import { MIN_PROVABLE_QUESTIONS } from "./supply";
import type { Id, Question, Topic } from "./types";

export const REQUIRED_TRUSTED_DISTINCT = MIN_PROVABLE_QUESTIONS;
export const REQUIRED_TRUSTED_TRANSFER = 1;
/** Baseline attempt + independent success + a fresh question for the delayed check. */
export const DELAYED_PROOF_DISTINCT = 3;
/** Topics with a trusted, short question before the cold-start diagnostic can run. */
export const COLD_START_TOPIC_TARGET = 5;
export const DIAGNOSTIC_MAX_SECONDS = 180;

export type Capability =
  | "cold-start-diagnostic" | "first-trusted-question" | "second-distinct-question" | "exam-mission-proof"
  | "first-transfer-question" | "first-data-question" | "delayed-proof" | "replaces-reskin-supply";

/** Marginal unlock value, in the product's own priority order. */
export const UNLOCK_POINTS: Record<Capability, number> = {
  "cold-start-diagnostic": 100,
  "second-distinct-question": 80,
  "first-transfer-question": 60,
  "first-data-question": 50,
  "delayed-proof": 40,
  "first-trusted-question": 40,
  "exam-mission-proof": 30,
  "replaces-reskin-supply": 10,
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "cold-start-diagnostic": "helps unlock the cold-start diagnostic",
  "first-trusted-question": "first trusted question for this topic",
  "second-distinct-question": "second distinct trusted question (topic can be proven)",
  "exam-mission-proof": "Exam Mission proof for this topic",
  "first-transfer-question": "first trusted transfer question",
  "first-data-question": "first trusted data/practical question",
  "delayed-proof": "delayed-proof sessions",
  "replaces-reskin-supply": "replaces reskinned supply with different reasoning",
};

const DATA_TOPIC = /practical|data|graph|statistic|hypothesis|correlation|distribution|investigat|spectr|analysis|skills|measurement|chromatograph|titration/i;

export interface ReviewPriorityInput {
  topics: readonly Topic[];
  questions: readonly Question[];
  auditEvents?: readonly ReviewAuditEvent[];
  gate: GateContext;
  /** Nearest exam date per subject (ISO date), for the proximity multiplier. */
  examDates?: Readonly<Record<Id, string>>;
  now?: Date;
  trusted?: SupplyAuditOptions["trusted"];
  subjectIds?: readonly Id[];
  /** Campaigns rank marginal capability per estimated reviewer minute. */
  optimiseReviewerTime?: boolean;
}

export interface ReviewQueueItem {
  rank: number;
  questionId: Id;
  subjectId: Id;
  topicId: Id;
  score: number;
  unlocks: Capability[];
  stage: ReviewStage;
  reviewsNeeded: number;
  reviewMinutes: number;
  /** Other questions in the same reskin cluster: covered by this review, not extra reviews. */
  clusterSize: number;
  warnings: string[];
  kind: "transfer" | "data" | "diagnostic" | "standard";
}

export interface TopicReviewRow {
  subjectId: Id;
  topicId: Id;
  title: string;
  trustedDistinct: number;
  requiredDistinct: number;
  trustedTransfer: number;
  requiredTransfer: number;
  trustedData: number;
  requiresData: boolean;
  delayedProofReady: boolean;
  proofBlocked: boolean;
  next: ReviewQueueItem | null;
  /** What reviewing every proposed question would still not provide: must be authored or revised. */
  authoringNeeded: { distinct: number; transfer: boolean; data: boolean };
  /** Authored questions in this topic that fail a blocking gate and need revision before review. */
  blockedByGates: number;
  awaitingRevision: number;
  reviewQueueSize: number;
}

export interface SubjectReviewSummary {
  subjectId: Id;
  label: string;
  topics: number;
  trustedQuestions: number;
  topicsWithProof: number;
  coldStartTopics: number;
  coldStartTarget: number;
  coldStartReady: boolean;
  missionProofTopics: number;
  delayedProofTopics: number;
  topicsNeedingNewAuthoring: number;
}

export interface ReviewPriorityReport {
  queue: ReviewQueueItem[];
  topics: TopicReviewRow[];
  subjects: SubjectReviewSummary[];
}

interface Candidate {
  question: Question;
  transfer: boolean;
  data: boolean;
  diagnostic: boolean;
  stage: ReviewStage;
  reviewsNeeded: number;
  warnings: string[];
}

/** Solve independently, inspect marking/specification and record all six checks.
 * Planning estimate only; never evidence of review or a timing guarantee. */
export function estimatedReviewMinutes(question: Question): number {
  return Math.ceil(quickItemSeconds(question) / 60 + 3 + question.parts.length * 0.5);
}

interface BestPick { cluster: number; member: Candidate; score: number; unlocks: Capability[]; value: number }

interface TopicState {
  topic: Topic;
  requiresData: boolean;
  multiplier: number;
  distinct: number;
  transfer: number;
  data: number;
  trustedTransfer: number;
  trustedData: number;
  trustedDistinct: number;
  startedDiagnosticCovered: boolean;
  diagnosticCovered: boolean;
  reskinTrusted: boolean;
  candidates: Candidate[][]; // one list of members per uncovered cluster
  blockedByGates: number;
  awaitingRevision: number;
}

const isTransferDemand = (q: Question) => [q.learning?.demand, ...q.parts.map((p) => p.learning?.demand)].some((d) => d === "transfer" || d === "synoptic");

function proximityMultiplier(date: string | undefined, now: Date): number {
  if (!date) return 1;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return days <= 60 ? 1.5 : days <= 120 ? 1.25 : 1;
}

function gain(state: TopicState, candidate: Candidate, subjectCovered: number, coldTarget: number): { score: number; unlocks: Capability[] } {
  const unlocks: Capability[] = [];
  const next = state.distinct + 1;
  if (candidate.diagnostic && !state.diagnosticCovered && subjectCovered < coldTarget) unlocks.push("cold-start-diagnostic");
  if (state.distinct === 0) unlocks.push("first-trusted-question");
  if (next === REQUIRED_TRUSTED_DISTINCT) unlocks.push("second-distinct-question", "exam-mission-proof");
  if (candidate.transfer && state.transfer < REQUIRED_TRUSTED_TRANSFER) unlocks.push("first-transfer-question");
  if (candidate.data && state.requiresData && state.data === 0) unlocks.push("first-data-question");
  if (next === DELAYED_PROOF_DISTINCT) unlocks.push("delayed-proof");
  if (state.reskinTrusted && next >= REQUIRED_TRUSTED_DISTINCT) unlocks.push("replaces-reskin-supply");
  const base = unlocks.reduce((sum, u) => sum + UNLOCK_POINTS[u], 0);
  return { score: base * state.multiplier, unlocks };
}

export function buildReviewPriorities(input: ReviewPriorityInput): ReviewPriorityReport {
  const now = input.now ?? new Date();
  const events = input.auditEvents ?? [];
  const subjectIds = input.subjectIds ?? FLAGSHIP_SUBJECTS.map((f) => f.subjectId);
  const options: SupplyAuditOptions = input.trusted ? { trusted: input.trusted } : {};
  const topics = input.topics.filter((t) => subjectIds.includes(t.subjectId)).sort((a, b) => a.id.localeCompare(b.id));
  const shares = topicShares(input.topics);
  const perSubject = new Map<Id, number>();
  for (const t of topics) perSubject.set(t.subjectId, (perSubject.get(t.subjectId) ?? 0) + 1);
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  const trustedOf = input.trusted ?? trustedAssessmentContent;

  const states = new Map<Id, TopicState>();
  for (const topic of topics) {
    const clusters = topicQuestionClusters(topic, input.questions, options);
    let distinct = 0, transfer = 0, data = 0, diagnosticCovered = false, reskinTrusted = false, blockedByGates = 0, awaitingRevision = 0;
    const candidates: Candidate[][] = [];
    let dataAuthored = 0;
    for (const cluster of clusters) {
      const members = cluster.ids.map((id) => byId.get(id)!);
      if (cluster.trustedIds.length) {
        distinct++;
        if (cluster.trustedIds.length > 1) reskinTrusted = true;
        for (const id of cluster.trustedIds) {
          const q = byId.get(id)!;
          if (isTransferDemand(q)) transfer++;
          if (isDataAnalysis(q)) data++;
        }
        if (cluster.trustedIds.some((id) => quickItemSeconds(byId.get(id)!) <= DIAGNOSTIC_MAX_SECONDS)) diagnosticCovered = true;
        continue;
      }
      const usable: Candidate[] = [];
      for (const q of members) {
        if (isDataAnalysis(q)) dataAuthored++;
        const issues = questionGateIssues(q, input.gate);
        const state = reviewStateOf(q, events);
        if (blockingGates(issues).length) { blockedByGates++; continue; }
        if (state.lastDecision === "reject" || state.lastDecision === "revise") { awaitingRevision++; continue; }
        usable.push({
          question: q, stage: state.stage, reviewsNeeded: state.approvalsNeeded,
          transfer: isTransferDemand(q),
          data: isDataAnalysis(q) && hasDataRepresentation(q),
          diagnostic: quickItemSeconds(q) <= DIAGNOSTIC_MAX_SECONDS,
          warnings: issues.map((i) => i.detail),
        });
      }
      if (usable.length) candidates.push(usable);
    }
    const share = shares.get(topic.id) ?? 0;
    const weight = Math.min(2, Math.max(0.5, relativeTopicWeight(share, perSubject.get(topic.subjectId) ?? 1)));
    const requiresData = DATA_TOPIC.test(topic.title) || dataAuthored + data >= 2;
    states.set(topic.id, {
      topic, requiresData, multiplier: weight * proximityMultiplier(input.examDates?.[topic.subjectId], now),
      distinct, transfer, data, trustedTransfer: transfer, trustedData: data, trustedDistinct: distinct,
      startedDiagnosticCovered: diagnosticCovered, diagnosticCovered, reskinTrusted, candidates, blockedByGates, awaitingRevision,
    });
  }

  const covered = new Map<Id, number>();
  for (const s of states.values()) if (s.diagnosticCovered) covered.set(s.topic.subjectId, (covered.get(s.topic.subjectId) ?? 0) + 1);

  const best = (state: TopicState): BestPick | null => {
    const coldTarget = Math.min(COLD_START_TOPIC_TARGET, perSubject.get(state.topic.subjectId) ?? 0);
    let top: BestPick | null = null;
    state.candidates.forEach((members, cluster) => {
      for (const member of members) {
        const g = gain(state, member, covered.get(state.topic.subjectId) ?? 0, coldTarget);
        const cost = member.reviewsNeeded * (input.optimiseReviewerTime ? estimatedReviewMinutes(member.question) : 1);
        const value = g.score / Math.max(0.25, cost);
        if (g.score <= 0) continue;
        const current = top as BestPick | null;
        if (!current || value > current.value || (value === current.value && member.question.id < current.member.question.id)) top = { cluster, member, score: g.score, unlocks: g.unlocks, value };
      }
    });
    return top;
  };

  const queue: ReviewQueueItem[] = [];
  const firstForTopic = new Map<Id, ReviewQueueItem>();
  const sizes = new Map<Id, number>();
  for (const s of states.values()) sizes.set(s.topic.id, 0);
  for (;;) {
    let pick: { state: TopicState; top: BestPick } | null = null;
    for (const state of states.values()) {
      const top = best(state);
      if (!top) continue;
      const current = pick as { state: TopicState; top: BestPick } | null;
      if (!current || top.value > current.top.value || (top.value === current.top.value && top.member.question.id < current.top.member.question.id)) pick = { state, top };
    }
    if (!pick) break;
    const { state, top } = pick as { state: TopicState; top: BestPick };
    const members = state.candidates[top.cluster]!;
    const item: ReviewQueueItem = {
      rank: queue.length + 1, questionId: top.member.question.id, subjectId: state.topic.subjectId, topicId: state.topic.id,
      score: Math.round(top.value * 10) / 10, unlocks: top.unlocks, stage: top.member.stage, reviewsNeeded: top.member.reviewsNeeded,
      reviewMinutes: top.member.reviewsNeeded * estimatedReviewMinutes(top.member.question),
      clusterSize: members.length, warnings: top.member.warnings,
      kind: top.member.transfer && top.unlocks.includes("first-transfer-question") ? "transfer" : top.member.data && top.unlocks.includes("first-data-question") ? "data" : top.unlocks.includes("cold-start-diagnostic") ? "diagnostic" : "standard",
    };
    queue.push(item);
    if (!firstForTopic.has(state.topic.id)) firstForTopic.set(state.topic.id, item);
    sizes.set(state.topic.id, (sizes.get(state.topic.id) ?? 0) + 1);
    if (top.unlocks.includes("cold-start-diagnostic")) { state.diagnosticCovered = true; covered.set(state.topic.subjectId, (covered.get(state.topic.subjectId) ?? 0) + 1); }
    else if (top.member.diagnostic && !state.diagnosticCovered) state.diagnosticCovered = true;
    state.distinct++;
    if (top.member.transfer) state.transfer++;
    if (top.member.data) state.data++;
    state.candidates.splice(top.cluster, 1);
  }

  const rows: TopicReviewRow[] = topics.map((topic) => {
    const state = states.get(topic.id)!;
    return {
      subjectId: topic.subjectId, topicId: topic.id, title: topic.title,
      trustedDistinct: state.trustedDistinct, requiredDistinct: REQUIRED_TRUSTED_DISTINCT,
      trustedTransfer: state.trustedTransfer, requiredTransfer: REQUIRED_TRUSTED_TRANSFER, trustedData: state.trustedData, requiresData: state.requiresData,
      delayedProofReady: state.trustedDistinct >= DELAYED_PROOF_DISTINCT,
      proofBlocked: state.trustedDistinct < REQUIRED_TRUSTED_DISTINCT,
      next: firstForTopic.get(topic.id) ?? null,
      authoringNeeded: {
        distinct: Math.max(0, REQUIRED_TRUSTED_DISTINCT - state.distinct),
        transfer: state.transfer < REQUIRED_TRUSTED_TRANSFER,
        data: state.requiresData && state.data === 0,
      },
      blockedByGates: state.blockedByGates, awaitingRevision: state.awaitingRevision, reviewQueueSize: sizes.get(topic.id) ?? 0,
    };
  });

  const subjects: SubjectReviewSummary[] = subjectIds.map((subjectId) => {
    const own = rows.filter((r) => r.subjectId === subjectId);
    const coldTopics = own.filter((r) => states.get(r.topicId)!.startedDiagnosticCovered).length;
    const target = Math.min(COLD_START_TOPIC_TARGET, own.length);
    return {
      subjectId, label: FLAGSHIP_SUBJECTS.find((f) => f.subjectId === subjectId)?.label ?? subjectId, topics: own.length,
      trustedQuestions: input.questions.filter((q) => q.subjectId === subjectId && trustedOf(q)).length,
      topicsWithProof: own.filter((r) => !r.proofBlocked).length, coldStartTopics: coldTopics, coldStartTarget: target,
      coldStartReady: target > 0 && coldTopics >= target,
      missionProofTopics: own.filter((r) => !r.proofBlocked && r.trustedTransfer >= REQUIRED_TRUSTED_TRANSFER).length,
      delayedProofTopics: own.filter((r) => r.delayedProofReady).length,
      topicsNeedingNewAuthoring: own.filter((r) => r.authoringNeeded.distinct > 0 || r.authoringNeeded.transfer || r.authoringNeeded.data).length,
    };
  });
  return { queue, topics: rows, subjects };
}

