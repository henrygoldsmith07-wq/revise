import type { Attempt, Mistake } from "./types";
import type { ClassAssignment, ClassEvidence, ClassMembership } from "./classes";

/** Share only assigned work attempted after this class's consent, never answers. */
export function classEvidenceSnapshot(
  member: ClassMembership,
  assignments: ClassAssignment[],
  attempts: Attempt[],
  mistakes: Mistake[],
): ClassEvidence[] {
  if (member.status !== "active") return [];
  const consent = Date.parse(member.consentedAt);
  const authorization = member.ageBand === "13-17" ? Date.parse(member.authorizedAt ?? "") : consent;
  if (!Number.isFinite(consent) || !Number.isFinite(authorization)) return [];
  const sharingStarts = Math.max(consent, authorization);
  const scoped = assignments.filter((assignment) => assignment.classId === member.classId);
  const diagnosis = new Map<string, Mistake>();
  for (const mistake of mistakes) {
    if (!mistake.attemptId || !mistake.misconception) continue;
    const previous = diagnosis.get(mistake.attemptId);
    if (!previous || mistake.marksLost > previous.marksLost) diagnosis.set(mistake.attemptId, mistake);
  }
  return attempts.flatMap((attempt) => {
    const attemptedAt = Date.parse(attempt.createdAt);
    if (!Number.isFinite(attemptedAt) || attemptedAt < sharingStarts || attempt.userId !== member.studentId) return [];
    const assignment = scoped.find((item) => item.kind === "check"
      ? item.questionIds.includes(attempt.questionId)
      : Boolean(item.topicId && attempt.topicIds.includes(item.topicId)));
    if (!assignment) return [];
    const topicId = assignment.topicId ?? attempt.topicIds[0];
    if (!topicId || !Number.isFinite(attempt.max) || !Number.isFinite(attempt.awarded) || attempt.max <= 0 || attempt.awarded < 0 || attempt.awarded > attempt.max) return [];
    return [{ attemptId: attempt.id, studentId: member.studentId, questionId: attempt.questionId,
      topicId, awarded: attempt.awarded, max: attempt.max, attemptedAt: attempt.createdAt,
      misconception: diagnosis.get(attempt.id)?.misconception }];
  });
}
