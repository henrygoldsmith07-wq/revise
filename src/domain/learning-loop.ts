// ---------------------------------------------------------------------------
// Closed learning loop — weakness → recommendation → activity → later
// assessment → outcome measured → mastery updated → strategy updated
// Stores why recommendation was generated, evidence used, predicted benefit,
// acceptance/completion, subsequent performance, and apparent effectiveness.
// ---------------------------------------------------------------------------

import type { Id, IsoInstant, Recommendation } from "./types";

export type LoopStage = "weakness-detected" | "recommended" | "accepted" | "completed" | "assessed" | "measured";

export interface LearningLoopEvent {
  id: Id;
  loopId: Id;
  stage: LoopStage;
  at: IsoInstant;
  topicId?: Id;
  subjectId?: Id;
  recommendationId?: Id;
  evidence?: Record<string, unknown>;
  predictedBenefit?: number | null;
  actualBenefit?: number | null;
}

export interface LearningLoop {
  id: Id;
  subjectId: Id;
  topicId: Id;
  weaknessEvidence: {
    masteryAtDetection: number;
    accuracyAtDetection: number | null;
    attemptsAtDetection: number;
    detectedAt: IsoInstant;
  };
  recommendation: {
    reason: string;
    predictedBenefit: number | null;
    activity: Recommendation["activity"];
    explanation?: Recommendation["explanation"];
  };
  accepted: boolean | null;
  acceptedAt?: IsoInstant | null;
  completed: boolean | null;
  completedAt?: IsoInstant | null;
  subsequentPerformance: {
    assessedAt?: IsoInstant | null;
    awarded: number | null;
    max: number | null;
    accuracy: number | null;
    improved: boolean | null;
  };
  masteryAfter: number | null;
  effective: boolean | null;
  events: LearningLoopEvent[];
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export function createLearningLoop(input: {
  id: Id;
  subjectId: Id;
  topicId: Id;
  masteryAtDetection: number;
  accuracyAtDetection?: number | null;
  attemptsAtDetection?: number;
  recommendation: Recommendation;
  now?: Date;
}): LearningLoop {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    subjectId: input.subjectId,
    topicId: input.topicId,
    weaknessEvidence: {
      masteryAtDetection: input.masteryAtDetection,
      accuracyAtDetection: input.accuracyAtDetection ?? null,
      attemptsAtDetection: input.attemptsAtDetection ?? 0,
      detectedAt: now,
    },
    recommendation: {
      reason: input.recommendation.reason,
      predictedBenefit: input.recommendation.explanation?.recoverableMarks ?? null,
      activity: input.recommendation.activity,
      explanation: input.recommendation.explanation,
    },
    accepted: null,
    completed: null,
    subsequentPerformance: { awarded: null, max: null, accuracy: null, improved: null },
    masteryAfter: null,
    effective: null,
    events: [
      { id: `${input.id}:detected`, loopId: input.id, stage: "weakness-detected", at: now, topicId: input.topicId, subjectId: input.subjectId, evidence: { mastery: input.masteryAtDetection } },
      { id: `${input.id}:recommended`, loopId: input.id, stage: "recommended", at: now, topicId: input.topicId, subjectId: input.subjectId, recommendationId: input.recommendation.topicId, predictedBenefit: input.recommendation.explanation?.recoverableMarks ?? null },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function markAccepted(loop: LearningLoop, accepted: boolean, now = new Date()): LearningLoop {
  const at = now.toISOString();
  return {
    ...loop,
    accepted,
    acceptedAt: at,
    events: [...loop.events, { id: `${loop.id}:accepted:${at}`, loopId: loop.id, stage: "accepted", at, topicId: loop.topicId, subjectId: loop.subjectId }],
    updatedAt: at,
  };
}

export function markCompleted(loop: LearningLoop, completed: boolean, now = new Date()): LearningLoop {
  const at = now.toISOString();
  return {
    ...loop,
    completed,
    completedAt: at,
    events: [...loop.events, { id: `${loop.id}:completed:${at}`, loopId: loop.id, stage: "completed", at, topicId: loop.topicId, subjectId: loop.subjectId }],
    updatedAt: at,
  };
}

export function recordSubsequentAssessment(loop: LearningLoop, input: {
  awarded: number;
  max: number;
  masteryAfter: number;
  now?: Date;
}): LearningLoop {
  const at = (input.now ?? new Date()).toISOString();
  const accuracy = input.max ? input.awarded / input.max : 0;
  const improved = accuracy > loop.weaknessEvidence.accuracyAtDetection! || loop.weaknessEvidence.accuracyAtDetection == null ? accuracy > 0.55 : accuracy > loop.weaknessEvidence.accuracyAtDetection;
  const effective = improved && (loop.masteryAfter == null || input.masteryAfter > loop.weaknessEvidence.masteryAtDetection);
  return {
    ...loop,
    subsequentPerformance: {
      assessedAt: at,
      awarded: input.awarded,
      max: input.max,
      accuracy: Math.round(accuracy * 1000) / 1000,
      improved,
    },
    masteryAfter: input.masteryAfter,
    effective,
    events: [...loop.events, { id: `${loop.id}:assessed:${at}`, loopId: loop.id, stage: "assessed", at, topicId: loop.topicId, subjectId: loop.subjectId, actualBenefit: input.awarded }],
    updatedAt: at,
  };
}

export interface LearningLoopStats {
  total: number;
  accepted: number;
  completed: number;
  assessed: number;
  effective: number;
  acceptanceRate: number | null;
  completionRate: number | null;
  effectivenessRate: number | null;
}

export function learningLoopStats(loops: LearningLoop[]): LearningLoopStats {
  const total = loops.length;
  const accepted = loops.filter((l) => l.accepted).length;
  const completed = loops.filter((l) => l.completed).length;
  const assessed = loops.filter((l) => l.subsequentPerformance.assessedAt != null).length;
  const effective = loops.filter((l) => l.effective).length;
  return {
    total,
    accepted,
    completed,
    assessed,
    effective,
    acceptanceRate: total ? Math.round((accepted / total) * 1000) / 1000 : null,
    completionRate: accepted ? Math.round((completed / Math.max(1, accepted)) * 1000) / 1000 : null,
    effectivenessRate: assessed ? Math.round((effective / assessed) * 1000) / 1000 : null,
  };
}
