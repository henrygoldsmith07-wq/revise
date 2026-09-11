import { auditLearningDepth } from "./learning-depth";
import { auditPhysicsAssessmentQuality, type PhysicsAssessmentQualityAudit } from "./physics-assessment-quality";
import type { CapabilityNode } from "./capability-graph";
import { validatePrerequisiteReviews } from "./capability-graph";
import type { HumanVerificationRecord, Id, Question, Topic } from "./types";

export const PHYSICS_SUBJECT_ID = "wjec-alevel-physics";
export const REVIEWED_WJEC_SUBJECT_IDS = [PHYSICS_SUBJECT_ID, "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry"] as const;
export function requiresWjecContentReview(subjectId: string | undefined): boolean {
  return REVIEWED_WJEC_SUBJECT_IDS.some((id) => id === subjectId);
}
export const REQUIRED_HUMAN_CHECKS = ["question", "marking", "workedSolution", "capabilityMapping", "specificationMapping", "examRealism"] as const;

/** Change detector, not a signature: reviewer identity still needs human attestation. */
export function physicsContentFingerprint(question: Question): string {
  const text = JSON.stringify([question.id, question.subjectId, question.topicIds,
    question.specPointIds, question.stem, question.parts, question.totalMarks,
    question.learning, question.options, question.correctIndex, question.calculatorAllowed,
    question.source, question.origin, question.licensedSource, question.paperId, question.paperQuestionNumber,
    question.paperProvenance, question.specVersion]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `physics-review-v2:${(hash >>> 0).toString(16)}`;
}

export type PhysicsReviewQueueRow = {
  questionId: Id;
  topicIds: Id[];
  specPointIds: Id[];
  missingChecks: Array<(typeof REQUIRED_HUMAN_CHECKS)[number]>;
  status: HumanVerificationRecord["status"] | "unreviewed";
};

function completeChecks(record: HumanVerificationRecord | undefined): boolean {
  return record?.status === "approved" && Boolean(record.reviewerId?.trim() && record.reviewedAt && Number.isFinite(Date.parse(record.reviewedAt))) &&
    REQUIRED_HUMAN_CHECKS.every((check) => record.checks?.[check] === true);
}

/** A question is trusted only when every component has an approved check. */
export function humanVerifiedPhysicsQuestion(question: Question): boolean {
  return question.subjectId === PHYSICS_SUBJECT_ID && humanVerifiedWjecQuestion(question);
}

/** Same six-check and edit-invalidation contract for all four WJEC flagships. */
export function humanVerifiedWjecQuestion(question: Question): boolean {
  return requiresWjecContentReview(question.subjectId) && question.verification === "verified" && completeChecks(question.humanVerification) &&
    question.humanVerification?.contentFingerprint === physicsContentFingerprint(question) &&
    (question.source !== "past-paper" || verifiedWjecPaperProvenance(question)) &&
    !["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "");
}

export function trustedAssessmentContent(question: Question): boolean {
  return !requiresWjecContentReview(question.subjectId) || humanVerifiedWjecQuestion(question);
}

/**
 * A paper item is authentic only when its WJEC source manifest was checked by
 * a named reviewer. This is deliberately separate from question-content
 * approval: provenance and marking quality are two independent gates.
 */
export function verifiedPhysicsPaperProvenance(question: Question): boolean {
  return question.subjectId === PHYSICS_SUBJECT_ID && verifiedWjecPaperProvenance(question);
}

export function verifiedWjecPaperProvenance(question: Question): boolean {
  const provenance = question.paperProvenance;
  return requiresWjecContentReview(question.subjectId) && question.source === "past-paper" &&
    Boolean(question.paperId && question.paperQuestionNumber?.trim() && provenance &&
      provenance.status === "verified" && provenance.board.toLowerCase() === "wjec" &&
      provenance.paperId === question.paperId && provenance.questionNumber === question.paperQuestionNumber &&
      provenance.specification.trim() && /^https:\/\//i.test(provenance.sourceUrl) && provenance.sourceDigest.trim() &&
      provenance.verifiedBy?.trim() && provenance.verifiedAt && Number.isFinite(Date.parse(provenance.verifiedAt)) &&
      (!provenance.specificationVersion || !question.specVersion || provenance.specificationVersion === question.specVersion));
}

/** Questions requiring editorial review before they can provide trusted transfer evidence. */
export function buildPhysicsReviewQueue(questions: readonly Question[], subjectId: Id = PHYSICS_SUBJECT_ID): PhysicsReviewQueueRow[] {
  return questions
    .filter((question) => question.subjectId === subjectId)
    .flatMap((question) => {
      if (humanVerifiedWjecQuestion(question)) return [];
      const checks = question.humanVerification?.checks;
      const missingChecks = REQUIRED_HUMAN_CHECKS.filter((check) => !checks?.[check]);
      const status: PhysicsReviewQueueRow["status"] = question.humanVerification?.status ?? "unreviewed";
      return [{
        questionId: question.id,
        topicIds: question.topicIds,
        specPointIds: question.specPointIds ?? question.parts.flatMap((part) => part.specPointIds ?? []),
        missingChecks,
        status,
      }];
    });
}

/** Apply an immutable review decision; incomplete approvals remain untrusted. */
export function applyHumanVerification(question: Question, record: HumanVerificationRecord): Question {
  const approved = completeChecks(record) && record.contentFingerprint === physicsContentFingerprint(question);
  return {
    ...question,
    humanVerification: { ...record, status: approved ? "approved" : record.status === "approved" ? "pending" : record.status },
    ...(approved ? { verification: "verified" as const, reviewer: record.reviewerId ?? question.reviewer ?? null, lastChecked: record.reviewedAt?.slice(0, 10) ?? question.lastChecked ?? null } :
      { verification: "unverified" as const, reviewer: null, lastChecked: null }),
  };
}

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
  const topics = input.topics.filter((topic) => topic.subjectId === PHYSICS_SUBJECT_ID);
  const questions = input.questions.filter((question) => question.subjectId === PHYSICS_SUBJECT_ID);
  // Release depth must be counted from approved content, not the draft inventory.
  const audit = auditLearningDepth(topics, questions.filter(humanVerifiedPhysicsQuestion), input.nodes);
  const quality = auditPhysicsAssessmentQuality({ topics, questions, nodes: input.nodes, trustedQuestion: humanVerifiedPhysicsQuestion });
  const prerequisiteReviewGaps = validatePrerequisiteReviews(input.nodes, PHYSICS_SUBJECT_ID);
  const markingBenchmarkReady = input.markingBenchmark?.usableForCalibration === true;
  const reviewQueue = buildPhysicsReviewQueue(questions);
  const trustedQuestionCount = questions.filter(humanVerifiedPhysicsQuestion).length;
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
