// ---------------------------------------------------------------------------
// Question supply for proof. A topic can only be proven on questions the
// learner has not seen, and only verified questions count as evidence.
// Unverified questions can still be practised, but never inflate a claim.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { isTransferQuestion, unseenQuestion } from "./learning-evidence";
import type { Attempt, Id, Question } from "./types";

export interface TopicSupply {
  /** Unseen, verified questions: the only ones that can prove improvement. */
  provable: number;
  /** Unseen but not human-verified: practice only. */
  practiceOnly: number;
  /** Unseen, verified, unfamiliar-context questions. */
  transfer: number;
}

export function unseenSupplyByTopic(topicIds: Iterable<Id>, questions: readonly Question[], attempts: readonly Attempt[]): Record<Id, TopicSupply> {
  const topics = new Set(topicIds);
  const out: Record<Id, TopicSupply> = {};
  for (const topic of topics) out[topic] = { provable: 0, practiceOnly: 0, transfer: 0 };
  for (const q of questions) {
    const hits = q.topicIds.filter((t) => topics.has(t));
    if (!hits.length || !unseenQuestion(q, attempts, questions)) continue;
    const trusted = trustedAssessmentContent(q);
    const transfer = trusted && isTransferQuestion(q);
    for (const t of hits) {
      const row = out[t]!;
      if (trusted) row.provable++; else row.practiceOnly++;
      if (transfer) row.transfer++;
    }
  }
  return out;
}

export type EvidenceLimit =
  | "no-unseen-verified" | "one-unseen-verified" | "only-unverified" | "no-transfer" | "exam-too-close" | "thin-evidence" | "no-delayed-evidence";

export interface EvidenceLimitNote { kind: EvidenceLimit; text: string }

export const MIN_PROVABLE_QUESTIONS = 2;

/** Why Revise cannot (yet) prove improvement, in plain language. Empty when it can. */
export function evidenceLimits(input: {
  supply: TopicSupply;
  daysToExam: number | null;
  minProofDays: number;
  trustedAttempts: number;
  delayedChecked: boolean;
}): EvidenceLimitNote[] {
  const out: EvidenceLimitNote[] = [];
  const { supply } = input;
  if (supply.provable === 0 && supply.practiceOnly > 0) out.push({ kind: "only-unverified", text: "the remaining new questions have not been reviewed yet, so they can be practised but not used as proof" });
  else if (supply.provable === 0) out.push({ kind: "no-unseen-verified", text: "there are no new reviewed questions left" });
  else if (supply.provable < MIN_PROVABLE_QUESTIONS) out.push({ kind: "one-unseen-verified", text: "only one new reviewed question is left" });
  if (supply.transfer === 0) out.push({ kind: "no-transfer", text: "there is no new unfamiliar-context question to test transfer" });
  if (input.daysToExam !== null && input.daysToExam <= input.minProofDays) out.push({ kind: "exam-too-close", text: "the exam is too close for a delayed check" });
  if (input.trustedAttempts < 3) out.push({ kind: "thin-evidence", text: "there are too few trusted answers to judge this yet" });
  if (!input.delayedChecked) out.push({ kind: "no-delayed-evidence", text: "there is no delayed evidence yet" });
  return out;
}

/** Blocks proof outright (as opposed to merely weakening it). */
export function proofBlocked(notes: readonly EvidenceLimitNote[]): boolean {
  return notes.some((n) => n.kind === "no-unseen-verified" || n.kind === "one-unseen-verified" || n.kind === "only-unverified" || n.kind === "exam-too-close");
}

export function limitsSentence(notes: readonly EvidenceLimitNote[]): string | null {
  const blocking = notes.filter((n) => ["no-unseen-verified", "one-unseen-verified", "only-unverified", "exam-too-close"].includes(n.kind));
  if (!blocking.length) return null;
  return `You can still revise this, but Revise cannot currently prove the improvement because ${blocking.map((n) => n.text).join(" and ")}.`;
}
