// ---------------------------------------------------------------------------
// Question supply for proof. A topic can only be proven on questions the
// learner has not seen, and only verified questions count as evidence.
// Unverified questions can still be practised, but never inflate a claim.
// ---------------------------------------------------------------------------

import { learnerEvidenceTrusted } from "./content-trust";
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
    const trusted = learnerEvidenceTrusted(q);
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

/**
 * Why a subject cannot start the Diagnose → Prove loop yet, in the words the
 * learner reads on an otherwise empty Today screen.
 *
 * A new learner whose subject has authored questions but too few human-reviewed
 * ones sees "nothing to do", which reads as an unconfigured plan rather than as
 * an evidence gap. This says which of the two it is, using counts that are
 * actually in the bank — it never invents supply and never claims a shortfall
 * that has not been measured. Null when there is nothing to explain: there are
 * enough reviewed questions to plan with, or the subject has no questions at all
 * (which is reported separately, by the paths that know a subject is missing).
 */
export function reviewedSupplyNote(input: {
  supplyByTopic: Readonly<Record<Id, TopicSupply>>;
  /** Subject labels in the wording shown to the learner. */
  subjectLabels: readonly string[];
  /** Reviewed questions needed before a diagnostic can start. */
  minReviewed?: number;
  /** …and they must span this many topics, so a diagnostic can be a spread. */
  minReviewedTopics?: number;
}): string | null {
  const rows = Object.values(input.supplyByTopic);
  if (!rows.length) return null;
  const min = input.minReviewed ?? 3;
  const minTopics = input.minReviewedTopics ?? min;
  const reviewable = rows.reduce((sum, row) => sum + row.provable, 0);
  const spread = rows.filter((row) => row.provable > 0).length;
  if (reviewable >= min && spread >= minTopics) return null;
  const practisable = rows.reduce((sum, row) => sum + row.practiceOnly, 0);
  const one = input.subjectLabels.length === 1;
  const who = one ? input.subjectLabels[0]! : "These subjects";
  const verb = one ? "has" : "have";
  const questions = (n: number) => `${n.toLocaleString("en-GB")} question${n === 1 ? "" : "s"}`;
  if (reviewable === 0 && practisable === 0) return `Revise does not have any questions for ${who} yet.`;
  if (reviewable === 0) {
    return `${who} ${verb} ${questions(practisable)} you can practise, but none of them have been through human review yet. `
      + "You can practise and Revise will track what you lose, but it cannot yet prove an improvement or build a plan from them.";
  }
  if (spread < minTopics) {
    return `Revise ${verb} ${questions(reviewable)} for ${who} that ${one ? "has" : "have"} been through human review, `
      + `spread across only ${spread} topic${spread === 1 ? "" : "s"}. A diagnostic needs ${minTopics} different topics, so there is nothing to rank yet — `
      + "keep practising, and the plan appears as more topics are reviewed.";
  }
  return `Revise only ${verb} ${questions(reviewable)} for ${who} that ${one ? "has" : "have"} been through human review, `
    + `and needs ${min} before it can offer a diagnostic. There is nothing to rank yet, so keep practising — the plan appears as questions are reviewed.`;
}
