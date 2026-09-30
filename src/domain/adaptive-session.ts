/** Public composition boundary. Generic plan/sequence/replan modules receive
 * graphs as data; qualification-specific registration belongs to content. */
import { subjectCapabilityRegistry } from "@/content/capability-registry";
import { buildAdaptiveSession as buildPlan } from "./adaptive-plan";
import { replanAdaptiveSession as replan } from "./adaptive-replan";
import type { AdaptiveSessionInput, AdaptiveReplanInput } from "./adaptive-contract";
export * from "./adaptive-contract";
export * from "./adaptive-budget";
export { scoreAdaptiveTopic, scoreTopic, trustedAdaptiveAttempt, trustedAdaptiveEvidence } from "./adaptive-scoring";
export type { AdaptiveEvidence, AdaptiveScoreFactors, AdaptiveTopicCandidate, ScoreData } from "./adaptive-scoring";
export { resultFromQuestionAttempt, resultFromRetrievalGrades } from "./adaptive-replan";
export { summariseAdaptiveRun } from "./adaptive-summary";
export type { AdaptiveRunSummary } from "./adaptive-summary";

export function buildAdaptiveSession(input: AdaptiveSessionInput) {
  const subjects = input.subjectIds.length ? input.subjectIds : input.topics.map(topic => topic.subjectId);
  return buildPlan({ ...input, capabilityNodes: input.capabilityNodes ?? subjectCapabilityRegistry.resolveMany(subjects) });
}
export function replanAdaptiveSession(input: AdaptiveReplanInput) {
  return replan({ ...input, capabilityNodes: input.capabilityNodes ?? subjectCapabilityRegistry.resolve(input.plan.subjectId) });
}
