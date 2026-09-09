import type { Attempt, LearningDemand, PaperMarkingReview, Question, QuestionPart } from "./types";
import { trustedAssessmentContent, verifiedPhysicsPaperProvenance } from "./physics-content-review";

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

/**
 * Fingerprint the exact response and marks a human reviewer saw. This is an
 * optional forward-compatible field on persisted attempts: older reviewed
 * rows can still be trusted, while a supplied fingerprint invalidates the
 * attestation if the response or awarded marks are edited later.
 */
export function paperMarkingFingerprint(attempt: Pick<Attempt, "id" | "questionId" | "answers" | "marked" | "awarded" | "max">): string {
  const text = JSON.stringify([attempt.id, attempt.questionId, attempt.answers, attempt.marked, attempt.awarded, attempt.max]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `paper-mark-v1:${(hash >>> 0).toString(16)}`;
}

/** A paper response is trusted only after a named human has reviewed its mark. */
export function humanReviewedPaperAttempt(attempt: Attempt): boolean {
  if (attempt.mode !== "paper") return false;
  const review: PaperMarkingReview | undefined = attempt.paperMarking;
  if (!review || !["human-reviewed", "adjudicated"].includes(review.status) ||
    !review.reviewerId?.trim() || !review.reviewedAt || !Number.isFinite(Date.parse(review.reviewedAt))) return false;
  const markerCount = review.markerCount;
  if (review.status === "adjudicated" && (typeof markerCount !== "number" || !Number.isInteger(markerCount) || markerCount < 2)) return false;
  if (review.status === "human-reviewed" && markerCount !== undefined &&
    (typeof markerCount !== "number" || !Number.isInteger(markerCount) || markerCount < 1)) return false;
  return !review.markingFingerprint || review.markingFingerprint === paperMarkingFingerprint(attempt);
}

/**
 * Shared gate for answer evidence. A question must be the same subject as
 * the attempt, the content must be trusted, and Physics paper attempts must
 * additionally pass the authenticated provenance + human-marking check. This
 * keeps planners and analytics from inventing their own weaker trust rules.
 */
export function trustedAssessmentAttempt(
  attempt: Attempt,
  question: Question | undefined,
  history: readonly Attempt[],
  questions: readonly Question[],
): boolean {
  if (!question || !trustworthyAttempt(attempt) || question.subjectId !== attempt.subjectId || !trustedAssessmentContent(question)) return false;
  return question.subjectId !== "wjec-alevel-physics" || attempt.mode !== "paper" ||
    authenticPaperEvidence(attempt, question, history, questions);
}

export function questionFamily(question: Question): string {
  return question.learning?.familyId ?? question.parts.map((part) => part.learning?.familyId).find(Boolean) ?? question.id;
}

/** Part-level family/demand, falling back to legacy question metadata. */
export function partLearningMetadata(question: Question, part: QuestionPart) {
  return part.learning ?? (question.learning ? {
    familyId: question.learning.familyId,
    contextId: question.learning.contextId,
    demand: question.learning.demand,
    reasoningMoves: question.learning.reasoningMoves ?? [],
  } : undefined);
}

export function partFamily(question: Question, part: QuestionPart): string {
  return partLearningMetadata(question, part)?.familyId ?? questionFamily(question);
}

/** All authored families represented by a question, including mixed structured parts. */
export function questionFamilies(question: Question): string[] {
  // A question-level family is an explicit author override for legacy or
  // cloned structured items. Otherwise preserve every part-level family.
  if (question.learning?.familyId) return [question.learning.familyId];
  return [...new Set(question.parts.map((part) => partFamily(question, part)).filter(Boolean))];
}

/** Demands represented by a question, used by the planner when parts are mixed. */
export function questionDemands(question: Question): LearningDemand[] {
  return [...new Set(question.parts.map((part) => partLearningMetadata(question, part)?.demand ?? question.learning?.demand).filter((demand): demand is LearningDemand => Boolean(demand)))];
}

export function questionCapabilities(question: Question): string[] {
  return [...new Set(question.parts.flatMap((part) => part.capabilityIds ?? []))];
}

/** Transfer is an authored demand and a different context, never a difficulty label. */
export function isTransferQuestion(question: Question, source?: Question): boolean {
  if (!trustedAssessmentContent(question)) return false;
  // A trusted target cannot turn an unreviewed source into trusted transfer
  // evidence. Drafts can be practised, but the whole chain must start from a
  // reviewed Physics item before transfer or delayed repair is attachable.
  if (source && !trustedAssessmentContent(source)) return false;
  const metas = question.parts.map((part) => partLearningMetadata(question, part)).filter(Boolean);
  if (!metas.length || !metas.some((meta) => ["transfer", "synoptic"].includes(meta!.demand))) return false;
  if (!source) return true;
  const sourceMetas = source.parts.map((part) => partLearningMetadata(source, part)).filter(Boolean);
  const sourceFamilies = new Set(sourceMetas.map((meta) => meta!.familyId));
  const sourceContexts = new Set(sourceMetas.map((meta) => meta!.contextId));
  return question.subjectId === source.subjectId &&
    metas.some((meta) => !sourceFamilies.has(meta!.familyId) && !sourceContexts.has(meta!.contextId)) &&
    questionCapabilities(question).some((id) => questionCapabilities(source).includes(id));
}

/** A renamed or renumbered variant is still familiar evidence. */
export function unseenQuestion(question: Question, history: readonly Attempt[], questions: readonly Question[]): boolean {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const families = new Set(questionFamilies(question));
  return !history.some((a) => a.questionId === question.id ||
    (byId.has(a.questionId) && questionFamilies(byId.get(a.questionId)!).some((family) => families.has(family))));
}

/** A paper-mode flag alone cannot authenticate an unseen exam performance. */
export function authenticPaperEvidence(attempt: Attempt, question: Question | undefined,
  history: readonly Attempt[], questions: readonly Question[]): boolean {
  const provenance = question?.paperProvenance;
  if (!question || question.source !== "past-paper" || !trustedAssessmentContent(question) ||
    !verifiedPhysicsPaperProvenance(question) || !provenance ||
    !independentAttempt(attempt) || !humanReviewedPaperAttempt(attempt) || attempt.mode !== "paper" || !attempt.paperId || !attempt.paperRunId ||
    attempt.subjectId !== question.subjectId || attempt.paperId !== question.paperId ||
    attempt.paperId !== provenance.paperId ||
    (attempt.paperSpecId !== undefined && !attempt.paperSpecId.trim()) ||
    attempt.max !== question.totalMarks ||
    !Number.isFinite(attempt.elapsedMs) || attempt.elapsedMs <= 0) return false;
  return unseenQuestion(question, history.filter((row) => row.userId === attempt.userId &&
    row.id !== attempt.id && row.createdAt <= attempt.createdAt), questions);
}
