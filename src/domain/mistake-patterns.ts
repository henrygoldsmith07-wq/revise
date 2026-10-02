// ---------------------------------------------------------------------------
// Mistake patterns — recurring root causes across questions, topics, papers
// and dates, plus a strict test for when a pattern is genuinely repaired.
//
// A pattern is repaired only when every mistake in it is resolved AND the
// learner later succeeded, independently and with trusted marking, on a
// question from a different family than any in the pattern. Viewing an
// explanation or re-answering the same question never counts.
// ---------------------------------------------------------------------------

import { independentAttempt, questionFamilies } from "./learning-evidence";
import type { Attempt, Id, Mistake, Question } from "./types";

export type RootCause =
  | "missing-knowledge"
  | "misunderstood-concept"
  | "wrong-method"
  | "arithmetic-slip"
  | "unit-error"
  | "insufficient-explanation"
  | "poor-evaluation"
  | "incomplete-working"
  | "misread-question"
  | "timing"
  | "prerequisite-weakness"
  | "unclassified";

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  "missing-knowledge": "missing knowledge",
  "misunderstood-concept": "a misunderstood concept",
  "wrong-method": "choosing or applying the wrong method",
  "arithmetic-slip": "arithmetic slips",
  "unit-error": "unit errors",
  "insufficient-explanation": "correct ideas without enough explanation or linking",
  "poor-evaluation": "weak evaluation",
  "incomplete-working": "incomplete working",
  "misread-question": "misreading the question",
  timing: "running short of time",
  "prerequisite-weakness": "a weak prerequisite",
  unclassified: "causes not yet classified",
};

export type PatternIntervention = "misconception-correction" | "technique-intervention" | "retrieval-set" | "prerequisite-repair" | "independent-set" | "timed-sprint";

const INTERVENTION_FOR: Record<RootCause, PatternIntervention> = {
  "missing-knowledge": "retrieval-set",
  "misunderstood-concept": "misconception-correction",
  "wrong-method": "independent-set",
  "arithmetic-slip": "technique-intervention",
  "unit-error": "technique-intervention",
  "insufficient-explanation": "technique-intervention",
  "poor-evaluation": "technique-intervention",
  "incomplete-working": "technique-intervention",
  "misread-question": "technique-intervention",
  timing: "timed-sprint",
  "prerequisite-weakness": "prerequisite-repair",
  unclassified: "independent-set",
};

const EVALUATIVE = new Set(["evaluate", "assess", "discuss", "justify", "compare"]);

export function rootCauseOf(mistake: Mistake, opts: { prerequisiteWeakTopics?: ReadonlySet<Id> } = {}): RootCause {
  switch (mistake.workingErrorKind) {
    case "unit-error": return "unit-error";
    case "arithmetic-slip":
    case "rounding-error": return "arithmetic-slip";
    case "incorrect-rearrangement":
    case "substitution-error":
    case "method-error": return "wrong-method";
    case "contradictory-working": return "incomplete-working";
    default: break;
  }
  if (mistake.misconception || mistake.misconceptionEntryId) return "misunderstood-concept";
  if (opts.prerequisiteWeakTopics?.has(mistake.topicId) && (mistake.category === "recall" || mistake.category === "method")) return "prerequisite-weakness";
  switch (mistake.category) {
    case "recall": return "missing-knowledge";
    case "method": return "wrong-method";
    case "arithmetic": return "arithmetic-slip";
    case "interpretation": return "misread-question";
    case "communication": return mistake.command && EVALUATIVE.has(mistake.command) ? "poor-evaluation" : "insufficient-explanation";
    default: return mistake.timing === "rushed" || mistake.timing === "slow" ? "timing" : "unclassified";
  }
}

export interface MistakePattern {
  cause: RootCause;
  mistakeIds: Id[];
  marksLost: number;
  openMarks: number;
  questions: number;
  topics: Id[];
  papers: Id[];
  days: number;
  recurring: boolean;
  repaired: boolean;
  intervention: PatternIntervention;
  headline: string;
}

export interface PatternInput {
  mistakes: readonly Mistake[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  subjectId?: Id;
  prerequisiteWeakTopics?: ReadonlySet<Id>;
}

const day = (iso: string) => iso.slice(0, 10);
const SUCCESS = 0.75;

export function patternRepaired(
  members: readonly Mistake[],
  attempts: readonly Attempt[],
  questions: readonly Question[],
): boolean {
  if (!members.length || members.some((mistake) => !mistake.resolved)) return false;
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  const patternFamilies = new Set<string>();
  const patternQuestions = new Set<Id>();
  for (const mistake of members) {
    if (!mistake.questionId) continue;
    patternQuestions.add(mistake.questionId);
    const question = byId.get(mistake.questionId);
    if (question) for (const family of questionFamilies(question)) patternFamilies.add(family);
  }
  const latest = members.map((mistake) => mistake.createdAt).sort().at(-1)!;
  const topics = new Set(members.map((mistake) => mistake.topicId));
  return attempts.some((attempt) => {
    if (attempt.createdAt <= latest || !independentAttempt(attempt) || patternQuestions.has(attempt.questionId)) return false;
    if (attempt.awarded / attempt.max < SUCCESS || !attempt.topicIds.some((id) => topics.has(id))) return false;
    const question = byId.get(attempt.questionId);
    return !!question && !questionFamilies(question).some((family) => patternFamilies.has(family));
  });
}

export function buildMistakePatterns(input: PatternInput): MistakePattern[] {
  const attemptsById = new Map(input.attempts.map((attempt) => [attempt.id, attempt] as const));
  const groups = new Map<RootCause, Mistake[]>();
  for (const mistake of input.mistakes) {
    if (mistake.marksLost <= 0 || (input.subjectId && mistake.subjectId !== input.subjectId)) continue;
    const cause = rootCauseOf(mistake, { prerequisiteWeakTopics: input.prerequisiteWeakTopics });
    groups.set(cause, [...(groups.get(cause) ?? []), mistake]);
  }
  const rows: MistakePattern[] = [];
  for (const [cause, members] of groups) {
    const questionIds = new Set(members.map((mistake) => mistake.questionId ?? mistake.id));
    const topics = [...new Set(members.map((mistake) => mistake.topicId))].sort();
    const papers = [...new Set(members.flatMap((mistake) => {
      const paper = mistake.attemptId ? attemptsById.get(mistake.attemptId)?.paperSpecId : undefined;
      return paper ? [paper] : [];
    }))].sort();
    const days = new Set(members.map((mistake) => day(mistake.createdAt))).size;
    const marksLost = members.reduce((sum, mistake) => sum + mistake.marksLost, 0);
    const openMarks = members.filter((mistake) => !mistake.resolved).reduce((sum, mistake) => sum + mistake.marksLost, 0);
    const recurring = questionIds.size >= 2 && (days >= 2 || topics.length >= 2);
    const repaired = patternRepaired(members, input.attempts, input.questions);
    const marks = Math.round(marksLost * 10) / 10;
    rows.push({
      cause,
      mistakeIds: members.map((mistake) => mistake.id).sort(),
      marksLost: marks,
      openMarks: Math.round(openMarks * 10) / 10,
      questions: questionIds.size,
      topics,
      papers,
      days,
      recurring,
      repaired,
      intervention: INTERVENTION_FOR[cause],
      headline: `You have lost ${marks} mark${marks === 1 ? "" : "s"} across ${questionIds.size} question${questionIds.size === 1 ? "" : "s"} through ${ROOT_CAUSE_LABEL[cause]}.`,
    });
  }
  return rows.sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.openMarks - a.openMarks || b.marksLost - a.marksLost || a.cause.localeCompare(b.cause));
}
