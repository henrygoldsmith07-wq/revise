import type { PilotLearner } from "./pilot-evidence";
import type { Attempt, Mistake } from "./types";
import type { FunnelEvent } from "./funnel";

/** Explicit local export: no learner answers, feedback, profile or account ID.
 * A random, account-scoped pilot alias is supplied by the Settings action. */
export function privatePilotExport(input: { userId: string; anonId: string; capturedAt: string; events: readonly FunnelEvent[]; attempts: readonly Attempt[]; mistakes: readonly Mistake[] }): { formatVersion: 1; learners: PilotLearner[] } {
  const attempts: Attempt[] = input.attempts.filter(a => a.userId === input.userId).map(a => ({
    id: a.id, userId: input.anonId, questionId: a.questionId, subjectId: a.subjectId, topicIds: a.topicIds,
    answers: {}, marked: [], feedback: "", awarded: a.awarded, max: a.max, markedBy: a.markedBy,
    elapsedMs: a.elapsedMs, mode: a.mode, createdAt: a.createdAt,
    ...(a.markConfidence !== undefined ? { markConfidence: a.markConfidence } : {}),
    ...(a.markEscalation ? { markEscalation: a.markEscalation } : {}),
    ...(a.hintTier ? { hintTier: a.hintTier } : {}),
    ...(a.repairTeachingSeen !== undefined ? { repairTeachingSeen: a.repairTeachingSeen } : {}),
    ...(a.copiedAnswer !== undefined ? { copiedAnswer: a.copiedAnswer } : {}),
    ...(a.mission ? { mission: a.mission } : {}), ...(a.retestMistakeId ? { retestMistakeId: a.retestMistakeId } : {}),
  }));
  const mistakes: Mistake[] = input.mistakes.filter(m => m.userId === input.userId).map(m => ({
    id: m.id, userId: input.anonId, subjectId: m.subjectId, topicId: m.topicId,
    marksLost: m.marksLost, description: "", category: m.category, resolved: m.resolved, createdAt: m.createdAt,
    ...(m.questionId ? { questionId: m.questionId } : {}), ...(m.attemptId ? { attemptId: m.attemptId } : {}),
  }));
  return { formatVersion: 1, learners: [{ anonId: input.anonId, source: "learner-pilot", consented: true, capturedAt: input.capturedAt,
    events: input.events.filter(e => e.anonId === input.userId).map(e => ({ ...e, anonId: input.anonId })), attempts, mistakes }] };
}
