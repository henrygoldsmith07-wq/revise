// ---------------------------------------------------------------------------
// Plain-language content-trust label. A thin mapping over the repo's existing
// trust predicates (trustedAssessmentContent, isFlagship) and the supply
// audit's counts; it defines no trust rule of its own.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { isFlagship } from "./flagship";
import { MIN_PROVABLE_QUESTIONS } from "./supply";
import type { Id, Question } from "./types";

export type TrustTier = "trusted" | "reference" | "unverified" | "insufficient";

export const TRUST_LABEL: Record<TrustTier, string> = {
  trusted: "Trusted, reviewed material",
  reference: "Reference material",
  unverified: "Not yet checked",
  insufficient: "Not enough questions to prove this yet",
};

/** Topic-level supply, as produced by unseenSupplyByTopic or the supply audit. */
export interface TopicTrustInput {
  subjectId: Id;
  /** Unseen trusted questions; use the audit's provableDistinct when known. */
  provable: number;
  /** Unseen but unreviewed questions: practice only. */
  practiceOnly: number;
}

export function isTopicTrustInput(input: Question | TopicTrustInput): input is TopicTrustInput {
  return "provable" in input;
}

/**
 * Question: reference subjects are reference whatever their flags say;
 * flagship questions are trusted only if the repo's predicate passes.
 * Topic: trusted needs enough distinct trusted questions to prove; fewer is
 * unverified when only unreviewed material exists, otherwise insufficient.
 */
export function trustTier(input: Question | TopicTrustInput): TrustTier {
  if (!isFlagship(input.subjectId)) return "reference";
  if (!isTopicTrustInput(input)) return trustedAssessmentContent(input) ? "trusted" : "unverified";
  if (input.provable >= MIN_PROVABLE_QUESTIONS) return "trusted";
  return input.provable === 0 && input.practiceOnly > 0 ? "unverified" : "insufficient";
}

export const trustLabel = (input: Question | TopicTrustInput): string => TRUST_LABEL[trustTier(input)];

/**
 * One sentence when trust changes what the learner should do, else null so
 * the UI stays quiet. "insufficient" only matters when proof is the purpose.
 */
export function trustNoteFor(input: Question | TopicTrustInput, purpose: "practice" | "proof" = "practice"): string | null {
  const tier = trustTier(input);
  if (tier === "trusted") return null;
  if (tier === "reference") return "This is reference material: good for practice, but not checked against the exam board's specification.";
  if (tier === "unverified") return purpose === "proof"
    ? "These questions have not been checked yet, so they can be practised but cannot prove improvement."
    : "These questions have not been checked yet, so treat the marking as a guide.";
  return purpose === "proof" ? "There are not yet enough different checked questions to prove improvement here." : null;
}
