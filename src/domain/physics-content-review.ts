import { auditLearningDepth } from "./learning-depth";
import type { CapabilityNode } from "./capability-graph";
import type { HumanVerificationRecord, Id, Question, Topic } from "./types";

export const PHYSICS_SUBJECT_ID = "wjec-alevel-physics";
export const REQUIRED_HUMAN_CHECKS = ["question", "marking", "workedSolution", "capabilityMapping"] as const;

export type PhysicsReviewQueueRow = {
  questionId: Id;
  topicIds: Id[];
  specPointIds: Id[];
  missingChecks: Array<(typeof REQUIRED_HUMAN_CHECKS)[number]>;
  status: HumanVerificationRecord["status"] | "unreviewed";
};

function completeChecks(record: HumanVerificationRecord | undefined): boolean {
  return record?.status === "approved" && Boolean(record.reviewerId && record.reviewedAt && Number.isFinite(Date.parse(record.reviewedAt))) &&
    REQUIRED_HUMAN_CHECKS.every((check) => record.checks[check]);
}

/** A question is trusted only when every component has an approved check. */
export function humanVerifiedPhysicsQuestion(question: Question): boolean {
  return question.subjectId === PHYSICS_SUBJECT_ID && question.verification === "verified" && completeChecks(question.humanVerification);
}

/** Questions requiring editorial review before they can provide trusted transfer evidence. */
export function buildPhysicsReviewQueue(questions: readonly Question[]): PhysicsReviewQueueRow[] {
  return questions
    .filter((question) => question.subjectId === PHYSICS_SUBJECT_ID && Boolean(question.learning))
    .flatMap((question) => {
      if (completeChecks(question.humanVerification)) return [];
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
  const approved = completeChecks(record);
  return {
    ...question,
    humanVerification: { ...record, status: approved ? "approved" : record.status },
    ...(approved ? { verification: "verified" as const, reviewer: record.reviewerId ?? question.reviewer ?? null, lastChecked: record.reviewedAt?.slice(0, 10) ?? question.lastChecked ?? null } : {}),
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
}

/** One auditable gate for releasing Physics as a deeply assessable flagship. */
export function physicsContentReadiness(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
}): PhysicsContentReadiness {
  const topics = input.topics.filter((topic) => topic.subjectId === PHYSICS_SUBJECT_ID);
  const questions = input.questions.filter((question) => question.subjectId === PHYSICS_SUBJECT_ID);
  const audit = auditLearningDepth(topics, questions, input.nodes);
  const reviewQueue = buildPhysicsReviewQueue(questions);
  const trustedQuestionCount = questions.filter(humanVerifiedPhysicsQuestion).length;
  const gaps = audit.rows.filter((row) => row.gaps.length).map((row) => ({ topicId: row.topicId, specPointId: row.specPointId, demands: row.gaps }));
  return {
    ready: audit.statements > 0 && audit.statementsWithFullDepth === audit.statements && reviewQueue.length === 0,
    statements: audit.statements,
    statementsWithFullDepth: audit.statementsWithFullDepth,
    trustedQuestionCount,
    unreviewedQuestionCount: reviewQueue.length,
    reviewQueue,
    gaps,
  };
}
