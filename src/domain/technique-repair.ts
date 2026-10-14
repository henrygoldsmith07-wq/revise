// Pure repair routing. Generic drills are writing-shape practice, not marking,
// content teaching or evidence of mastery. URLs carry IDs only, never answers.
import { commandWordIn, isActionable, type AttemptErrorDiagnosis } from "./error-diagnosis-plan";
import { ERROR_CONFIDENCE_THRESHOLD, type ErrorCategory } from "./error-taxonomy";
import { classifyMistake } from "./mistake-classification";
import { answerLooksCopied, trustedAssessmentMistake } from "./learning-evidence";
import { validateCommandWord } from "./command-word-validation";
import type { TechniqueDrillId } from "./types-technique-drills";
import type { Attempt, MarkedPart, Mistake, Question, QuestionPart } from "./types";

export interface TechniqueRepair {
  drillId: TechniqueDrillId;
  questionId: string;
  partId: string;
  topicId: string | null;
  why: string;
  href: string;
}

const STRUCTURE_ERRORS: readonly ErrorCategory[] = ["command-word", "insufficient-detail", "reasoning"];
const DRILL_IDS: readonly TechniqueDrillId[] = ["describe", "explain", "evaluate", "six-mark"];

function available(question: Question): boolean {
  return question.kind !== "mcq" && !["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "");
}

function drillFor(question: Question, part: QuestionPart): TechniqueDrillId | null {
  const command = commandWordIn(question, part);
  if (command !== "describe" && command !== "explain" && command !== "evaluate") return null;
  // The six-mark drill is specifically an extended evaluation plan. A long
  // calculation, or even a six-mark explanation, is not that exercise.
  if (command === "evaluate" && part.marks >= 6 && (question.kind === "extended" || question.kind === "structured")) return "six-mark";
  return command;
}

function repair(question: Question, part: QuestionPart, why: string, topicId = question.topicIds[0] ?? null): TechniqueRepair | null {
  if (!available(question)) return null;
  const drillId = drillFor(question, part);
  if (!drillId) return null;
  const params = new URLSearchParams({ drill: drillId, question: question.id, part: part.id });
  if (topicId && question.topicIds.includes(topicId)) params.set("topic", topicId);
  return { drillId, questionId: question.id, partId: part.id, topicId, why, href: `/technique?${params.toString()}` };
}

/** No diagnosis, a full-mark part or a below-threshold guess never gets a drill. */
export function techniqueRepairForDiagnosis(question: Question, diagnosis: AttemptErrorDiagnosis | undefined): TechniqueRepair | null {
  const candidates = [...(diagnosis?.parts ?? [])].sort((a, b) => b.confidence - a.confidence || a.partId.localeCompare(b.partId));
  for (const loss of candidates) {
    if (!isActionable(loss) || !Number.isFinite(loss.confidence) || loss.confidence > 1 || !Number.isFinite(loss.awarded) || !Number.isFinite(loss.max) || loss.awarded < 0 || loss.max <= 0 || loss.awarded >= loss.max || !STRUCTURE_ERRORS.includes(loss.category)) continue;
    const part = question.parts.find((entry) => entry.id === loss.partId);
    if (!part) continue;
    const selected = repair(question, part, `Part ${part.label || part.id}: the diagnosis identifies ${loss.category === "command-word" ? "a command-word loss" : loss.category === "reasoning" ? "a missing reasoning link" : "insufficient detail"}. Practise the ${commandWordIn(question, part)} response shape, then apply it to the real question.`);
    if (selected) return selected;
  }
  return null;
}

export interface TechniqueShapeSuggestion extends TechniqueRepair {
  kind: "tentative-shape";
  title: string;
}

/**
 * Optional offline writing practice, NOT an error diagnosis. A missing wording
 * signal cannot establish why marks were lost. It never changes a diagnosis's
 * actionability, marks, mastery or persistence, and may miss valid wording.
 */
export function techniqueShapeSuggestionForAnswer(input: {
  question: Question;
  marked: readonly MarkedPart[];
  answers?: Record<string, string>;
  copiedAnswer?: boolean;
}): TechniqueShapeSuggestion | null {
  if (!input.answers || input.copiedAnswer || answerLooksCopied(input.question, input.answers)) return null;
  for (const marked of input.marked) {
    if (!Number.isFinite(marked.awarded) || !Number.isFinite(marked.max) || marked.awarded < 0 || marked.max <= 0 || marked.awarded >= marked.max) continue;
    const part = input.question.parts.find((entry) => entry.id === marked.partId);
    if (!part || !drillFor(input.question, part)) continue;
    const answer = (input.answers[part.id] ?? "").trim();
    // A blank or token response gives too little writing to inspect usefully.
    if (answer.length < 12 || answer.split(/\s+/).length < 3) continue;
    const shape = validateCommandWord(input.question, part, answer);
    if (shape.status !== "needs-attention") continue;
    const missing = shape.command === "explain" ? "No explicit cause-and-effect wording was detected."
      : shape.command === "describe" ? "No explicit observation wording was detected."
      : !shape.evidence.includes("balance") && !shape.evidence.includes("judgement") ? "No balance or overall judgement wording was detected."
      : !shape.evidence.includes("balance") ? "No balance or limitation wording was detected."
      : "No overall judgement wording was detected.";
    const selected = repair(input.question, part, `${missing} This does not establish why marks were lost; different wording may be valid.`);
    if (selected) return {
      ...selected,
      kind: "tentative-shape",
      title: `Try ${shape.command === "describe" ? "a" : "an"} ${selected.drillId === "six-mark" ? "extended evaluation" : shape.label} structure drill`,
    };
  }
  return null;
}

/** Aggregate CTA: only unresolved losses with this profile's exact real context. */
export function techniqueRepairForMistakes(input: {
  subjectId: string;
  userId: string;
  mistakes: readonly Mistake[];
  questions: readonly Question[];
  attempts: readonly Attempt[];
}): TechniqueRepair | null {
  const questions = new Map(input.questions.map((question) => [question.id, question]));
  const attempts = new Map(input.attempts.map((attempt) => [attempt.id, attempt]));
  const candidates: { selected: TechniqueRepair; weight: number; createdAt: string }[] = [];
  for (const mistake of input.mistakes) {
    if (mistake.resolved || mistake.userId !== input.userId || mistake.subjectId !== input.subjectId || !Number.isFinite(mistake.marksLost) || mistake.marksLost <= 0) continue;
    const question = questions.get(mistake.questionId ?? "");
    const attempt = attempts.get(mistake.attemptId ?? "");
    const part = question?.parts.find((entry) => entry.id === mistake.partId);
    const marked = attempt?.marked.find((entry) => entry.partId === part?.id);
    if (!question || !part || !attempt || !marked || attempt.userId !== input.userId || attempt.questionId !== question.id || question.subjectId !== input.subjectId || attempt.subjectId !== input.subjectId || !question.topicIds.includes(mistake.topicId) || marked.awarded >= marked.max) continue;
    if (!trustedAssessmentMistake(mistake, input.questions, input.attempts)) continue;
    const confidence = mistake.errorConfidence;
    const diagnosed = mistake.errorCategory && confidence !== undefined && Number.isFinite(confidence) && confidence >= ERROR_CONFIDENCE_THRESHOLD && confidence <= 1;
    // A confident non-structure diagnosis outranks the coarser classifier.
    if (diagnosed && !STRUCTURE_ERRORS.includes(mistake.errorCategory!)) continue;
    // Ignore stale capture-time command tags: current part wording owns demand.
    const classified = classifyMistake({ mistake: { ...mistake, command: undefined }, question, part, attempt });
    if (!diagnosed && (classified.confidence === "low" || (classified.klass !== "command word" && classified.klass !== "structure"))) continue;
    const why = diagnosed
      ? `Part ${part.label || part.id}: a saved diagnosis identifies ${mistake.errorCategory === "command-word" ? "a command-word loss" : mistake.errorCategory === "reasoning" ? "a missing reasoning link" : "insufficient detail"}. Try its response-shape drill before returning to the question.`
      : `Part ${part.label || part.id}: your answer and marking suggest a possible ${classified.klass} loss. Try a response-shape drill, then check the real question; this is a heuristic, not a confirmed cause.`;
    const selected = repair(question, part, why, mistake.topicId);
    if (selected) candidates.push({ selected, weight: mistake.marksLost, createdAt: mistake.createdAt });
  }
  candidates.sort((a, b) => b.weight - a.weight || b.createdAt.localeCompare(a.createdAt) || a.selected.questionId.localeCompare(b.selected.questionId));
  return candidates[0]?.selected ?? null;
}

export interface TechniqueRouteContext {
  drillId: TechniqueDrillId;
  questionId: string | null;
  partId: string | null;
  topicId: string | null;
  requestedContext: boolean;
  invalidContext: boolean;
}

/** Query parameters select writing practice only; all other flags are ignored. */
export function parseTechniqueContext(params: { get(name: string): string | null }): TechniqueRouteContext {
  const id = (value: string | null) => value && /^[a-zA-Z0-9._:-]{1,200}$/.test(value) ? value : null;
  const drill = params.get("drill");
  return {
    drillId: DRILL_IDS.includes(drill as TechniqueDrillId) ? drill as TechniqueDrillId : "describe",
    questionId: id(params.get("question")), partId: id(params.get("part")), topicId: id(params.get("topic")),
    requestedContext: params.get("question") !== null || params.get("topic") !== null || params.get("part") !== null,
    invalidContext: ["question", "part", "topic"].some((name) => params.get(name) !== null && !id(params.get(name))),
  };
}

/** Resolve IDs against this profile's live questions, never a caller's return URL. */
export function techniquePracticeDestination(input: {
  context: TechniqueRouteContext;
  questions: readonly Question[];
  subjectIds: readonly string[];
}): { href: string; label: string; why: string } | null {
  const { context } = input;
  if (context.invalidContext) return null;
  const isCurrent = (question: Question) => available(question) && input.subjectIds.includes(question.subjectId);
  if (context.questionId) {
    const question = input.questions.find((entry) => entry.id === context.questionId && isCurrent(entry));
    const part = context.partId ? question?.parts.find((entry) => entry.id === context.partId) : question?.parts[0];
    if (!question || !part || (context.topicId && !question.topicIds.includes(context.topicId))) return null;
    const command = commandWordIn(question, part);
    return { href: `/practice?question=${encodeURIComponent(question.id)}`, label: "Return to the real question", why: `Your source question${part.label ? `, part ${part.label}` : ""}${command ? `, asks you to ${command}` : ""}. Use this fictional drill to practise response shape, then use the real prompt and mark scheme to check what is required.` };
  }
  if (context.partId || !context.topicId) return null;
  const question = input.questions.find((entry) => entry.topicIds.includes(context.topicId!) && isCurrent(entry));
  if (!question) return null;
  return { href: `/practice?subject=${encodeURIComponent(question.subjectId)}&topic=${encodeURIComponent(context.topicId)}`, label: "Return to topic practice", why: "Practise a response shape here, then apply it to real questions on your selected topic. The drill does not check your subject knowledge." };
}
