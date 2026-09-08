import type { Attempt, Question } from "./types";

/** A mark under review cannot establish mastery, even when it is full marks. */
export function trustworthyAttempt(attempt: Attempt): boolean {
  return attempt.markedBy !== "self" && attempt.markEscalation?.status !== "pending" &&
    (attempt.markConfidence === undefined || (Number.isFinite(attempt.markConfidence) && attempt.markConfidence >= 0.6)) &&
    Number.isFinite(attempt.max) && attempt.max > 0 &&
    Number.isFinite(attempt.awarded) && attempt.awarded >= 0 && attempt.awarded <= attempt.max &&
    Number.isFinite(Date.parse(attempt.createdAt));
}

export function independentAttempt(attempt: Attempt): boolean {
  return trustworthyAttempt(attempt) && !attempt.hintTier && !attempt.repairTeachingSeen && attempt.mode !== "recall";
}

export function questionFamily(question: Question): string {
  return question.learning?.familyId ?? question.id;
}

export function questionCapabilities(question: Question): string[] {
  return [...new Set(question.parts.flatMap((part) => part.capabilityIds ?? []))];
}

/** Transfer is an authored demand and a different context, never a difficulty label. */
export function isTransferQuestion(question: Question, source?: Question): boolean {
  const meta = question.learning;
  if (!meta || !["transfer", "synoptic"].includes(meta.demand)) return false;
  if (!source) return true;
  return question.subjectId === source.subjectId && questionFamily(question) !== questionFamily(source) &&
    meta.contextId !== source.learning?.contextId &&
    questionCapabilities(question).some((id) => questionCapabilities(source).includes(id));
}

/** A renamed or renumbered variant is still familiar evidence. */
export function unseenQuestion(question: Question, history: readonly Attempt[], questions: readonly Question[]): boolean {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return !history.some((a) => a.questionId === question.id ||
    (byId.has(a.questionId) && questionFamily(byId.get(a.questionId)!) === questionFamily(question)));
}
