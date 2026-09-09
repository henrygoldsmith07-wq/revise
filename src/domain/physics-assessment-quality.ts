import type { CapabilityNode } from "./capability-graph";
import type { Id, LearningDemand, Question, QuestionPart, Topic } from "./types";

/** The seven demands that make a Physics item useful beyond simple recall. */
export const PHYSICS_ASSESSMENT_DEMANDS: readonly LearningDemand[] = [
  "recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic",
];

/** Two genuinely different families are the minimum evidence for a demand. */
export const MIN_PHYSICS_FAMILIES = 2;

export interface PhysicsDemandCoverage {
  demand: LearningDemand;
  families: string[];
  contexts: string[];
  reasoningMoves: string[];
  questionCount: number;
  complete: boolean;
  distinct: boolean;
}

export interface PhysicsCapabilityCoverage {
  topicId: Id;
  specPointId: Id;
  capabilityIds: Id[];
  demands: PhysicsDemandCoverage[];
  complete: boolean;
}

export type PhysicsQualityIssueKind =
  | "missing-part-learning"
  | "missing-reasoning-move"
  | "multi-capability-part"
  | "unknown-spec-point"
  | "unknown-capability"
  | "incomplete-mark-scheme"
  | "cosmetic-reskin"
  | "unreviewed";

export interface PhysicsQualityIssue {
  questionId: Id;
  partId?: Id;
  kind: PhysicsQualityIssueKind;
  detail: string;
}

export interface PhysicsAssessmentQualityAudit {
  subjectId: string;
  statements: number;
  completeStatements: number;
  approvedQuestions: number;
  unreviewedQuestions: number;
  capabilityCoverage: PhysicsCapabilityCoverage[];
  issues: PhysicsQualityIssue[];
  /** True only when coverage, variation, mappings and human review all pass. */
  releaseReady: boolean;
}

const STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with"]);

/** Remove values and punctuation so a number-swapped reskin is visible. */
export function promptSignature(text: string): string {
  return text.toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/gi, "#")
    .replace(/[^a-z0-9#]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function questionPartsForPoint(question: Question, specPointId: Id): QuestionPart[] {
  return question.parts.filter((part) => part.specPointIds?.includes(specPointId));
}

function partLearningMetadata(question: Question, part: QuestionPart) {
  return part.learning ?? (question.learning ? {
    familyId: question.learning.familyId,
    contextId: question.learning.contextId,
    demand: question.learning.demand,
    reasoningMoves: question.learning.reasoningMoves ?? [],
  } : undefined);
}

function partDemand(question: Question, part: QuestionPart): LearningDemand | undefined {
  return partLearningMetadata(question, part)?.demand;
}

/**
 * Audits the content inventory at the smallest authored unit: one part mapped
 * to one specification statement. A family id alone is not enough; the audit
 * also compares context and reasoning moves so changing only numbers cannot
 * masquerade as transfer practice.
 */
export function auditPhysicsAssessmentQuality(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  /** Trust predicate is injected to keep this audit independent of the review store. */
  trustedQuestion?: (question: Question) => boolean;
}): PhysicsAssessmentQualityAudit {
  const physicsTopics = input.topics.filter((topic) => topic.subjectId === "wjec-alevel-physics");
  const physicsQuestions = input.questions.filter((question) => question.subjectId === "wjec-alevel-physics");
  const physicsNodes = input.nodes.filter((node) => node.subjectId === "wjec-alevel-physics");
  const points = physicsTopics.flatMap((topic) => (topic.specPoints ?? []).map((point) => ({ topic, point })));
  const pointIds = new Set(points.map(({ point }) => point.id));
  const nodeById = new Map(physicsNodes.map((node) => [node.id, node]));
  const trustedQuestion = input.trustedQuestion ?? (() => false);
  const issues: PhysicsQualityIssue[] = [];
  const promptByDemand = new Map<string, Map<string, Id>>();

  for (const question of physicsQuestions) {
    if (!trustedQuestion(question)) {
      issues.push({ questionId: question.id, kind: "unreviewed", detail: "Question has no current six-check human approval." });
    }
    for (const part of question.parts) {
      const specPointIds = part.specPointIds ?? [];
      if (specPointIds.length > 1) {
        issues.push({ questionId: question.id, partId: part.id, kind: "multi-capability-part",
          detail: "A part maps to multiple specification points; it cannot isolate the blocking capability." });
      }
      for (const specPointId of specPointIds) {
        if (!pointIds.has(specPointId)) {
          issues.push({ questionId: question.id, partId: part.id, kind: "unknown-spec-point", detail: specPointId });
        }
      }
      const meta = partLearningMetadata(question, part);
      if (!meta) {
        issues.push({ questionId: question.id, partId: part.id, kind: "missing-part-learning",
          detail: "Add demand, family, context and authored reasoning moves." });
      } else if (!meta.reasoningMoves.length) {
        issues.push({ questionId: question.id, partId: part.id, kind: "missing-reasoning-move", detail: "No reasoning move is recorded." });
      }
      if (part.markScheme.length !== part.marks) {
        issues.push({ questionId: question.id, partId: part.id, kind: "incomplete-mark-scheme",
          detail: `${part.markScheme.length} mark points for ${part.marks} marks.` });
      }
      for (const capabilityId of part.capabilityIds ?? []) {
        const node = nodeById.get(capabilityId);
        if (!node) issues.push({ questionId: question.id, partId: part.id, kind: "unknown-capability", detail: capabilityId });
        else if (specPointIds.length === 1 && !node.specPointIds.includes(specPointIds[0]!)) {
          issues.push({ questionId: question.id, partId: part.id, kind: "unknown-capability",
            detail: `${capabilityId} does not map to ${specPointIds[0]}.` });
        }
      }
      if (meta && specPointIds.length === 1) {
        const key = `${specPointIds[0]}:${meta.demand}`;
        const signatures = promptByDemand.get(key) ?? new Map<string, Id>();
        const signature = promptSignature(part.prompt);
        const previous = signatures.get(signature);
        if (previous && previous !== question.id) {
          issues.push({ questionId: question.id, partId: part.id, kind: "cosmetic-reskin",
            detail: `Shares the value-stripped prompt signature with ${previous}.` });
        } else if (signature) {
          signatures.set(signature, question.id);
          promptByDemand.set(key, signatures);
        }
      }
    }
  }

  const capabilityCoverage = points.map(({ topic, point }): PhysicsCapabilityCoverage => {
    const mappedQuestions = physicsQuestions.flatMap((question) => questionPartsForPoint(question, point.id)
      .map((part) => ({ question, part })));
    const capabilityIds = unique(mappedQuestions.flatMap(({ part }) => part.capabilityIds ?? []));
    const demands = PHYSICS_ASSESSMENT_DEMANDS.map((demand): PhysicsDemandCoverage => {
      const rows = mappedQuestions.filter(({ question, part }) => partDemand(question, part) === demand);
      const families = unique(rows.map(({ question, part }) => partLearningMetadata(question, part)?.familyId).filter((id): id is string => Boolean(id)));
      const contexts = unique(rows.map(({ question, part }) => partLearningMetadata(question, part)?.contextId).filter((id): id is string => Boolean(id)));
      const reasoningMoves = unique(rows.flatMap(({ question, part }) => partLearningMetadata(question, part)?.reasoningMoves ?? []));
      const signatures = unique(rows.map(({ part }) => promptSignature(part.prompt)).filter(Boolean));
      return { demand, families, contexts, reasoningMoves, questionCount: rows.length,
        complete: families.length >= MIN_PHYSICS_FAMILIES,
        distinct: signatures.length >= MIN_PHYSICS_FAMILIES && contexts.length >= MIN_PHYSICS_FAMILIES };
    });
    return { topicId: topic.id, specPointId: point.id, capabilityIds, demands,
      complete: demands.every((demand) => demand.complete && demand.distinct) };
  });
  const completeStatements = capabilityCoverage.filter((row) => row.complete).length;
  const approvedQuestions = physicsQuestions.filter(trustedQuestion).length;
  return {
    subjectId: "wjec-alevel-physics",
    statements: points.length,
    completeStatements,
    approvedQuestions,
    unreviewedQuestions: physicsQuestions.length - approvedQuestions,
    capabilityCoverage,
    issues,
    releaseReady: points.length > 0 && completeStatements === points.length && approvedQuestions === physicsQuestions.length && issues.length === 0,
  };
}

/** A compact queue for the next authoring/review pass. */
export function physicsQualityGaps(audit: PhysicsAssessmentQualityAudit): PhysicsCapabilityCoverage[] {
  return audit.capabilityCoverage.filter((row) => !row.complete);
}
