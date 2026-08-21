import type { Attempt, Card, Id, ReviewLog, Topic, Question } from "./types";
import { retrievability } from "./scheduling";

// ---------------------------------------------------------------------------
// Knowledge tracing — topic and question level, plus empirical difficulty.
//
// Two layers:
//  1. Topic KT: classic BKT-lite per topic, updated from attempt history in
//     chronological order. Produces pKnown ∈ [0,1] — the probability the
//     student *knows* the topic right now. Unlike mastery (a blended snapshot),
//     KT is sequential and predicts the *next* answer.
//  2. Question difficulty: success rate per question mapped to 1–5, so the
//     recommender and examiner can say "this question is objectively hard
//     for Revise learners" rather than just trusting the author's 1–5.
//
// Both are pure, offline, and gated on sample size.
// ---------------------------------------------------------------------------

const P_SLIP = 0.11; // knows it but slips
const P_GUESS = 0.22; // doesn't know but guesses correctly
const P_TRANSIT = 0.14; // learns after an attempt
const P_INIT = 0.35; // prior before any evidence
export const QUESTION_DIFFICULTY_MIN_SAMPLES = 5;

export interface TopicTrace {
  topicId: Id;
  subjectId: Id;
  pKnown: number; // 0–1
  pKnownLower: number;
  pKnownUpper: number;
  attempts: number;
  cards: number;
  retentionAvg: number | null;
  lastUpdated: string | null;
  reliable: boolean;
  narrative: string;
}

export interface QuestionTrace {
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  intrinsicDifficulty: number;
  empiricalDifficulty: number; // 1–5
  gap: number;
  successRate: number | null;
  attempts: number;
  reliable: boolean;
  discrimination: number | null; // point-biserial proxy: corr with topic mastery (when available)
  narrative: string;
}

export interface DifficultyCalibrationBand {
  level: number;
  questionCount: number;
  attempts: number;
  reliableQuestions: number;
  empiricalDifficulty: number;
  gap: number;
}

export interface DifficultyCalibrationReport {
  status: "insufficient" | "aligned" | "drifting";
  totalAttempts: number;
  reliableQuestions: number;
  driftingQuestions: number;
  levels: DifficultyCalibrationBand[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clamp15(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

function wilson(successes: number, trials: number): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 1 };
  const z = 1.96;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return { lower: Math.max(0, (centre - spread) / denom), upper: Math.min(1, (centre + spread) / denom) };
}

/** BKT update for one piece of evidence. correctness ∈ [0,1] → treated as correct if ≥ 0.6. */
function bktStep(pKnown: number, correct: boolean): number {
  let posterior: number;
  if (correct) {
    const num = pKnown * (1 - P_SLIP);
    const den = num + (1 - pKnown) * P_GUESS;
    posterior = den === 0 ? pKnown : num / den;
  } else {
    const num = pKnown * P_SLIP;
    const den = num + (1 - pKnown) * (1 - P_GUESS);
    posterior = den === 0 ? pKnown : num / den;
  }
  // Opportunity to learn after the evidence
  return posterior + (1 - posterior) * P_TRANSIT;
}

export function traceTopic(input: {
  topic: Topic;
  attempts: Attempt[];
  cards: Card[];
  reviewLogs?: ReviewLog[];
  now?: Date;
}): TopicTrace {
  const now = input.now ?? new Date();
  const atts = [...input.attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let p = P_INIT;
  for (const a of atts) {
    const correctness = a.max ? a.awarded / a.max : 0;
    // Partial-credit aware: ≥0.6 counts as correct, otherwise incorrect. 0.4–0.6 is noisy but we bin it.
    const correct = correctness >= 0.6;
    p = bktStep(p, correct);
    // Retention as a gentle prior: high retention nudges up slightly
    if (input.cards.length) {
      const ret = input.cards.reduce((acc, c) => acc + retrievability(c, now), 0) / input.cards.length;
      p = p * 0.96 + ret * 0.04;
    }
  }
  p = clamp01(p);
  const trials = atts.length + Math.floor(input.cards.length / 3);
  const successes = Math.round(p * Math.max(1, trials));
  const { lower, upper } = wilson(successes, Math.max(1, trials));
  const retentionAvg =
    input.cards.length >= 2 ? input.cards.reduce((a, c) => a + retrievability(c, now), 0) / input.cards.length : null;
  const reliable = atts.length >= 5 || (atts.length >= 3 && input.cards.length >= 6);
  const narrative = !atts.length
    ? "No attempts yet — knowledge estimate is the prior. Answer a few questions to make it personal."
    : !reliable
      ? `Early estimate (${Math.round(p * 100)}%) — answer ${5 - atts.length} more questions on this topic to make it reliable.`
      : p > 0.75
        ? `Strong knowledge (${Math.round(p * 100)}%) — keep it warm with spaced reviews.`
        : p < 0.45
          ? `Knowledge still forming (${Math.round(p * 100)}%) — prioritise this topic.`
          : `Developing (${Math.round(p * 100)}%) — a few more correct answers will lock it in.`;
  return {
    topicId: input.topic.id,
    subjectId: input.topic.subjectId,
    pKnown: Math.round(p * 1000) / 1000,
    pKnownLower: Math.round(lower * 1000) / 1000,
    pKnownUpper: Math.round(upper * 1000) / 1000,
    attempts: atts.length,
    cards: input.cards.length,
    retentionAvg: retentionAvg != null ? Math.round(retentionAvg * 1000) / 1000 : null,
    lastUpdated: atts.length ? atts[atts.length - 1].createdAt : null,
    reliable,
    narrative,
  };
}

export function traceTopics(input: {
  topics: Topic[];
  attemptsByTopic: Map<Id, Attempt[]>;
  cardsByTopic: Map<Id, Card[]>;
  now?: Date;
}): TopicTrace[] {
  return input.topics
    .map((t) =>
      traceTopic({
        topic: t,
        attempts: input.attemptsByTopic.get(t.id) ?? [],
        cards: input.cardsByTopic.get(t.id) ?? [],
        now: input.now,
      }),
    )
    .sort((a, b) => a.pKnown - b.pKnown);
}

/** P(correct) on next attempt given current pKnown — the prediction. */
export function predictCorrect(pKnown: number): number {
  return clamp01(pKnown * (1 - P_SLIP) + (1 - pKnown) * P_GUESS);
}

// --- Question-level difficulty ------------------------------------------

export function traceQuestion(input: {
  question: Question;
  attempts: Attempt[];
}): QuestionTrace {
  const atts = input.attempts;
  const n = atts.length;
  const successRate = n >= 1 ? atts.reduce((a, x) => a + (x.max ? x.awarded / x.max : 0), 0) / n : null;
  const reliable = n >= QUESTION_DIFFICULTY_MIN_SAMPLES;
  let empiricalDifficulty = input.question.difficulty;
  if (successRate != null && reliable) {
    // Map success 0→1 to difficulty 5→1
    const mapped = 5 - successRate * 4;
    const weight = Math.min(1, n / 12);
    empiricalDifficulty = mapped * weight + input.question.difficulty * (1 - weight);
  }
  const ed = clamp15(empiricalDifficulty);
  const gap = ed - input.question.difficulty;
  const narrative =
    n === 0
      ? "No attempts yet — using the author's difficulty as the prior."
      : !reliable
        ? `Only ${n} attempt(s) — measured ${successRate != null ? Math.round(successRate * 100) + "%" : "—"} success is not yet reliable.`
        : gap === 0
          ? `Measured difficulty matches the author's ${input.question.difficulty}/5 (${Math.round((successRate ?? 0) * 100)}% success, n=${n}).`
          : gap > 0
            ? `Harder than authored: ${ed}/5 vs ${input.question.difficulty}/5 (${Math.round((successRate ?? 0) * 100)}% success, n=${n}).`
            : `Easier than authored: ${ed}/5 vs ${input.question.difficulty}/5 (${Math.round((successRate ?? 0) * 100)}% success, n=${n}).`;
  return {
    questionId: input.question.id,
    subjectId: input.question.subjectId,
    topicIds: input.question.topicIds,
    intrinsicDifficulty: input.question.difficulty,
    empiricalDifficulty: ed,
    gap,
    successRate: successRate != null ? Math.round(successRate * 1000) / 1000 : null,
    attempts: n,
    reliable,
    discrimination: null,
    narrative,
  };
}

export function traceQuestions(input: {
  questions: Question[];
  attemptsByQuestion: Map<Id, Attempt[]>;
}): QuestionTrace[] {
  return input.questions
    .map((q) => traceQuestion({ question: q, attempts: input.attemptsByQuestion.get(q.id) ?? [] }))
    .sort((a, b) => b.gap - a.gap);
}

export function empiricalQuestionDifficultyMap(traces: QuestionTrace[]): Map<Id, number> {
  return new Map(traces.filter((t) => t.reliable).map((t) => [t.questionId, t.empiricalDifficulty]));
}

/** Aggregate item traces so Progress can show whether authored levels hold up. */
export function calibrateDifficulty(traces: readonly QuestionTrace[]): DifficultyCalibrationReport {
  const byLevel = new Map<number, { level: number; questionCount: number; attempts: number; reliableQuestions: number; empiricalTotal: number; gapTotal: number }>();
  for (const trace of traces) {
    const row = byLevel.get(trace.intrinsicDifficulty) ?? {
      level: trace.intrinsicDifficulty,
      questionCount: 0,
      attempts: 0,
      reliableQuestions: 0,
      empiricalTotal: 0,
      gapTotal: 0,
    };
    row.questionCount += 1;
    row.attempts += trace.attempts;
    row.reliableQuestions += trace.reliable ? 1 : 0;
    if (trace.attempts > 0) {
      row.empiricalTotal += trace.empiricalDifficulty * trace.attempts;
      row.gapTotal += trace.gap * trace.attempts;
    }
    byLevel.set(trace.intrinsicDifficulty, row);
  }

  const levels = [...byLevel.values()]
    .filter((row) => row.attempts > 0)
    .map((row) => ({
      level: row.level,
      questionCount: row.questionCount,
      attempts: row.attempts,
      reliableQuestions: row.reliableQuestions,
      empiricalDifficulty: round(row.empiricalTotal / Math.max(1, row.attempts)),
      gap: round(row.gapTotal / Math.max(1, row.attempts)),
    }))
    .sort((a, b) => a.level - b.level);
  const totalAttempts = traces.reduce((sum, trace) => sum + trace.attempts, 0);
  const reliableQuestions = traces.filter((trace) => trace.reliable).length;
  const driftingQuestions = traces.filter((trace) => trace.reliable && trace.gap !== 0).length;
  return {
    status: !totalAttempts || !reliableQuestions ? "insufficient" : driftingQuestions ? "drifting" : "aligned",
    totalAttempts,
    reliableQuestions,
    driftingQuestions,
    levels,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
