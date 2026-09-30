import { auditLearningDepth } from "./learning-depth";
import { auditPhysicsAssessmentQuality, type PhysicsAssessmentQualityAudit } from "./physics-assessment-quality";
import type { CapabilityNode } from "./capability-graph";
import { validatePrerequisiteReviews } from "./capability-graph";

import type { Id, Question, Topic } from "./types";

import { PHYSICS_SUBJECT_ID, humanVerifiedWjecQuestion, buildPhysicsReviewQueue, type PhysicsReviewQueueRow } from "./content-trust";
export * from "./content-trust";

export interface PhysicsContentReadiness {
  ready: boolean;
  statements: number;
  statementsWithFullDepth: number;
  trustedQuestionCount: number;
  unreviewedQuestionCount: number;
  reviewQueue: PhysicsReviewQueueRow[];
  gaps: Array<{ topicId: Id; specPointId: Id; demands: string[] }>;
  /** Detailed variation, mapping and review audit over the whole Physics bank. */
  quality: PhysicsAssessmentQualityAudit;
  /** Dependency edges awaiting named subject-expert approval. */
  prerequisiteReviewGaps: string[];
  /** Marking benchmark gate; synthetic/internal rows never make this true. */
  markingBenchmarkReady: boolean;
}

/** One auditable gate for releasing Physics as a deeply assessable flagship. */
export function physicsContentReadiness(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  /** Optional report from the external, double-marked Physics corpus. */
  markingBenchmark?: { usableForCalibration: boolean };
}): PhysicsContentReadiness {
  return wjecContentReadiness({ ...input, subjectId: PHYSICS_SUBJECT_ID });
}

/** Same release gate for any WJEC flagship; Physics wrapper above is retained for compatibility. */
export function wjecContentReadiness(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  subjectId: Id;
  markingBenchmark?: { usableForCalibration: boolean };
}): PhysicsContentReadiness {
  const topics = input.topics.filter((topic) => topic.subjectId === input.subjectId);
  const questions = input.questions.filter((question) => question.subjectId === input.subjectId);
  // Release depth must be counted from approved content, not the draft inventory.
  const audit = auditLearningDepth(topics, questions.filter(humanVerifiedWjecQuestion), input.nodes);
  const quality = auditPhysicsAssessmentQuality({ topics, questions, nodes: input.nodes, trustedQuestion: humanVerifiedWjecQuestion });
  const prerequisiteReviewGaps = validatePrerequisiteReviews(input.nodes, input.subjectId);
  const markingBenchmarkReady = input.markingBenchmark?.usableForCalibration === true;
  const reviewQueue = buildPhysicsReviewQueue(questions, input.subjectId);
  const trustedQuestionCount = questions.filter(humanVerifiedWjecQuestion).length;
  const gaps = audit.rows.filter((row) => row.gaps.length).map((row) => ({ topicId: row.topicId, specPointId: row.specPointId, demands: row.gaps }));
  return {
    ready: audit.statements > 0 && audit.statementsWithFullDepth === audit.statements && reviewQueue.length === 0 && quality.releaseReady && prerequisiteReviewGaps.length === 0 && markingBenchmarkReady,
    statements: audit.statements,
    statementsWithFullDepth: audit.statementsWithFullDepth,
    trustedQuestionCount,
    unreviewedQuestionCount: reviewQueue.length,
    reviewQueue,
    gaps,
    quality,
    prerequisiteReviewGaps,
    markingBenchmarkReady,
  };
}
