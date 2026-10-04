// Internal release verdict, derived from the existing supply/review systems.
// A readiness label describes available journeys, never learner efficacy.
import { trustedAssessmentContent } from "./content-trust";
import { flagshipTrustReadiness } from "./flagship-trust";
import { questionFamilies } from "./learning-evidence";
import { auditSubjectSupply } from "./supply-audit";
import { buildReviewPriorities, type ReviewPriorityInput } from "./review-priority";
import { reviewStateOf } from "./review-workflow";
import type { Id } from "./types";

export type ReadinessVerdict = "NOT READY" | "DIAGNOSTIC READY" | "MISSION READY" | "PROOF READY" | "FLAGSHIP READY";
export interface CoverageMeasure { count: number; total: number; percent: number | null }
export const coverageMeasure = (count: number, total: number): CoverageMeasure => ({ count, total, percent: total ? Math.round(count / total * 1000) / 10 : null });

export function flagshipReadiness(input: ReviewPriorityInput & { subjectId: Id }) {
  const trusted = input.trusted ?? trustedAssessmentContent;
  const questions = input.questions.filter(q => q.subjectId === input.subjectId);
  const ownTopics = input.topics.filter(t => t.subjectId === input.subjectId);
  const pri = buildReviewPriorities({ ...input, subjectIds: [input.subjectId] });
  const summary = pri.subjects[0]!;
  const audit = auditSubjectSupply({ ...input, trusted, subjectId: input.subjectId });
  const trust = flagshipTrustReadiness({ ...input, trustedQuestion: trusted });
  const n = ownTopics.length;
  const dataTopics = pri.topics.filter(t => t.requiresData);
  const shallow = audit.topics.flatMap(t => t.shallowGroups);
  const stale = questions.filter(q => reviewStateOf(q, input.auditEvents ?? []).needsReReview);
  const measures = {
    firstSupply: coverageMeasure(pri.topics.filter(t => t.trustedDistinct >= 1).length, n),
    secondDistinctSupply: coverageMeasure(pri.topics.filter(t => t.trustedDistinct >= 2).length, n),
    transferSupply: coverageMeasure(pri.topics.filter(t => t.trustedTransfer >= 1).length, n),
    dataPracticalSupply: coverageMeasure(dataTopics.filter(t => t.trustedData >= 1).length, dataTopics.length),
    delayedProof: coverageMeasure(pri.topics.filter(t => t.delayedProofReady && t.trustedTransfer >= 1).length, n),
    missionProof: coverageMeasure(summary.missionProofTopics, n),
    specification: coverageMeasure(trust.statementsWithTrustedQuestions, trust.statementsTotal),
    coreSpecification: coverageMeasure(trust.statementsMeetingCoreTrustBar, trust.statementsTotal),
  };
  const criteria = {
    // Five short, reviewed topics (or every topic of a smaller curriculum).
    diagnostic: summary.coldStartReady,
    // At least one complete, useful mission with independent and transfer supply.
    mission: summary.coldStartReady && summary.missionProofTopics > 0,
    // Baseline, independent success, then a third distinct delayed item.
    proof: summary.coldStartReady && summary.missionProofTopics > 0 && measures.delayedProof.count > 0,
    // Entire curriculum supports the loop and the pre-existing statement release bar.
    flagship: false,
  };
  const trustedShallow = new Set(shallow.filter(g => g.trustedIds.length > 1).map(g => g.ids.join("|"))).size;
  criteria.flagship = criteria.proof && n > 0 && measures.delayedProof.count === n &&
    measures.dataPracticalSupply.count === measures.dataPracticalSupply.total && trust.releaseReady &&
    trustedShallow === 0 && stale.length === 0;
  const verdict: ReadinessVerdict = criteria.flagship ? "FLAGSHIP READY" : criteria.proof ? "PROOF READY" : criteria.mission ? "MISSION READY" : criteria.diagnostic ? "DIAGNOSTIC READY" : "NOT READY";
  return {
    subjectId: input.subjectId, label: summary.label, verdict, criteria, measures,
    coldStart: { ready: summary.coldStartReady, topics: summary.coldStartTopics, required: summary.coldStartTarget },
    missionTopicIds: pri.topics.filter(t => !t.proofBlocked && t.trustedTransfer >= 1).map(t => t.topicId),
    proofTopicIds: pri.topics.filter(t => t.delayedProofReady && t.trustedTransfer >= 1).map(t => t.topicId),
    trustedQuestions: questions.filter(trusted).length,
    trustedFamilies: new Set(questions.filter(trusted).flatMap(questionFamilies)).size,
    outstandingShallowClusters: new Set(shallow.map(g => g.ids.join("|"))).size,
    trustedShallowClusters: trustedShallow, questionsRequiringReReview: stale.map(q => q.id),
    blockedTopics: pri.topics.filter(t => !t.delayedProofReady || t.trustedTransfer < 1 || (t.requiresData && t.trustedData < 1)).map(t => t.topicId),
    note: "Partial verdicts identify usable journeys, not whole-subject release. Only FLAGSHIP READY clears the complete existing trust bar. No efficacy claim is implied.",
  };
}
export type FlagshipReadiness = ReturnType<typeof flagshipReadiness>;
