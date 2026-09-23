import { partLearningMetadata } from "./learning-evidence";
import type { CapabilityNode } from "./capability-graph";
import type { LearningDemand, Question, Topic } from "./types";

export const LEARNING_DEMANDS: readonly LearningDemand[] = ["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"];

/** Content inventory, not an assertion that an official specification is complete. */
export function auditLearningDepth(topics: readonly Topic[], questions: readonly Question[], nodes: readonly CapabilityNode[]) {
  const rows = topics.flatMap((topic) => (topic.specPoints ?? []).map((point) => {
    const mapped = questions.filter((q) => q.subjectId === topic.subjectId && q.parts.some((p) => p.specPointIds?.includes(point.id)));
    const families = Object.fromEntries(LEARNING_DEMANDS.map((demand) => [demand,
      new Set(mapped.flatMap((question) => question.parts
        .filter((part) => part.specPointIds?.includes(point.id) && partLearningMetadata(question, part)?.demand === demand)
        .map((part) => partLearningMetadata(question, part)?.familyId)
        .filter((family): family is string => Boolean(family)))).size,
    ])) as Record<LearningDemand, number>;
    return { subjectId: topic.subjectId, topicId: topic.id, specPointId: point.id, claim: point.text,
      capabilityIds: nodes.filter((n) => n.specPointIds.includes(point.id)).map((n) => n.id), families,
      unclassifiedQuestions: mapped.filter((q) => q.parts.some((part) => part.specPointIds?.includes(point.id) && !partLearningMetadata(q, part))).length,
      externallyVerifiedQuestions: mapped.filter((q) => q.verification === "verified").length,
      gaps: LEARNING_DEMANDS.filter((demand) => families[demand] < 2) };
  }));
  return { statements: rows.length, statementsWithFullDepth: rows.filter((r) => !r.gaps.length).length, rows };
}
