// ---------------------------------------------------------------------------
// Proof lifecycle — where a topic stands on "did the revision actually work?".
//
//   Weak → Practising → Looks learned → Awaiting proof → Proven improved
//   (or No clear improvement / Slipped; Holding for topics already strong)
//
// This is a read-only join of two existing systems: the proof ledger (delayed,
// unseen, unaided comparisons) and the mastery stage (how much independent
// evidence exists). It never decides anything new. Good performance straight
// after revision can only reach "Looks learned"; "Proven" needs the ledger.
// ---------------------------------------------------------------------------

import { masteryStage, type MasteryStage } from "./mastery-stage";
import { roughPercent } from "./plain-numbers";
import type { ProofLedger, TopicProof } from "./proof-of-improvement";
import type { Attempt, Id, Question, Topic } from "./types";

export type LifecycleStage =
  | "not-started"
  | "weak"
  | "practising"
  | "looks-learned"
  | "awaiting-proof"
  | "proven"
  | "holding"
  | "no-clear-improvement"
  | "slipped"
  | "fading";

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  "not-started": "Not started",
  weak: "Weak",
  practising: "Practising",
  "looks-learned": "Looks learned",
  "awaiting-proof": "Awaiting proof",
  proven: "Proven improved",
  holding: "Strong and holding",
  "no-clear-improvement": "No clear improvement",
  slipped: "Slipped",
  fading: "Fading",
};

export interface TopicLifecycle {
  topicId: Id;
  stage: LifecycleStage;
  label: string;
  /** One honest sentence about what this state does and does not mean. */
  line: string;
  /** Present only when the ledger proves a gain on unseen questions after a delay. */
  claim: string | null;
  /** A delayed check on new questions can be taken now. */
  dueNow: boolean;
  /** Strong on familiar questions but not on new ones. */
  memorised: boolean;
}

const LINES: Record<LifecycleStage, string> = {
  "not-started": "No evidence yet.",
  weak: "Unaided answers so far are mostly losing marks.",
  practising: "Some unaided practice recorded; not yet enough different questions to judge.",
  "looks-learned": "Doing well, but this is not proof yet. It only counts after a delay, on questions you have not seen.",
  "awaiting-proof": "Revised and waiting for a delayed check on new questions.",
  proven: "Improved on questions you had not seen, measured after a delay.",
  holding: "Already strong, and staying strong on new questions after a delay.",
  "no-clear-improvement": "Checked after a delay on new questions and no clear change yet.",
  slipped: "Scored lower on new questions after a delay than before.",
  fading: "Was secure, but the last evidence is old enough to need refreshing.",
};

function claimFor(proof: TopicProof, title: string): string | null {
  if (proof.status !== "proven-gain" || proof.illusory || !proof.before || !proof.after) return null;
  return `Your unseen-question performance in ${title} improved from ${roughPercent(proof.before.rate)} to ${roughPercent(proof.after.rate)} after revision.`;
}

export function topicLifecycle(input: {
  topic: Pick<Topic, "id" | "title">;
  proof?: TopicProof;
  attempts: readonly Attempt[];
  questions: readonly Question[];
  cardsReviewed?: boolean;
  now?: Date;
}): TopicLifecycle {
  const { topic, proof } = input;
  const mastery = masteryStage({ topicId: topic.id, attempts: input.attempts, questions: input.questions, cardsReviewed: input.cardsReviewed, now: input.now });
  const memorised = Boolean(proof?.illusory);
  const make = (stage: LifecycleStage, extra: Partial<TopicLifecycle> = {}): TopicLifecycle => ({
    topicId: topic.id, stage, label: LIFECYCLE_LABEL[stage], line: LINES[stage],
    claim: null, dueNow: false, memorised, ...extra,
  });

  // Ledger verdicts come first: they are the only source of "proven" or "slipped".
  if (proof?.status === "declined") return make("slipped");
  if (proof?.status === "proven-gain" && !proof.illusory) return make("proven", { claim: claimFor(proof, topic.title) });
  if (proof?.status === "held") return make("holding");
  if (proof?.status === "no-clear-change") return make("no-clear-improvement");
  if (proof?.illusory) return make("looks-learned", { line: "Strong on questions you have seen, weaker on new ones. That looks memorised rather than learned." });
  if (proof?.status === "awaiting-proof") {
    return make("awaiting-proof", { dueNow: proof.proofDue, line: proof.proofDue ? "A delayed check on new questions is due now." : LINES["awaiting-proof"] });
  }

  // No ledger verdict: fall back to how much independent evidence exists.
  const stage: MasteryStage = mastery.stage;
  if (stage === "untouched") return make("not-started");
  if (stage === "fading") return make("fading");
  if (stage === "learning") {
    const weak = mastery.evidence.independentQuestions >= 3 && (mastery.evidence.accuracy ?? 1) < 0.5;
    return make(weak ? "weak" : "practising");
  }
  if (stage === "practised") return make("practising");
  // Secure or proven by evidence alone, with no ledger comparison: still needs a delayed check.
  return make("looks-learned");
}

export function buildTopicLifecycles(input: {
  topics: readonly Pick<Topic, "id" | "title">[];
  ledger?: ProofLedger;
  attempts: readonly Attempt[];
  questions: readonly Question[];
  reviewedTopicIds?: ReadonlySet<Id>;
  now?: Date;
}): TopicLifecycle[] {
  const proofs = new Map((input.ledger?.topics ?? []).map((row) => [row.topicId, row] as const));
  return input.topics.map((topic) => topicLifecycle({
    topic, proof: proofs.get(topic.id), attempts: input.attempts, questions: input.questions,
    cardsReviewed: input.reviewedTopicIds?.has(topic.id), now: input.now,
  }));
}
