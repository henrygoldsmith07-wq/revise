// ---------------------------------------------------------------------------
// Plain-language content-trust label. A thin mapping over the repo's existing
// trust predicates (trustedAssessmentContent, isFlagship) and the supply
// audit's counts; it defines no trust rule of its own.
//
// Provenance tiers (reference → authored → reviewed → independently reviewed
// → trusted → proof-capable) describe how far a question has travelled.
// TrustTier (trusted / reference / unverified / insufficient) remains the
// backwards-compatible learner summary.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { isFlagship } from "./flagship";
import { officialPaperQuestionEligible, type OfficialPaperManifest } from "./official-papers";
import { MIN_PROVABLE_QUESTIONS } from "./supply";
import type { Id, Question } from "./types";

export type TrustTier = "trusted" | "reference" | "unverified" | "insufficient";

export const TRUST_LABEL: Record<TrustTier, string> = {
  trusted: "Trusted, reviewed material",
  reference: "Reference material",
  unverified: "Not yet checked",
  insufficient: "Not enough questions to prove this yet",
};

/** Editorial journey of one question. Generated content never skips steps. */
export type ProvenanceTier =
  | "reference"
  | "authored"
  | "reviewed"
  | "independently-reviewed"
  | "trusted"
  | "proof-capable";

export const PROVENANCE_LABEL: Record<ProvenanceTier, string> = {
  reference: "Reference · not spec-checked",
  authored: "Authored · awaiting review",
  reviewed: "Reviewed · one check",
  "independently-reviewed": "Independently reviewed",
  trusted: "Trusted, reviewed material",
  "proof-capable": "Proof-capable · trusted and unseen",
};

export function provenanceTier(question: Question): ProvenanceTier {
  if (!isFlagship(question.subjectId)) return "reference";
  if (question.origin === "ai" || question.source === "generated") {
    // Generated questions must pass human review before they leave "authored".
    return question.verification === "verified" && trustedAssessmentContent(question)
      ? "trusted"
      : "authored";
  }
  if (trustedAssessmentContent(question)) {
    const checks = question.humanVerification?.checks;
    const count = checks ? Object.values(checks).filter(Boolean).length : 0;
    if (count >= 6) return "trusted";
    return "independently-reviewed";
  }
  if (question.verification === "checked") return "reviewed";
  return "authored";
}

export const provenanceLabel = (question: Question): string =>
  PROVENANCE_LABEL[provenanceTier(question)];

/** Trusted + unseen questions can carry proof; everything else is practice only. */
export function isProofCapable(question: Question, seenQuestionIds: ReadonlySet<Id>): boolean {
  return trustedAssessmentContent(question) && !seenQuestionIds.has(question.id);
}

/**
 * Official-paper tier label for one question. Distinct from every TrustTier:
 * an official-paper question still reads as unverified/insufficient in the
 * normal summary, and this sentence appears only where the learner confirmed
 * the match. Never merged with the two-reviewer tier in any metric.
 */
export function officialPaperLabel(
  question: Question,
  manifest: OfficialPaperManifest,
  enabled: boolean,
): string | null {
  if (!officialPaperQuestionEligible(question, manifest, enabled)) return null;
  return "Official paper · confirmed match, this learner only — counts toward proof here, never in shared coverage";
}

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
