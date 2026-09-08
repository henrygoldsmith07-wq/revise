import type { Attempt, Question } from "./types";

function normaliseAnswer(text: string): string {
  return (text ?? "").toLowerCase().replace(/[−–]/g, "-").replace(/[^a-z0-9.+\-*/= ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSimilarity(a: string, b: string): number {
  const left = new Set(normaliseAnswer(a).split(" ").filter(Boolean));
  const right = new Set(normaliseAnswer(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(left.size, right.size);
}

/**
 * Detect an answer that is effectively a pasted/copied model answer. Short
 * numerical or vocabulary responses are deliberately exempt: matching `2 N`
 * or `mitosis` is evidence of recall, not evidence that the model was copied.
 */
export function answerLooksCopied(question: Question, answers: Record<string, string>): boolean {
  if (question.kind === "mcq") return false;
  return question.parts.some((part) => {
    const answer = normaliseAnswer(answers[part.id] ?? "");
    const model = normaliseAnswer(part.modelAnswer ?? "");
    const tokens = answer.split(" ").filter(Boolean);
    if (!answer || tokens.length < 5 || model.split(" ").filter(Boolean).length < 5) return false;
    return answer === model || (answer.length >= 32 && tokenSimilarity(answer, model) >= 0.92);
  });
}

/** A mark under review cannot establish mastery, even when it is full marks. */
export function trustworthyAttempt(attempt: Attempt): boolean {
  return attempt.markedBy !== "self" && attempt.markEscalation?.status !== "pending" &&
    (attempt.markConfidence === undefined || (Number.isFinite(attempt.markConfidence) && attempt.markConfidence >= 0.6)) &&
    Number.isFinite(attempt.max) && attempt.max > 0 &&
    Number.isFinite(attempt.awarded) && attempt.awarded >= 0 && attempt.awarded <= attempt.max &&
    Number.isFinite(Date.parse(attempt.createdAt));
}

export function independentAttempt(attempt: Attempt): boolean {
  return trustworthyAttempt(attempt) && !attempt.hintTier && !attempt.repairTeachingSeen && !attempt.copiedAnswer && attempt.mode !== "recall";
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
