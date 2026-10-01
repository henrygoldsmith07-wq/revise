// ---------------------------------------------------------------------------
// Paper autopsy — where a paper sitting lost its marks, and the plan to win
// them back.
//
// Built on the same trusted-attempt filter as the paper weakness report, so an
// autopsy never uses marks the rest of the app would not believe. It adds the
// breakdowns that report lacks (skill, error type, question type), a repair
// plan of short targeted sessions, and an equivalent retest: different
// questions on the same topics at similar marks and difficulty, so progress is
// measured on something the student has not already seen the answer to.
// "Equivalent" means matched on topic, spec points, marks, kind and difficulty;
// it is not a claim of psychometric equivalence.
// ---------------------------------------------------------------------------

import { getTopic } from "./curriculum";
import {
  analysePaperWeakness,
  paperEvidenceAttempts,
  type PaperWeaknessAnalysis,
  type PaperWeaknessInput,
  type PaperWeaknessQuestion,
} from "./paper-weakness";
import type { Attempt, Id, Mistake, Question } from "./types";

export interface AutopsyRow {
  key: string;
  label: string;
  marksLost: number;
  marksAvailable: number;
  /** Share of all marks lost on the paper, 0–1. */
  share: number;
}

export interface RepairStep {
  id: string;
  topicId: Id;
  /** Marks lost on the paper questions this step re-sits. */
  marksToRecover: number;
  resitIds: Id[];
  freshIds: Id[];
  questionIds: Id[];
  totalMarks: number;
  minutes: number;
  /** The mark-scheme points that were missed, to name the fix. */
  focus: string[];
}

export interface EquivalentPair {
  sourceQuestionId: Id;
  equivalentQuestionId: Id;
  topicId: Id;
  sourceMarks: number;
  equivalentMarks: number;
  /** Why these two count as equivalent, in plain language. */
  matchedOn: string[];
}

export interface EquivalentRetest {
  available: boolean;
  pairs: EquivalentPair[];
  questionIds: Id[];
  totalMarks: number;
  /** Paper questions that lost marks but had no unseen match in the bank. */
  unmatched: Id[];
  summary: string;
}

export interface PaperAutopsy {
  paperId: Id;
  paperRunId?: Id;
  title: string;
  subjectId: Id;
  hasEvidence: boolean;
  marksGained: number;
  marksAvailable: number;
  marksLost: number;
  accuracy: number | null;
  analysis: PaperWeaknessAnalysis;
  byTopic: AutopsyRow[];
  bySkill: AutopsyRow[];
  byErrorType: AutopsyRow[];
  byQuestionType: AutopsyRow[];
  lostQuestions: PaperWeaknessQuestion[];
  repairPlan: RepairStep[];
  equivalentRetest: EquivalentRetest;
}

export interface PaperAutopsyInput extends PaperWeaknessInput {
  /** Every question the student can be given; supplies fresh and equivalent questions. */
  bank: Question[];
  /** Full attempt history, used to keep repair and retest questions unseen. */
  history?: Attempt[];
}

export const REPAIR_MAX_STEPS = 4;
const REPAIR_MAX_RESITS = 3;
const REPAIR_MAX_FRESH = 2;
const REPAIR_STEP_MARK_BUDGET = 16;

const AO_LABELS: Record<string, string> = {
  AO1: "AO1 · Knowledge and recall",
  AO2: "AO2 · Applying knowledge",
  AO3: "AO3 · Analysis and evaluation",
  unclassified: "Skill not yet classified",
};

const CATEGORY_LABELS: Record<Mistake["category"] | "unexplained", string> = {
  recall: "Recall gaps",
  method: "Method errors",
  arithmetic: "Arithmetic slips",
  interpretation: "Misreading data or the question",
  communication: "Explanation and wording",
  unclassified: "Not yet classified",
  unexplained: "Not yet classified",
};

const KIND_LABELS: Record<Question["kind"], string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  structured: "Structured",
  calculation: "Calculation",
  extended: "Extended response",
};

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

type Tally = Map<string, { label: string; lost: number; available: number }>;

function add(tally: Tally, key: string, label: string, lost: number, available: number) {
  const row = tally.get(key) ?? { label, lost: 0, available: 0 };
  row.lost += lost;
  row.available += available;
  tally.set(key, row);
}

function rows(tally: Tally, totalLost: number): AutopsyRow[] {
  return [...tally.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      marksLost: round(row.lost),
      marksAvailable: round(row.available),
      share: totalLost ? round(row.lost / totalLost, 3) : 0,
    }))
    .filter((row) => row.marksLost > 0)
    .sort((a, b) => b.marksLost - a.marksLost || a.label.localeCompare(b.label));
}

function specIds(question: Question): Set<Id> {
  return new Set([...(question.specPointIds ?? []), ...question.parts.flatMap((part) => part.specPointIds ?? [])]);
}

function averageDifficulty(questions: Question[]): number {
  return questions.length ? questions.reduce((sum, question) => sum + question.difficulty, 0) / questions.length : 3;
}

export function buildPaperAutopsy(input: PaperAutopsyInput): PaperAutopsy {
  const analysis = analysePaperWeakness(input);
  const evidence = paperEvidenceAttempts(input);
  const evidenceIds = new Set(evidence.map((attempt) => attempt.id));
  const byId = new Map(input.questions.map((question) => [question.id, question] as const));
  const totalLost = analysis.marksLost;

  const skills: Tally = new Map();
  const kinds: Tally = new Map();
  for (const attempt of evidence) {
    const question = byId.get(attempt.questionId);
    if (!question) continue;
    add(kinds, question.kind, KIND_LABELS[question.kind], attempt.max - attempt.awarded, attempt.max);
    if (!attempt.marked.length) {
      const aos = question.aos?.length ? question.aos : ["unclassified"];
      for (const ao of aos) add(skills, ao, AO_LABELS[ao] ?? ao, (attempt.max - attempt.awarded) / aos.length, attempt.max / aos.length);
      continue;
    }
    for (const marked of attempt.marked) {
      const part = question.parts.find((candidate) => candidate.id === marked.partId);
      const aos = part?.aos?.length ? part.aos : question.aos?.length ? question.aos : ["unclassified"];
      for (const ao of aos) add(skills, ao, AO_LABELS[ao] ?? ao, (marked.max - marked.awarded) / aos.length, marked.max / aos.length);
    }
  }

  const errorTypes: Tally = new Map();
  let explained = 0;
  for (const mistake of input.mistakes ?? []) {
    if (!mistake.attemptId || !evidenceIds.has(mistake.attemptId) || mistake.marksLost <= 0) continue;
    add(errorTypes, mistake.category, CATEGORY_LABELS[mistake.category], mistake.marksLost, 0);
    explained += mistake.marksLost;
  }
  if (totalLost - explained > 0.05) add(errorTypes, "unexplained", CATEGORY_LABELS.unexplained, totalLost - explained, 0);

  const topics: Tally = new Map();
  for (const topic of analysis.topics) {
    add(topics, topic.topicId, getTopic(topic.topicId)?.title ?? topic.topicId, topic.marksLost, topic.marksAvailable);
  }

  const lostQuestions = analysis.questions.filter((question) => question.marksLost > 0);
  const history = input.history ?? input.attempts;
  const repairPlan = buildRepairPlan({ analysis, lostQuestions, byId, bank: input.bank, history, paperQuestionIds: new Set(input.paper.questionIds) });
  const equivalentRetest = buildEquivalentRetest({ lostQuestions, byId, bank: input.bank, history, paperQuestionIds: new Set(input.paper.questionIds) });

  return {
    paperId: input.paper.id,
    paperRunId: input.paperRunId,
    title: input.paper.title,
    subjectId: input.paper.subjectId,
    hasEvidence: evidence.length > 0,
    marksGained: analysis.marksGained,
    marksAvailable: analysis.marksAvailable,
    marksLost: totalLost,
    accuracy: analysis.accuracy,
    analysis,
    byTopic: rows(topics, totalLost),
    bySkill: rows(skills, totalLost),
    byErrorType: rows(errorTypes, totalLost),
    byQuestionType: rows(kinds, totalLost),
    lostQuestions,
    repairPlan,
    equivalentRetest,
  };
}

interface PlanContext {
  lostQuestions: PaperWeaknessQuestion[];
  byId: Map<Id, Question>;
  bank: Question[];
  history: Attempt[];
  paperQuestionIds: Set<Id>;
}

function buildRepairPlan(context: PlanContext & { analysis: PaperWeaknessAnalysis }): RepairStep[] {
  const { analysis, lostQuestions, byId, bank, history, paperQuestionIds } = context;
  const seen = new Set(history.map((attempt) => attempt.questionId));
  const topicOrder = analysis.topics.filter((topic) => topic.marksLost > 0).map((topic) => topic.topicId);
  const assigned = new Map<Id, PaperWeaknessQuestion[]>();
  for (const question of lostQuestions) {
    const topicId = topicOrder.find((id) => question.topicIds.includes(id)) ?? question.topicIds[0];
    if (!topicId) continue;
    assigned.set(topicId, [...(assigned.get(topicId) ?? []), question]);
  }

  const used = new Set<Id>();
  const steps: RepairStep[] = [];
  const orderedTopics = [...assigned.entries()]
    .map(([topicId, list]) => ({ topicId, list, lost: list.reduce((sum, question) => sum + question.marksLost, 0) }))
    .sort((a, b) => b.lost - a.lost || a.topicId.localeCompare(b.topicId))
    .slice(0, REPAIR_MAX_STEPS);

  for (const { topicId, list, lost } of orderedTopics) {
    const resits = [...list].sort((a, b) => b.marksLost - a.marksLost || a.questionId.localeCompare(b.questionId)).slice(0, REPAIR_MAX_RESITS);
    const resitQuestions = resits.map((row) => byId.get(row.questionId)).filter((question): question is Question => Boolean(question));
    let marks = resitQuestions.reduce((sum, question) => sum + question.totalMarks, 0);
    const target = averageDifficulty(resitQuestions);
    const fresh = bank
      .filter((question) => question.subjectId === analysis.subjectId && question.topicIds.includes(topicId) && !paperQuestionIds.has(question.id) && !seen.has(question.id) && !used.has(question.id))
      .sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) || a.totalMarks - b.totalMarks || a.id.localeCompare(b.id));
    const freshIds: Id[] = [];
    for (const question of fresh) {
      if (freshIds.length >= REPAIR_MAX_FRESH) break;
      if (marks + question.totalMarks > REPAIR_STEP_MARK_BUDGET && marks > 0) continue;
      freshIds.push(question.id);
      used.add(question.id);
      marks += question.totalMarks;
    }
    const resitIds = resitQuestions.map((question) => question.id);
    steps.push({
      id: `repair-${steps.length + 1}`,
      topicId,
      marksToRecover: round(lost),
      resitIds,
      freshIds,
      questionIds: [...resitIds, ...freshIds],
      totalMarks: marks,
      minutes: Math.max(5, Math.round(marks)),
      focus: [...new Set(list.flatMap((question) => question.missedPoints))].slice(0, 3),
    });
  }
  return steps;
}

function equivalenceScore(source: Question, candidate: Question): { score: number; matchedOn: string[] } {
  const matchedOn: string[] = [];
  let score = 0;
  const a = specIds(source);
  const b = specIds(candidate);
  const shared = [...a].filter((id) => b.has(id)).length;
  if (shared) {
    score += (4 * shared) / (a.size + b.size - shared);
    matchedOn.push("same specification statement");
  }
  if (source.topicIds[0] && source.topicIds[0] === candidate.topicIds[0]) {
    score += 1;
    matchedOn.push("same topic");
  }
  if (source.kind === candidate.kind) {
    score += 2;
    matchedOn.push("same question type");
  }
  const marksGap = Math.abs(source.totalMarks - candidate.totalMarks);
  if (marksGap <= 1) {
    score += 2;
    matchedOn.push(marksGap === 0 ? "same marks" : "similar marks");
  } else if (marksGap <= 2) score += 1;
  if (Math.abs(source.difficulty - candidate.difficulty) <= 1) {
    score += 1;
    matchedOn.push("similar difficulty");
  }
  return { score, matchedOn };
}

function buildEquivalentRetest(context: PlanContext): EquivalentRetest {
  const { lostQuestions, byId, bank, history, paperQuestionIds } = context;
  const seen = new Set(history.map((attempt) => attempt.questionId));
  const taken = new Set<Id>();
  const pairs: EquivalentPair[] = [];
  const unmatched: Id[] = [];

  for (const lost of [...lostQuestions].sort((a, b) => b.marksLost - a.marksLost || a.questionId.localeCompare(b.questionId))) {
    const source = byId.get(lost.questionId);
    if (!source) continue;
    const best = bank
      .filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.subjectId === source.subjectId &&
          !paperQuestionIds.has(candidate.id) &&
          !seen.has(candidate.id) &&
          !taken.has(candidate.id) &&
          candidate.topicIds.some((topicId) => source.topicIds.includes(topicId)),
      )
      .map((candidate) => ({ candidate, ...equivalenceScore(source, candidate) }))
      .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))[0];
    if (!best) {
      unmatched.push(source.id);
      continue;
    }
    taken.add(best.candidate.id);
    pairs.push({
      sourceQuestionId: source.id,
      equivalentQuestionId: best.candidate.id,
      topicId: best.candidate.topicIds.find((id) => source.topicIds.includes(id)) ?? source.topicIds[0] ?? "",
      sourceMarks: source.totalMarks,
      equivalentMarks: best.candidate.totalMarks,
      matchedOn: best.matchedOn,
    });
  }

  const available = pairs.length > 0 && pairs.length >= Math.min(2, lostQuestions.length);
  const totalMarks = pairs.reduce((sum, pair) => sum + pair.equivalentMarks, 0);
  const summary = !lostQuestions.length
    ? "No marks were lost, so there is nothing to retest."
    : available
      ? `${pairs.length} of ${lostQuestions.length} lost question${lostQuestions.length === 1 ? "" : "s"} matched with a new question on the same topic at similar marks${unmatched.length ? `; ${unmatched.length} had no unseen match` : ""}.`
      : "Not enough unseen questions on these topics to build a fair retest yet.";
  return {
    available,
    pairs: available ? pairs : [],
    questionIds: available ? pairs.map((pair) => pair.equivalentQuestionId) : [],
    totalMarks: available ? totalMarks : 0,
    unmatched,
    summary,
  };
}
