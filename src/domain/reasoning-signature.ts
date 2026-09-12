// ---------------------------------------------------------------------------
// Reasoning-aware question similarity.
//
// Family/context freshness says "the learner has not seen this wrapper before".
// It cannot see a number swap that keeps the same *operation sequence*, nor a
// "transfer" item that re-runs the identical solution path in a new costume.
// This module compares questions on the reasoning itself: capability, demand,
// family, context, authored reasoning moves, prompt structure, calculation
// method (the operator sequence) and solution path (the ordered operations the
// model answer performs). Selection and the audit share this one model so
// near-duplicate reasoning can never masquerade as transfer or as a distinct
// family.
//
// Pure and deterministic; no storage, network or model calls.
// ---------------------------------------------------------------------------

import { isTemplatedReasoningMove, promptSignature, setSimilarity, textOverload } from "./text-similarity";
import type { CalculationMarkRule, Question, QuestionPart } from "./types";

/** Everything the similarity model reads off one part. */
export interface ReasoningProfile {
  capabilityId: string | null;
  demand: string | null;
  familyId: string | null;
  contextId: string | null;
  /** Authored reasoning operations (templated filler already removed). */
  reasoningMoves: string[];
  /** Value-stripped prompt skeleton: which command + what the part asks for. */
  promptStructure: string;
  /** Ordered calculation operators, empty for non-numeric parts. */
  calculationMethod: string[];
  /** Ordered solution operations the model answer performs (equations/verbs). */
  solutionPath: string[];
}

export interface ReasoningSimilarity {
  overall: number;
  signals: {
    capability: number;
    demand: number;
    family: number;
    context: number;
    reasoningMoves: number;
    promptStructure: number;
    calculationMethod: number;
    solutionPath: number;
  };
}

/** Signal weights. Reasoning operations and solution path dominate. */
export const SIMILARITY_WEIGHTS = {
  capability: 0.14,
  demand: 0.1,
  family: 0.08,
  context: 0.08,
  reasoningMoves: 0.28,
  promptStructure: 0.1,
  calculationMethod: 0.08,
  solutionPath: 0.14,
} as const;

/** A candidate this similar to something already practised is not novel. */
export const REASONING_NOVELTY_FLOOR = 0.7;
/** Two parts this similar within a capability+demand are the same reasoning. */
export const NEAR_DUPLICATE_SIMILARITY = 0.72;

const partLearning = (question: Question, part: QuestionPart) =>
  part.learning ?? (question.learning
    ? {
        familyId: question.learning.familyId,
        contextId: question.learning.contextId,
        demand: question.learning.demand,
        reasoningMoves: question.learning.reasoningMoves ?? [],
      }
    : undefined);

/** Authored reasoning operations only — filler that restates the demand is dropped. */
export function authoredMoves(question: Question, part: QuestionPart): string[] {
  const moves = partLearning(question, part)?.reasoningMoves ?? [];
  return [...new Set(moves.map((move) => move.trim()).filter((move) => move && !isTemplatedReasoningMove(move)))];
}

/**
 * The ordered operations a part asks for / its model answer performs. For a
 * calculation part this is the calculation method (operator sequence); for a
 * written part it is the ordered mark-scheme / claim verbs plus any equations
 * in the model answer. Two parts with the same operation sequence are the same
 * solution path even when their numbers and story differ.
 */
export function solutionPathOf(part: QuestionPart): string[] {
  if (part.calculationRules?.length) return calculationMethodOf(part.calculationRules);
  const steps = [
    ...(part.markScheme ?? []),
    ...(part.learningClaims ?? []),
    ...(part.modelAnswer ? part.modelAnswer.split(/\n|=>|;|\b(?:then|so)\b/i) : []),
  ].map((step) => step.trim()).filter(Boolean);
  const verbs: string[] = [];
  for (const step of steps) {
    for (const token of promptSignature(step).split(" ")) {
      if (token && !verbs.includes(token)) verbs.push(token);
    }
  }
  return verbs;
}

/** Deterministic operator sequence from a calculation rubric: method → result. */
export function calculationMethodOf(rules: readonly CalculationMarkRule[]): string[] {
  return rules.map((rule) => (rule.method ? `${rule.kind}:${rule.method.operator}` : rule.kind));
}

/** Build the reasoning profile for one part of one question. */
export function reasoningProfileOf(question: Question, part: QuestionPart): ReasoningProfile {
  const learning = partLearning(question, part);
  const capability = (part.capabilityIds ?? []).length === 1 ? part.capabilityIds![0]! : null;
  return {
    capabilityId: capability,
    demand: learning?.demand ?? null,
    familyId: learning?.familyId ?? null,
    contextId: learning?.contextId ?? null,
    reasoningMoves: authoredMoves(question, part),
    promptStructure: promptSignature(part.prompt),
    calculationMethod: part.calculationRules?.length ? calculationMethodOf(part.calculationRules) : [],
    solutionPath: solutionPathOf(part),
  };
}

/** Profiles for every part of a question. */
export function reasoningProfilesOf(question: Question): ReasoningProfile[] {
  return (question.parts ?? []).map((part) => reasoningProfileOf(question, part));
}

function sequenceSimilarity(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  // Order-aware: compare the shared subsequence length to the shorter path,
  // then blend with set overlap so reordered-but-identical operations still
  // score high while a genuinely different order scores lower.
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  let matched = 0;
  let cursor = 0;
  for (const item of shorter) {
    const found = longer.indexOf(item, cursor);
    if (found >= 0) {
      matched++;
      cursor = found + 1;
    }
  }
  const orderScore = matched / shorter.length;
  const setScore = setSimilarity(new Set(a.map(String)), new Set(b.map(String)));
  return Math.max(orderScore, setScore * 0.9);
}

/** Pairwise reasoning similarity (0–1) across all eight signals. */
export function reasoningSimilarity(a: ReasoningProfile, b: ReasoningProfile): ReasoningSimilarity {
  const same = (x: string | null, y: string | null): number => (x && y && x === y ? 1 : 0);
  const signals = {
    capability: same(a.capabilityId, b.capabilityId),
    demand: same(a.demand, b.demand),
    family: same(a.familyId, b.familyId),
    context: same(a.contextId, b.contextId),
    reasoningMoves: a.reasoningMoves.length && b.reasoningMoves.length
      ? Math.max(
          textOverload(a.reasoningMoves.join("; "), b.reasoningMoves.join("; ")),
          sequenceSimilarity(a.reasoningMoves, b.reasoningMoves),
        )
      : 0,
    promptStructure: a.promptStructure && b.promptStructure ? textOverload(a.promptStructure, b.promptStructure) : 0,
    calculationMethod: a.calculationMethod.length && b.calculationMethod.length
      ? sequenceSimilarity(a.calculationMethod, b.calculationMethod)
      : 0,
    solutionPath: sequenceSimilarity(a.solutionPath, b.solutionPath),
  };
  let overall = 0;
  for (const key of Object.keys(SIMILARITY_WEIGHTS) as (keyof typeof SIMILARITY_WEIGHTS)[]) {
    overall += SIMILARITY_WEIGHTS[key] * signals[key];
  }
  return { overall, signals };
}

/** Best similarity between any part pair of two questions. */
export function questionsReasoningSimilarity(source: Question, candidate: Question): number {
  let max = 0;
  for (const a of reasoningProfilesOf(source)) {
    for (const b of reasoningProfilesOf(candidate)) {
      // Only compare profiles that could plausibly be the same skill exercise.
      if (a.capabilityId && b.capabilityId && a.capabilityId !== b.capabilityId) continue;
      max = Math.max(max, reasoningSimilarity(a, b).overall);
    }
  }
  return max;
}

/**
 * How novel a candidate is against everything already practised (0 = identical
 * to something done, 1 = no reasoning overlap anywhere).
 */
export function reasoningNovelty(candidate: Question, practised: readonly Question[]): number {
  if (!practised.length) return 1;
  let max = 0;
  for (const prior of practised) max = Math.max(max, questionsReasoningSimilarity(prior, candidate));
  return 1 - max;
}

/**
 * Does this candidate test the same target capability as the source but with a
 * genuinely different solution path? Used to gate transfer: unfamiliar wrapping
 * that re-runs the identical operations is not transfer evidence.
 */
export function isReasoningTransfer(source: Question, candidate: Question, targetCapabilityId: string): boolean {
  const sourceProfiles = reasoningProfilesOf(source).filter((profile) => profile.capabilityId === targetCapabilityId);
  const candidateProfiles = reasoningProfilesOf(candidate).filter((profile) => profile.capabilityId === targetCapabilityId);
  if (!sourceProfiles.length || !candidateProfiles.length) return false;
  // Every candidate view of the capability must differ from at least one
  // source view; the best (lowest) similarity is what we compare to the floor.
  const best = Math.min(...candidateProfiles.map((cp) =>
    Math.min(...sourceProfiles.map((sp) => reasoningSimilarity(sp, cp).overall))));
  return best <= REASONING_NOVELTY_FLOOR;
}

/** Are two parts effectively the same reasoning (block counting them distinct)? */
export function isNearDuplicateReasoning(a: ReasoningProfile, b: ReasoningProfile): boolean {
  if (a.demand && b.demand && a.demand !== b.demand) return false;
  return reasoningSimilarity(a, b).overall >= NEAR_DUPLICATE_SIMILARITY;
}
