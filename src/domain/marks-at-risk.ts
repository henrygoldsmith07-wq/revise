// ---------------------------------------------------------------------------
// Marks at risk — where the student is most likely to drop marks again.
//
// This is an observed estimate, not a grade forecast: it totals the marks lost
// on mistakes that are still open (no delayed retest has closed them), then
// breaks that total down by topic, skill (AO), error type, paper, question
// type and recurring pattern. Closed mistakes never count, and a student with
// no marked answers gets "no evidence" rather than a reassuring zero.
//
// "Recover these marks" turns the same data into one bounded practice set: the
// exact questions behind the open losses, plus unseen questions on the same
// topics so the repair is tested on something new.
// ---------------------------------------------------------------------------

import { getSubject, getTopic } from "./curriculum";
import { trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Id, Mistake, Paper, Question } from "./types";

export interface RiskRow {
  key: string;
  label: string;
  marks: number;
  count: number;
  /** Share of all marks at risk, 0–1. */
  share: number;
}

export interface TopicRisk extends RiskRow {
  topicId: Id;
  subjectId: Id;
  /** Marks lost over marks attempted on this topic in the recent window; null with no marked attempts. */
  lossRate: number | null;
  marksAttempted: number;
}

export interface RecurringRisk extends RiskRow {
  questionCount: number;
  /** Separate paper sittings this pattern has cost marks in; 2 or more means it is not a one-paper accident. */
  paperCount: number;
}

export interface MarksAtRiskReport {
  totalMarks: number;
  openMistakes: number;
  attemptsConsidered: number;
  evidence: "none" | "thin" | "adequate";
  topics: TopicRisk[];
  skills: RiskRow[];
  errorTypes: RiskRow[];
  papers: RiskRow[];
  questionTypes: RiskRow[];
  recurring: RecurringRisk[];
  headline: string;
}

export interface MarksAtRiskInput {
  mistakes: Mistake[];
  attempts: Attempt[];
  questions: Question[];
  papers?: Array<Pick<Paper, "id" | "title">>;
  /** Restrict to these subjects (the student's enrolled subjects). */
  subjectIds?: Id[];
  /** Restrict to one subject. */
  subjectId?: Id;
  now?: Date;
}

/** Marked attempts older than this no longer describe the current loss rate. */
export const LOSS_RATE_WINDOW_DAYS = 90;
/** Fewer marked attempts than this and the report says the evidence is thin. */
export const ADEQUATE_EVIDENCE_ATTEMPTS = 8;

const AO_LABELS: Record<string, string> = {
  AO1: "AO1 · Knowledge and recall",
  AO2: "AO2 · Applying knowledge",
  AO3: "AO3 · Analysis and evaluation",
};

const CATEGORY_LABELS: Record<Mistake["category"], string> = {
  recall: "Recall gaps",
  method: "Method errors",
  arithmetic: "Arithmetic slips",
  interpretation: "Misreading data or the question",
  communication: "Explanation and wording",
  unclassified: "Not yet classified",
};

const KIND_LABELS: Record<Question["kind"], string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  structured: "Structured",
  calculation: "Calculation",
  extended: "Extended response",
};

const DAY_MS = 86_400_000;

function openLosses(input: MarksAtRiskInput): Mistake[] {
  const subjects = input.subjectIds ? new Set(input.subjectIds) : null;
  return input.mistakes.filter(
    (mistake) =>
      !mistake.resolved &&
      mistake.marksLost > 0 &&
      (!input.subjectId || mistake.subjectId === input.subjectId) &&
      (!subjects || subjects.has(mistake.subjectId)),
  );
}

function rank(rows: Map<string, { label: string; marks: number; count: number }>, total: number): RiskRow[] {
  return [...rows.entries()]
    .map(([key, row]) => ({ key, label: row.label, marks: round(row.marks), count: row.count, share: total ? round(row.marks / total, 3) : 0 }))
    .sort((a, b) => b.marks - a.marks || b.count - a.count || a.label.localeCompare(b.label));
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function bump(map: Map<string, { label: string; marks: number; count: number }>, key: string, label: string, marks: number) {
  const row = map.get(key) ?? { label, marks: 0, count: 0 };
  row.marks += marks;
  row.count += 1;
  map.set(key, row);
}

function recurringKey(mistake: Mistake): { key: string; label: string } {
  if (mistake.misconceptionEntryId) {
    return { key: `entry:${mistake.misconceptionEntryId}`, label: mistake.description || CATEGORY_LABELS[mistake.category] };
  }
  if (mistake.misconception && mistake.misconception !== "other") {
    return { key: `tag:${mistake.misconception}`, label: mistake.misconception.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) };
  }
  const command = mistake.command && mistake.command !== "other" ? mistake.command : "";
  return {
    key: `category:${mistake.category}:${command}`,
    label: `${CATEGORY_LABELS[mistake.category]}${command ? ` on “${command}” questions` : ""}`,
  };
}

function topicLossRates(attempts: Attempt[], questionsById: Map<Id, Question>, now: Date) {
  const cutoff = now.getTime() - LOSS_RATE_WINDOW_DAYS * DAY_MS;
  const byTopic = new Map<Id, { lost: number; attempted: number }>();
  for (const attempt of attempts) {
    if (!trustworthyAttempt(attempt) || Date.parse(attempt.createdAt) < cutoff) continue;
    const question = questionsById.get(attempt.questionId);
    const topicIds = [...new Set(question?.topicIds.length ? question.topicIds : attempt.topicIds)];
    if (!topicIds.length) continue;
    for (const topicId of topicIds) {
      const row = byTopic.get(topicId) ?? { lost: 0, attempted: 0 };
      row.lost += (attempt.max - attempt.awarded) / topicIds.length;
      row.attempted += attempt.max / topicIds.length;
      byTopic.set(topicId, row);
    }
  }
  return byTopic;
}

export function buildMarksAtRisk(input: MarksAtRiskInput): MarksAtRiskReport {
  const now = input.now ?? new Date();
  const open = openLosses(input);
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const attemptsById = new Map(input.attempts.map((attempt) => [attempt.id, attempt] as const));
  const papersById = new Map((input.papers ?? []).map((paper) => [paper.id, paper.title] as const));
  const total = open.reduce((sum, mistake) => sum + mistake.marksLost, 0);

  const topics = new Map<string, { label: string; marks: number; count: number }>();
  const topicSubjects = new Map<string, Id>();
  const skills = new Map<string, { label: string; marks: number; count: number }>();
  const errorTypes = new Map<string, { label: string; marks: number; count: number }>();
  const papers = new Map<string, { label: string; marks: number; count: number }>();
  const questionTypes = new Map<string, { label: string; marks: number; count: number }>();
  const recurring = new Map<string, { label: string; marks: number; count: number; questions: Set<Id>; sittings: Set<Id> }>();

  for (const mistake of open) {
    bump(topics, mistake.topicId, getTopic(mistake.topicId)?.title ?? mistake.topicId, mistake.marksLost);
    topicSubjects.set(mistake.topicId, mistake.subjectId);
    bump(skills, mistake.ao ?? "unclassified", mistake.ao ? AO_LABELS[mistake.ao] ?? mistake.ao : "Skill not yet classified", mistake.marksLost);
    bump(errorTypes, mistake.category, CATEGORY_LABELS[mistake.category], mistake.marksLost);

    const attempt = mistake.attemptId ? attemptsById.get(mistake.attemptId) : undefined;
    const paperName = attempt?.paperSpecId
      ? getSubject(mistake.subjectId)?.papers.find((paper) => paper.id === attempt.paperSpecId)?.name
      : undefined;
    const paperTitle = attempt?.paperId ? papersById.get(attempt.paperId) : undefined;
    if (paperName) bump(papers, `spec:${attempt?.paperSpecId}`, paperName, mistake.marksLost);
    else if (paperTitle) bump(papers, `paper:${attempt?.paperId}`, paperTitle, mistake.marksLost);
    else bump(papers, "practice", "Practice questions (not tied to a paper)", mistake.marksLost);

    const question = mistake.questionId ? questionsById.get(mistake.questionId) : undefined;
    bump(questionTypes, question?.kind ?? "unknown", question ? KIND_LABELS[question.kind] : "Question type unknown", mistake.marksLost);

    const pattern = recurringKey(mistake);
    const row = recurring.get(pattern.key) ?? { label: pattern.label, marks: 0, count: 0, questions: new Set<Id>(), sittings: new Set<Id>() };
    row.marks += mistake.marksLost;
    row.count += 1;
    if (mistake.questionId) row.questions.add(mistake.questionId);
    if (attempt?.mode === "paper" && attempt.paperRunId) row.sittings.add(attempt.paperRunId);
    recurring.set(pattern.key, row);
  }

  const rates = topicLossRates(input.attempts, questionsById, now);
  const topicRows: TopicRisk[] = rank(topics, total).map((row) => {
    const rate = rates.get(row.key);
    return {
      ...row,
      topicId: row.key,
      subjectId: topicSubjects.get(row.key) ?? "",
      lossRate: rate && rate.attempted > 0 ? round(rate.lost / rate.attempted, 3) : null,
      marksAttempted: rate ? round(rate.attempted) : 0,
    };
  });

  const recurringRows: RecurringRisk[] = [...recurring.entries()]
    .filter(([, row]) => row.count >= 2)
    .map(([key, row]) => ({
      key,
      label: row.label,
      marks: round(row.marks),
      count: row.count,
      share: total ? round(row.marks / total, 3) : 0,
      questionCount: row.questions.size,
      paperCount: row.sittings.size,
    }))
    // A pattern that has cost marks on several papers is the clearest signal there is.
    .sort((a, b) => Number(b.paperCount >= 2) - Number(a.paperCount >= 2) || b.marks - a.marks || b.count - a.count || a.label.localeCompare(b.label));

  const subjects = input.subjectIds ? new Set(input.subjectIds) : null;
  const attemptsConsidered = input.attempts.filter(
    (attempt) =>
      trustworthyAttempt(attempt) &&
      (!input.subjectId || attempt.subjectId === input.subjectId) &&
      (!subjects || subjects.has(attempt.subjectId)),
  ).length;
  const evidence = attemptsConsidered === 0 ? "none" : attemptsConsidered < ADEQUATE_EVIDENCE_ATTEMPTS ? "thin" : "adequate";

  return {
    totalMarks: round(total),
    openMistakes: open.length,
    attemptsConsidered,
    evidence,
    topics: topicRows,
    skills: rank(skills, total),
    errorTypes: rank(errorTypes, total),
    papers: rank(papers, total),
    questionTypes: rank(questionTypes, total),
    recurring: recurringRows,
    headline: headlineFor(round(total), open.length, evidence, topicRows),
  };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function headlineFor(total: number, openMistakes: number, evidence: MarksAtRiskReport["evidence"], topics: TopicRisk[]): string {
  if (evidence === "none") return "No marked answers yet, so there is nothing to estimate. Answer a few questions and this fills in.";
  if (!openMistakes) return "No open lost marks. Every mark you have dropped has been repaired.";
  const lead = topics[0];
  const verb = total === 1 ? "is" : "are";
  const where =
    !lead || topics.length === 1
      ? lead
        ? `, all in ${lead.label}`
        : ""
      : ` across ${plural(topics.length, "topic")}, ${lead.marks} of them in ${lead.label}`;
  return `${plural(total, "mark")} ${verb} still open${where}.${evidence === "thin" ? " This rests on few marked answers, so treat it as a first read." : ""}`;
}

// --- Recover these marks -----------------------------------------------------

export interface RecoverySession {
  questionIds: Id[];
  /** Questions behind the open losses, re-sat now the mark scheme is known. */
  resitIds: Id[];
  /** Unseen questions on the same topics: the repair tested on something new. */
  freshIds: Id[];
  totalMarks: number;
  /** Open marks on the questions being re-sat. */
  recoverableMarks: number;
  /** Open marks on every topic this session touches. */
  coveredMarks: number;
  topics: Array<{ topicId: Id; marks: number }>;
  minutes: number;
  headline: string;
}

export interface RecoveryInput {
  mistakes: Mistake[];
  questions: Question[];
  attempts: Attempt[];
  subjectIds?: Id[];
  subjectId?: Id;
  maxQuestions?: number;
  markBudget?: number;
}

export const RECOVERY_MAX_QUESTIONS = 6;
export const RECOVERY_MARK_BUDGET = 24;
export const RECOVERY_MIN_MARK_BUDGET = 8;

export function buildRecoverySession(input: RecoveryInput): RecoverySession {
  const maxQuestions = input.maxQuestions ?? RECOVERY_MAX_QUESTIONS;
  const open = openLosses({ ...input, papers: [] });
  // A few open marks do not justify a long session: scale to about three times what is open.
  const openMarks = open.reduce((sum, mistake) => sum + mistake.marksLost, 0);
  const budget = input.markBudget ?? Math.min(RECOVERY_MARK_BUDGET, Math.max(RECOVERY_MIN_MARK_BUDGET, Math.round(openMarks * 3)));
  const bank = new Map(input.questions.map((question) => [question.id, question] as const));
  const subjects = input.subjectIds ? new Set(input.subjectIds) : null;
  const inScope = (question: Question) =>
    (!input.subjectId || question.subjectId === input.subjectId) && (!subjects || subjects.has(question.subjectId));

  const marksByQuestion = new Map<Id, number>();
  const marksByTopic = new Map<Id, number>();
  const lostDifficulty: number[] = [];
  for (const mistake of open) {
    marksByTopic.set(mistake.topicId, (marksByTopic.get(mistake.topicId) ?? 0) + mistake.marksLost);
    const question = mistake.questionId ? bank.get(mistake.questionId) : undefined;
    if (!question || !inScope(question)) continue;
    marksByQuestion.set(question.id, (marksByQuestion.get(question.id) ?? 0) + mistake.marksLost);
    lostDifficulty.push(question.difficulty);
  }

  const picked: Question[] = [];
  let marks = 0;
  const take = (question: Question): boolean => {
    if (picked.length >= maxQuestions) return false;
    if (picked.length > 0 && marks + question.totalMarks > budget) return false;
    picked.push(question);
    marks += question.totalMarks;
    return true;
  };

  const resitLimit = Math.max(1, Math.ceil((maxQuestions * 2) / 3));
  const resits = [...marksByQuestion.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => bank.get(id)!);
  const resitIds: Id[] = [];
  for (const question of resits) {
    if (resitIds.length >= resitLimit) break;
    if (take(question)) resitIds.push(question.id);
  }

  const seen = new Set(input.attempts.map((attempt) => attempt.questionId));
  const targetDifficulty = lostDifficulty.length ? lostDifficulty.reduce((a, b) => a + b, 0) / lostDifficulty.length : 3;
  const topicOrder = [...marksByTopic.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const pools = topicOrder.map((topicId) =>
    input.questions
      .filter((question) => inScope(question) && question.topicIds.includes(topicId) && !seen.has(question.id) && !picked.includes(question))
      .sort((a, b) => Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty) || a.totalMarks - b.totalMarks || a.id.localeCompare(b.id)),
  );
  const freshIds: Id[] = [];
  const rounds = Math.min(40, Math.max(0, ...pools.map((pool) => pool.length)));
  for (let round = 0; round < rounds && picked.length < maxQuestions; round++) {
    for (const pool of pools) {
      const candidate = pool[round];
      if (candidate && !picked.includes(candidate) && take(candidate)) freshIds.push(candidate.id);
    }
  }

  const touched = new Set(picked.flatMap((question) => question.topicIds).filter((id) => marksByTopic.has(id)));
  const topics = [...touched].map((topicId) => ({ topicId, marks: round(marksByTopic.get(topicId) ?? 0) })).sort((a, b) => b.marks - a.marks || a.topicId.localeCompare(b.topicId));
  const recoverableMarks = round(resitIds.reduce((sum, id) => sum + (marksByQuestion.get(id) ?? 0), 0));
  const coveredMarks = round(topics.reduce((sum, topic) => sum + topic.marks, 0));
  const minutes = Math.max(5, Math.round(marks));

  return {
    questionIds: picked.map((question) => question.id),
    resitIds,
    freshIds,
    totalMarks: marks,
    recoverableMarks,
    coveredMarks,
    topics,
    minutes,
    headline: picked.length
      ? `${plural(picked.length, "question")} · ${marks} marks · about ${minutes} minutes, aimed at ${coveredMarks} open marks.`
      : "Nothing to recover: no open lost marks have a question to practise.",
  };
}
