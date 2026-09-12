// ---------------------------------------------------------------------------
// Synoptic coverage: combining previously-separate capabilities.
//
// A single part must isolate one smallest skill, so a synoptic item is a whole
// question whose parts exercise two or more distinct capabilities together —
// the way a real exam question links, say, energy conservation to circular
// motion. Durable marks come from meeting *new* combinations, not from re-sitting
// a pair already secured. This module enumerates the combinations a learner has
// already encountered and surfaces the high-value unseen ones, so selection can
// reward joining separately-developing skills instead of repeating one pair.
//
// Pure and deterministic.
// ---------------------------------------------------------------------------

import { reasoningProfileOf } from "./reasoning-signature";
import { questionCapabilities, questionDemands } from "./learning-evidence";
import type { Attempt, Id, Question } from "./types";

/** A canonical capability combination, or null when the question is not synoptic. */
export function capabilityCombination(question: Question): Id[] | null {
  const capabilities = questionCapabilities(question);
  if (capabilities.length < 2) return null;
  return [...capabilities].sort();
}

/** Stable key for a combination so encounters can be counted. */
export function combinationKey(capabilities: readonly Id[]): string {
  return [...capabilities].sort().join("+");
}

/**
 * Is a question synoptic *evidence*? It must combine 2+ capabilities and be
 * authored as a transfer/synoptic item — a structured question that merely
 * happens to touch two statements in isolated recall parts is not synoptic.
 */
export function isSynopticQuestion(question: Question): boolean {
  const combination = capabilityCombination(question);
  if (!combination) return false;
  return questionDemands(question).some((demand) => demand === "synoptic" || demand === "transfer");
}

/** Combinations already met in the attempt history (any marking quality). */
export function encounteredCombinations(
  attempts: readonly Attempt[],
  questions: readonly Question[],
): Set<string> {
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const question = byId.get(attempt.questionId);
    if (!question) continue;
    const combination = capabilityCombination(question);
    if (combination) seen.add(combinationKey(combination));
  }
  return seen;
}

export interface SynopticCandidate {
  question: Question;
  capabilityIds: Id[];
  /** True when this exact pairing has never been sat together before. */
  novelCombination: boolean;
  /** True when a component capability is still unproven/weak — combining it
   * with a secure partner is where the transfer mark is won. */
  joinsDevelopingSkill: boolean;
}

/**
 * Rank synoptic questions by combination novelty. `stateOf` supplies the
 * learner's per-capability state so a pairing that exercises a still-fragile
 * skill outranks one whose every member is already secure.
 */
export function synopticCandidates(
  questions: readonly Question[],
  encountered: ReadonlySet<string>,
  stateOf: (capabilityId: Id) => string,
): SynopticCandidate[] {
  return questions
    .filter(isSynopticQuestion)
    .map((question) => {
      const capabilityIds = capabilityCombination(question)!;
      const key = combinationKey(capabilityIds);
      return {
        question,
        capabilityIds,
        novelCombination: !encountered.has(key),
        joinsDevelopingSkill: capabilityIds.some((id) => ["unknown", "weak", "developing"].includes(stateOf(id))),
      };
    })
    .sort((a, b) =>
      Number(b.novelCombination) - Number(a.novelCombination) ||
      Number(b.joinsDevelopingSkill) - Number(a.joinsDevelopingSkill) ||
      a.question.id.localeCompare(b.question.id));
}

/**
 * A transfer/synoptic candidate is only worth its minutes if its reasoning is
 * genuinely new; a fresh *costume* over an already-encountered combination and
 * an already-secure capability adds complexity without learning value. This
 * distinguishes real synoptic transfer from irrelevant unfamiliarity.
 */
export function synopticLearningValue(candidate: Question, practised: readonly Question[], encountered: ReadonlySet<string>): number {
  const combination = capabilityCombination(candidate);
  if (!combination) return 0;
  let value = 0;
  if (!encountered.has(combinationKey(combination))) value += 0.5; // genuinely new pairing
  // Reasoning-novel relative to practised items contributes the rest.
  let similarity = 0;
  for (const prior of practised) {
    if (prior.subjectId !== candidate.subjectId) continue;
    for (const priorProfile of prior.parts.map((part) => reasoningProfileOf(prior, part))) {
      for (const part of candidate.parts) {
        const profile = reasoningProfileOf(candidate, part);
        if (profile.capabilityId && priorProfile.capabilityId && profile.capabilityId !== priorProfile.capabilityId) continue;
        similarity = Math.max(similarity, priorProfile.solutionPath.join("|") === profile.solutionPath.join("|") ? 1 : 0.5);
      }
    }
  }
  value += 0.5 * (1 - similarity);
  return Math.min(1, value);
}
