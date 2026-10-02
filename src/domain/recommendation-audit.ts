// ---------------------------------------------------------------------------
// Recommendation audit — did following Revise's session pick coincide with
// proven improvement on that topic?
//
// Joins the funnel's recommendation events (task id "adaptive:<topic>:<day>")
// to the proof ledger. This is a descriptive audit of one learner's history,
// not a causal estimate: students who follow advice may differ from those who
// do not, and a topic can improve for other reasons. The causal question is
// answered only by the randomised experiment in recommendation-experiment.ts.
// ---------------------------------------------------------------------------

import type { FunnelEvent } from "./funnel";
import type { ProofLedger, TopicProof } from "./proof-of-improvement";
import type { Id } from "./types";

export const AUDIT_MIN_TOPICS = 3;

export type TopicVerdict = "proven" | "declined" | "illusory" | "no-change" | "awaiting-proof" | "no-proof-yet";

export interface AuditTopicRow {
  topicId: Id;
  shown: number;
  accepted: number;
  verdict: TopicVerdict;
  /** Gain in marks of a 100-mark exam, only for proven gains and declines. */
  markPoints: number;
}

export interface RecommendationAudit {
  shown: number;
  accepted: number;
  /** Null with nothing shown. */
  acceptRate: number | null;
  topics: AuditTopicRow[];
  /** Topics accepted at least once, split by what the proof ledger says. */
  acceptedOutcomes: Record<TopicVerdict, number>;
  /** Marks proven on topics the learner accepted vs topics they never accepted. */
  provenMarksAccepted: number;
  provenMarksOther: number;
  /** False until enough accepted topics exist; wording must stay cautious while false. */
  sufficient: boolean;
  headline: string;
}

const TASK = /^adaptive:(.+):(\d{4}-\d{2}-\d{2})$/;

function verdictFor(proof: TopicProof | undefined): TopicVerdict {
  if (!proof) return "no-proof-yet";
  if (proof.illusory) return "illusory";
  switch (proof.status) {
    case "proven-gain": return "proven";
    case "declined": return "declined";
    case "held":
    case "no-clear-change": return "no-change";
    case "awaiting-proof": return "awaiting-proof";
    default: return proof.proofDue ? "awaiting-proof" : "no-proof-yet";
  }
}

export function auditRecommendations(events: readonly FunnelEvent[], ledger: ProofLedger | undefined): RecommendationAudit {
  const proofByTopic = new Map((ledger?.topics ?? []).map((row) => [row.topicId, row] as const));
  const shownTasks = new Map<string, Id>();
  const acceptedTasks = new Set<string>();
  for (const event of events) {
    const match = event.detail ? TASK.exec(event.detail) : null;
    if (!match) continue;
    if (event.type === "recommendation_displayed") shownTasks.set(event.detail!, match[1]!);
    else if (event.type === "recommendation_accepted") acceptedTasks.add(event.detail!);
  }
  // An acceptance counts only when that recommendation was recorded as shown.
  const accepted = [...acceptedTasks].filter((task) => shownTasks.has(task));

  const rows = new Map<Id, AuditTopicRow>();
  const row = (topicId: Id): AuditTopicRow => {
    const existing = rows.get(topicId) ?? { topicId, shown: 0, accepted: 0, verdict: verdictFor(proofByTopic.get(topicId)), markPoints: proofByTopic.get(topicId)?.markPoints ?? 0 };
    rows.set(topicId, existing);
    return existing;
  };
  for (const [, topicId] of shownTasks) row(topicId).shown += 1;
  for (const task of accepted) row(shownTasks.get(task)!).accepted += 1;

  const topics = [...rows.values()].sort((a, b) => b.accepted - a.accepted || b.shown - a.shown || a.topicId.localeCompare(b.topicId));
  const acceptedTopics = topics.filter((r) => r.accepted > 0);
  const acceptedOutcomes: Record<TopicVerdict, number> = { proven: 0, declined: 0, illusory: 0, "no-change": 0, "awaiting-proof": 0, "no-proof-yet": 0 };
  for (const r of acceptedTopics) acceptedOutcomes[r.verdict] += 1;

  const accountedMarks = (list: AuditTopicRow[]) => Math.round(list.filter((r) => r.verdict === "proven").reduce((sum, r) => sum + r.markPoints, 0) * 10) / 10;
  const acceptedIds = new Set(acceptedTopics.map((r) => r.topicId));
  const other = (ledger?.topics ?? []).filter((t) => !acceptedIds.has(t.topicId) && t.status === "proven-gain" && !t.illusory);
  const provenMarksOther = Math.round(other.reduce((sum, t) => sum + t.markPoints, 0) * 10) / 10;

  const sufficient = acceptedTopics.length >= AUDIT_MIN_TOPICS;
  const shown = shownTasks.size;
  let headline: string;
  if (!shown) headline = "No recommendations have been recorded yet.";
  else if (!accepted.length) headline = `${shown} session${shown === 1 ? " was" : "s were"} suggested and none started from Today yet.`;
  else if (!sufficient) headline = `You started ${accepted.length} of ${shown} suggested sessions. That is too little to say whether they helped.`;
  else headline = `You started ${accepted.length} of ${shown} suggested sessions. ${acceptedOutcomes.proven} of ${acceptedTopics.length} of those topics show proven gain on new questions; ${acceptedOutcomes["no-change"]} show no clear change; ${acceptedOutcomes["awaiting-proof"] + acceptedOutcomes["no-proof-yet"]} have no proof yet. This describes your own history and does not show the suggestions caused it.`;

  return {
    shown,
    accepted: accepted.length,
    acceptRate: shown ? Math.round((accepted.length / shown) * 1000) / 1000 : null,
    topics,
    acceptedOutcomes,
    provenMarksAccepted: accountedMarks(acceptedTopics),
    provenMarksOther,
    sufficient,
    headline,
  };
}
