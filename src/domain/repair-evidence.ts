import { independentAttempt, isTransferQuestion, trustworthyAttempt, unseenQuestion } from "./learning-evidence";
import type { Attempt, Card, Mistake, MistakeRepairStage, MistakeRepairState, Question, ReviewLog } from "./types";

export const REPAIR_RETENTION_DELAY_MS = 7 * 86_400_000;

/** Reviewing the mistake card is practice, so the unpractised delay starts again. */
export function deferRepairAfterRetrieval(mistake: Mistake, card: Card, log: ReviewLog): Mistake {
  if (mistake.repair?.stage !== "transfer" || log.userId !== mistake.userId || log.cardId !== card.id ||
    (card.sourceMistakeId !== mistake.id && card.id !== mistake.cardId) || !Number.isFinite(Date.parse(log.reviewedAt))) return mistake;
  const dueAt = new Date(Date.parse(log.reviewedAt) + REPAIR_RETENTION_DELAY_MS).toISOString();
  if (mistake.repair.dueAt && dueAt <= mistake.repair.dueAt) return mistake;
  return { ...mistake, repair: { ...mistake.repair, dueAt } };
}

export const REPAIR_STAGE_LABELS: Record<MistakeRepairStage, string> = {
  detected: "Gap detected", diagnosed: "Skill identified", taught: "Explanation shown",
  "guided-success": "Guided success", "independent-success": "Independent success",
  transfer: "Transfer demonstrated", "delayed-retention": "Retention demonstrated", resolved: "Resolved",
};

export function repairTargetParts(mistake: Mistake, question: Question): string[] {
  if (mistake.subjectId !== question.subjectId) return [];
  if (question.id === mistake.questionId) {
    return question.parts.filter((p) => p.id === mistake.partId || (!mistake.partId && question.parts.length === 1)).map((p) => p.id);
  }
  // Broad topic overlap cannot prove that the original weakness was repaired.
  if (mistake.capabilityIds?.length !== 1) return [];
  return question.parts.filter((p) => p.capabilityIds?.length === 1 && p.capabilityIds[0] === mistake.capabilityIds?.[0]).map((p) => p.id);
}

/** The same transition is used for practice, adaptive sessions and paper answers. */
export function advanceMistakeRepair(mistake: Mistake, question: Question, attempt: Attempt,
  history: readonly Attempt[] = [], questions: readonly Question[] = [question]): Mistake {
  const targetParts = repairTargetParts(mistake, question);
  if (!targetParts.length || attempt.questionId !== question.id || attempt.userId !== mistake.userId ||
    attempt.subjectId !== mistake.subjectId || attempt.id === mistake.attemptId ||
    Date.parse(attempt.createdAt) <= Date.parse(mistake.createdAt) || !trustworthyAttempt(attempt)) return mistake;
  // Older rows may contain a partial repair object from an interrupted
  // migration. Treat that as legacy state rather than letting a malformed
  // evidence array crash the learner's next submission.
  const old = mistake.repair && Array.isArray(mistake.repair.evidence) ? mistake.repair : undefined;
  if (old?.evidence.some((e) => e.attemptId === attempt.id) ||
    (old?.evidence.at(-1)?.at ?? "") > attempt.createdAt) return mistake;
  const marked = targetParts.flatMap((id) => attempt.marked.filter((p) => p.partId === id && p.max > 0 &&
    p.max === question.parts.find((q) => q.id === id)?.marks && Number.isFinite(p.awarded) && p.awarded >= 0 && p.awarded <= p.max));
  if (!marked.length) return mistake;
  const repair: MistakeRepairState = old
    ? { ...old, evidence: [...old.evidence] }
    : { version: 1, stage: "detected", evidence: [] };
  const record = (stage: MistakeRepairStage) => {
    repair.stage = stage;
    repair.evidence.push({ attemptId: attempt.id, questionId: question.id, at: attempt.createdAt, stage });
  };
  if (repair.stage === "detected" && mistake.capabilityIds?.length === 1) record("diagnosed");
  const taught = attempt.repairTeachingSeen || Boolean(attempt.hintTier);
  if (taught && ["detected", "diagnosed"].includes(repair.stage)) record("taught");
  const passed = marked.length === targetParts.length && marked.every((p) => p.awarded === p.max && !p.missedPoints.length) &&
    (question.id !== mistake.questionId || !mistake.point || marked.some((p) => p.creditedPoints.includes(mistake.point!)));
  const previous = history.filter((a) => a.userId === attempt.userId && a.id !== attempt.id && a.createdAt <= attempt.createdAt);
  // Persisted repair evidence preserves family exposure even if the caller only has a partial history.
  const source = questions.find((q) => q.id === mistake.questionId);
  const knownQuestionIds = new Set([mistake.questionId, ...(old?.evidence.map((e) => e.questionId) ?? [])]);
  const fresh = !knownQuestionIds.has(question.id) && unseenQuestion(question, previous, questions) &&
    !questions.some((q) => knownQuestionIds.has(q.id) && q.learning?.familyId && q.learning.familyId === question.learning?.familyId);
  const independent = independentAttempt(attempt) && fresh;
  const priorStage = repair.stage;
  if (!passed) {
    record(mistake.capabilityIds?.length === 1 ? "diagnosed" : "detected");
    delete repair.dueAt;
  } else if (priorStage === "taught" && attempt.hintTier !== "worked-solution") {
    record("guided-success");
  } else if (priorStage === "guided-success" && independent && question.learning &&
    ["application", "calculation", "transfer", "synoptic"].includes(question.learning.demand)) {
    record("independent-success");
  } else if (priorStage === "independent-success" && independent && source && isTransferQuestion(question, source)) {
    record("transfer");
    repair.dueAt = new Date(Date.parse(attempt.createdAt) + REPAIR_RETENTION_DELAY_MS).toISOString();
  } else if (priorStage === "transfer") {
    if (independent && repair.dueAt && Date.parse(attempt.createdAt) >= Date.parse(repair.dueAt) &&
      question.learning && ["application", "calculation", "transfer", "synoptic"].includes(question.learning.demand)) {
      record("delayed-retention");
      record("resolved");
      delete repair.dueAt;
    } else {
      // Rehearsing or revealing the skill restarts the retention clock.
      repair.dueAt = new Date(Date.parse(attempt.createdAt) + REPAIR_RETENTION_DELAY_MS).toISOString();
      record("transfer");
    }
  } else if (!repair.evidence.some((e) => e.attemptId === attempt.id)) {
    record(repair.stage);
  }
  const updated: Mistake = { ...mistake, repair, resolved: repair.stage === "resolved",
    retestCount: (mistake.retestCount ?? 0) + 1, lastRetestAttemptId: attempt.id, lastRetestedAt: attempt.createdAt };
  if (updated.resolved) updated.resolvedAt = attempt.createdAt;
  else delete updated.resolvedAt;
  return updated;
}
