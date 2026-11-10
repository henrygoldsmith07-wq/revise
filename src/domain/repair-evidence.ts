import { requiresWjecContentReview, trustedAssessmentContent } from "./physics-content-review";
import { independentAttempt, isTransferQuestion, questionFamilies, questionFreshness, partLearningMetadata, trustedAssessmentAttempt, trustedAssessmentMistake, trustworthyAttempt, unseenQuestion } from "./learning-evidence";
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

/** Mission stages that are another go at the mission's own mistakes, with help available. */
const RETRY_STAGES: ReadonlySet<string> = new Set(["repair", "practise"]);

/**
 * Parts of a mission question that are a further attempt at one of that
 * mission's own open mistakes, and so must not open a new mistake when they
 * lose marks again.
 *
 * A repair step serves a different question on the skill a mark was lost on.
 * `repairTargetParts` recognises it only when both carry the same single
 * capability; most siblings are matched by specification point, so each
 * failed repair opened fresh mistakes and cards for the gap it was meant to
 * close. A student who kept answering "I don't know" went from 12 marks
 * "still open" to 26 in three sessions of trying to repair them.
 *
 * A part counts when the attempt carries the mission's source mistakes
 * (repair or supported practice only: an unaided check that fails is new
 * evidence) and the part shares a specification point or capability with an
 * open source mistake, or its question sits in that mistake's topic. The
 * topic is enough because supported practice is chosen by topic ("new
 * questions that exercise the same weakness"): matching on the point alone
 * still let the count climb from 12 to 19 in three failed runs. The marks
 * the mission set out to recover are the debt; marks dropped while working
 * on it are that work, recorded on the attempt and in mastery, not a second
 * debt. The source mistake stays open; nothing is recovered, resolved or
 * advanced here.
 */
export function missionRetryParts(
  attempt: Pick<Attempt, "mission" | "subjectId">,
  question: Pick<Question, "id" | "subjectId" | "topicIds" | "parts">,
  mistakes: readonly Mistake[],
  questions: readonly Question[],
): Set<string> {
  const out = new Set<string>();
  const context = attempt.mission;
  if (!context || !RETRY_STAGES.has(context.stage) || !context.sourceMistakeIds.length) return out;
  const sourceIds = new Set(context.sourceMistakeIds);
  for (const mistake of mistakes) {
    if (!sourceIds.has(mistake.id) || mistake.resolved || mistake.subjectId !== question.subjectId) continue;
    const source = questions.find((candidate) => candidate.id === mistake.questionId);
    const lostPart = source?.parts.find((part) => part.id === mistake.partId);
    const skills = new Set<string>([
      ...(mistake.capabilityIds ?? []),
      ...(lostPart ? [lostPart] : source?.parts ?? []).flatMap((part) => [...(part.specPointIds ?? []), ...(part.capabilityIds ?? [])]),
    ]);
    for (const part of question.parts) {
      const tags = [...(part.specPointIds ?? []), ...(part.capabilityIds ?? [])];
      if (tags.some((tag) => skills.has(tag)) || question.topicIds.includes(mistake.topicId)) out.add(part.id);
    }
  }
  return out;
}

/** The same transition is used for practice, adaptive sessions and paper answers. */
export function advanceMistakeRepair(mistake: Mistake, question: Question, attempt: Attempt,
  history: readonly Attempt[] = [], questions: readonly Question[] = [question]): Mistake {
  const targetParts = repairTargetParts(mistake, question);
  const source = questions.find((candidate) => candidate.id === mistake.questionId);
  if (!targetParts.length || attempt.questionId !== question.id || attempt.userId !== mistake.userId ||
    attempt.subjectId !== mistake.subjectId || attempt.id === mistake.attemptId ||
    !Number.isFinite(Date.parse(attempt.createdAt)) ||
    Date.parse(attempt.createdAt) <= Date.parse(mistake.createdAt)) return mistake;
  // Review-gated mistakes may be practised, but they cannot advance a repair
  // chain unless the exact original mistake source and the retest are trusted.
  if (!trustworthyAttempt(attempt) || (requiresWjecContentReview(mistake.subjectId) &&
    (!trustedAssessmentMistake(mistake, questions, history) ||
      !trustedAssessmentAttempt(attempt, question, history, questions)))) {
    // Draft practice still exposes the skill. It cannot earn a repair rung,
    // but it must restart the unpractised retention interval.
    if (mistake.repair?.stage === "transfer" && Number.isFinite(Date.parse(attempt.createdAt))) {
      const dueAt = new Date(Date.parse(attempt.createdAt) + REPAIR_RETENTION_DELAY_MS).toISOString();
      if (!mistake.repair.dueAt || dueAt > mistake.repair.dueAt) return { ...mistake, repair: { ...mistake.repair, dueAt } };
    }
    return mistake;
  }
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
  const knownQuestionIds = new Set([mistake.questionId, ...(old?.evidence.map((e) => e.questionId) ?? [])]);
  const knownFamilies = new Set(questions
    .filter((candidate) => knownQuestionIds.has(candidate.id))
    .flatMap((candidate) => questionFamilies(candidate)));
  const fresh = !knownQuestionIds.has(question.id) && unseenQuestion(question, previous, questions) &&
    !questionFamilies(question).some((family) => knownFamilies.has(family)) &&
    (question.subjectId !== "wjec-alevel-physics" || questionFreshness(question, questions.filter(q => knownQuestionIds.has(q.id))).newReasoning);
  const independent = independentAttempt(attempt) && fresh;
  const targetDemands = targetParts
    .map((id) => question.parts.find((part) => part.id === id))
    .map((part) => part ? partLearningMetadata(question, part)?.demand : undefined)
    .filter((demand): demand is NonNullable<typeof demand> => Boolean(demand));
  const independentDemand = targetDemands.some((demand) => ["application", "calculation", "transfer", "synoptic"].includes(demand));
  const priorStage = repair.stage;
  if (!passed) {
    record(mistake.capabilityIds?.length === 1 ? "diagnosed" : "detected");
    delete repair.dueAt;
  } else if (priorStage === "taught" && attempt.hintTier !== "worked-solution" && !attempt.copiedAnswer) {
    record("guided-success");
  } else if (priorStage === "guided-success" && independent && independentDemand) {
    record("independent-success");
  } else if (priorStage === "independent-success" && independent && source && isTransferQuestion(question, source)) {
    record("transfer");
    repair.dueAt = new Date(Date.parse(attempt.createdAt) + REPAIR_RETENTION_DELAY_MS).toISOString();
  } else if (priorStage === "transfer") {
    if (independent && trustedAssessmentContent(question) && repair.dueAt && Date.parse(attempt.createdAt) >= Date.parse(repair.dueAt) &&
      independentDemand && questionFreshness(question, questions.filter(q => knownQuestionIds.has(q.id) ||
        previous.some(a => a.questionId === q.id))).newContext) {
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
