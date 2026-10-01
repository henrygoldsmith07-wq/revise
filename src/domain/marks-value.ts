// ---------------------------------------------------------------------------
// Marks value — what a topic is worth to the exam, and how sure we are.
//
// The optimiser needs three things the old 0–1 signals did not give it:
//
//   1. stakes     how much of the exam rides on this topic (topic-weight)
//   2. proof      how well the student does on questions they have NOT seen,
//                 as an interval over *different* questions, not a point
//                 estimate inflated by repeats (evidence-weights)
//   3. supply     whether there are unseen, evidence-grade questions left to
//                 practise and prove it on
//
// From those it states marks at stake as a range per 100 marks of the
// subject. The range is real: it comes from the posterior over distinct
// questions and is wide when evidence is thin. Where evidence is missing the
// level is "none" and no marks claim is made.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import { countdownGuidance, type CountdownPhase } from "./exam-countdown";
import { exposureWeights } from "./evidence-weights";
import { hintEvidenceMultiplier } from "./hint-tiers";
import { trustedAssessmentContent } from "./content-trust";
import type { Attempt, Id, Question, Topic } from "./types";

export type EvidenceLevel = "none" | "thin" | "building" | "solid";

export type EvidenceGapKind = "no-questions" | "unreviewed" | "no-unseen" | "few-unseen";

export interface EvidenceGap {
  kind: EvidenceGapKind;
  text: string;
}

/** Prior over performance on a new question, worth two questions of evidence. */
const PRIOR_MEAN = 0.45;
const PRIOR_STRENGTH = 2;
/** 80% credible interval. */
const Z80 = 1.2816;
/** Interval widths that separate the evidence levels. */
const SOLID_WIDTH = 0.4;
const BUILDING_WIDTH = 0.55;
/** At or below this many unseen evidence-grade questions the topic is nearly exhausted. */
export const FEW_UNSEEN = 2;

export interface ProvenPerformance {
  /** Prior-shrunk estimate of the share of marks earned on a question not seen before. */
  rate: number;
  low: number;
  high: number;
  /** Questions' worth of evidence once repeats and hinted answers are discounted. */
  effectiveQuestions: number;
  distinctQuestions: number;
  /** Distinct questions whose first answer needed no hint. */
  independentQuestions: number;
  level: EvidenceLevel;
}

export function betaInterval(successes: number, trials: number): { mean: number; low: number; high: number } {
  const a = successes + PRIOR_MEAN * PRIOR_STRENGTH;
  const b = trials - successes + (1 - PRIOR_MEAN) * PRIOR_STRENGTH;
  const total = a + b;
  const mean = a / total;
  const sd = Math.sqrt((a * b) / (total * total * (total + 1)));
  return { mean, low: Math.max(0, mean - Z80 * sd), high: Math.min(1, mean + Z80 * sd) };
}

export function evidenceLevel(effectiveQuestions: number, width: number): EvidenceLevel {
  if (effectiveQuestions <= 0) return "none";
  if (width <= SOLID_WIDTH) return "solid";
  if (width <= BUILDING_WIDTH) return "building";
  return "thin";
}

/**
 * Performance on unseen questions from a topic's trusted attempts. `exposure`
 * must be computed over the learner's full history so a repeat is recognised
 * even when its first attempt was not trusted.
 */
export function provenPerformance(attempts: readonly Attempt[], exposure: ReadonlyMap<Id, number>): ProvenPerformance {
  let successes = 0;
  let trials = 0;
  const distinct = new Set<Id>();
  const independent = new Set<Id>();
  for (const attempt of attempts) {
    if (attempt.mode === "recall" || attempt.max <= 0) continue;
    const weight = exposure.get(attempt.id) ?? 1;
    trials += weight;
    successes += weight * hintEvidenceMultiplier(attempt.hintTier ?? null) * Math.min(1, Math.max(0, attempt.awarded / attempt.max));
    distinct.add(attempt.questionId);
    if (weight === 1 && !attempt.hintTier && !attempt.repairTeachingSeen && !attempt.copiedAnswer) independent.add(attempt.questionId);
  }
  const { mean, low, high } = betaInterval(successes, trials);
  return {
    rate: round(mean),
    low: round(low),
    high: round(high),
    effectiveQuestions: round(trials),
    distinctQuestions: distinct.size,
    independentQuestions: independent.size,
    level: evidenceLevel(trials, high - low),
  };
}

export interface TopicSupply {
  /** Every question in the bank for this topic, reviewed or not. */
  total: number;
  /** Evidence-grade questions in the bank for this topic. */
  evidenceQuestions: number;
  /** Of those, how many the student has never attempted. */
  unseen: number;
}

export interface TopicValue {
  /** Share of the subject's assessed content (0–1). */
  share: number;
  /** 1 = an average topic in its subject. */
  relativeWeight: number;
  proven: ProvenPerformance;
  /** Marks at stake per 100 marks of the subject; `mid` is meaningful only when level is not "none". */
  atStake: { low: number; mid: number; high: number };
  supply: TopicSupply;
  gaps: EvidenceGap[];
  phase: CountdownPhase;
  /** Multipliers the optimiser applied, kept so the explanation can show them. */
  stakesFactor: number;
  supplyFactor: number;
  phaseFactor: number;
}

export interface TopicValueInput {
  topic: Pick<Topic, "id" | "title">;
  share: number;
  topicsInSubject: number;
  /** Trusted attempts on this topic. */
  attempts: readonly Attempt[];
  /** Attempt weights computed over the full history. */
  exposure: ReadonlyMap<Id, number>;
  /** Every question in the bank for this topic. */
  questions: readonly Question[];
  /** Ids of every question the learner has ever attempted, trusted or not. */
  attemptedQuestionIds: ReadonlySet<Id>;
  daysToExam: number | null;
  /** True when the student has any evidence on the topic at all (cards, reviews, attempts). */
  measured: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function topicSupply(questions: readonly Question[], attempted: ReadonlySet<Id>): TopicSupply {
  const usable = questions.filter(trustedAssessmentContent);
  return { total: questions.length, evidenceQuestions: usable.length, unseen: usable.filter((question) => !attempted.has(question.id)).length };
}

export function evidenceGaps(supply: TopicSupply): EvidenceGap[] {
  if (supply.total === 0) {
    return [{ kind: "no-questions", text: "No exam question covers this topic yet, so it can be revised but not proven." }];
  }
  if (supply.evidenceQuestions === 0) {
    return [{
      kind: "unreviewed",
      text: `${supply.total === 1 ? "The only question" : `All ${supply.total} questions`} on this topic ${supply.total === 1 ? "is" : "are"} awaiting human review. Answers are practice only and are not counted as proof yet.`,
    }];
  }
  if (supply.unseen === 0) {
    return [{ kind: "no-unseen", text: "Every question on this topic has been seen, so new proof needs new questions." }];
  }
  if (supply.unseen <= FEW_UNSEEN) {
    return [{ kind: "few-unseen", text: `Only ${supply.unseen} unseen question${supply.unseen === 1 ? "" : "s"} left on this topic.` }];
  }
  return [];
}

export function buildTopicValue(input: TopicValueInput): TopicValue {
  const relativeWeight = input.topicsInSubject > 0 ? input.share * input.topicsInSubject : 1;
  const proven = provenPerformance(input.attempts, input.exposure);
  const supply = topicSupply(input.questions, input.attemptedQuestionIds);
  const gaps = evidenceGaps(supply);
  const phase = countdownGuidance(input.daysToExam).phase;

  const stakes = 100 * input.share;
  const atStake = {
    low: round(stakes * (1 - proven.high), 1),
    mid: round(stakes * (1 - proven.rate), 1),
    high: round(stakes * (1 - proven.low), 1),
  };

  // A topic's weight tilts the ranking gently: it should break near-ties and
  // matter at the extremes, not override weakness.
  const stakesFactor = round(clamp(Math.sqrt(Math.max(0, relativeWeight)), 0.75, 1.35), 3);
  // If every question has been seen, a session on this topic would be repeats.
  const supplyFactor = supply.evidenceQuestions === 0 ? 1 : supply.unseen === 0 ? 0.85 : supply.unseen <= FEW_UNSEEN ? 0.95 : 1;
  // In the final days, opening an untouched topic is the wrong move.
  const phaseFactor = phase === "final" && !input.measured ? 0.35 : 1;

  return { share: input.share, relativeWeight: round(relativeWeight), proven, atStake, supply, gaps, phase, stakesFactor, supplyFactor, phaseFactor };
}

/** Group the learner's data by topic and value every topic once. */
export function buildTopicValues(input: {
  topics: readonly Topic[];
  shares: ReadonlyMap<Id, number>;
  attempts: readonly Attempt[];
  allAttempts: readonly Attempt[];
  questions: readonly Question[];
  daysToExam: (subjectId: Id) => number | null;
  measured?: (topicId: Id) => boolean;
}): Map<Id, TopicValue> {
  const exposure = exposureWeights(input.allAttempts);
  const attemptedQuestionIds = new Set(input.allAttempts.map((attempt) => attempt.questionId));
  const perSubject = new Map<Id, number>();
  for (const topic of input.topics) perSubject.set(topic.subjectId, (perSubject.get(topic.subjectId) ?? 0) + 1);
  const attemptsByTopic = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    for (const topicId of new Set(attempt.topicIds)) {
      const list = attemptsByTopic.get(topicId);
      if (list) list.push(attempt);
      else attemptsByTopic.set(topicId, [attempt]);
    }
  }
  const questionsByTopic = new Map<Id, Question[]>();
  for (const question of input.questions) {
    for (const topicId of question.topicIds) {
      const list = questionsByTopic.get(topicId);
      if (list) list.push(question);
      else questionsByTopic.set(topicId, [question]);
    }
  }
  const values = new Map<Id, TopicValue>();
  for (const topic of input.topics) {
    const attempts = attemptsByTopic.get(topic.id) ?? [];
    values.set(
      topic.id,
      buildTopicValue({
        topic,
        share: input.shares.get(topic.id) ?? 0,
        topicsInSubject: perSubject.get(topic.subjectId) ?? 1,
        attempts,
        exposure,
        questions: questionsByTopic.get(topic.id) ?? [],
        attemptedQuestionIds,
        daysToExam: input.daysToExam(topic.subjectId),
        measured: input.measured ? input.measured(topic.id) : attempts.length > 0,
      }),
    );
  }
  return values;
}

// --- Where the evidence cannot reach ------------------------------------------

export interface EvidenceGapRow {
  topicId: Id;
  subjectId: Id;
  share: number;
  gap: EvidenceGap;
  supply: TopicSupply;
}

export interface SubjectGapSummary {
  subjectId: Id;
  topics: number;
  noQuestions: number;
  unreviewed: number;
  exhausted: number;
  fewUnseen: number;
}

export interface EvidenceGapReport {
  /** Biggest gaps first: the more of the exam a topic carries, and the harder the gap, the earlier. */
  rows: EvidenceGapRow[];
  bySubject: SubjectGapSummary[];
}

const GAP_SEVERITY: Record<EvidenceGapKind, number> = { "no-questions": 0, unreviewed: 1, "no-unseen": 2, "few-unseen": 3 };

/** Topics where Revise cannot yet prove anything, and why, so a gap is never mistaken for confidence. */
export function evidenceGapReport(input: {
  topics: readonly Topic[];
  shares: ReadonlyMap<Id, number>;
  questions: readonly Question[];
  attempts: readonly Attempt[];
}): EvidenceGapReport {
  const attempted = new Set(input.attempts.map((attempt) => attempt.questionId));
  const byTopic = new Map<Id, Question[]>();
  for (const question of input.questions) {
    for (const topicId of question.topicIds) {
      const list = byTopic.get(topicId);
      if (list) list.push(question);
      else byTopic.set(topicId, [question]);
    }
  }
  const rows: EvidenceGapRow[] = [];
  const summaries = new Map<Id, SubjectGapSummary>();
  for (const topic of input.topics) {
    const summary = summaries.get(topic.subjectId) ?? { subjectId: topic.subjectId, topics: 0, noQuestions: 0, unreviewed: 0, exhausted: 0, fewUnseen: 0 };
    summary.topics += 1;
    summaries.set(topic.subjectId, summary);
    const supply = topicSupply(byTopic.get(topic.id) ?? [], attempted);
    const gap = evidenceGaps(supply)[0];
    if (!gap) continue;
    if (gap.kind === "no-questions") summary.noQuestions += 1;
    else if (gap.kind === "unreviewed") summary.unreviewed += 1;
    else if (gap.kind === "no-unseen") summary.exhausted += 1;
    else summary.fewUnseen += 1;
    rows.push({ topicId: topic.id, subjectId: topic.subjectId, share: input.shares.get(topic.id) ?? 0, gap, supply });
  }
  rows.sort(
    (a, b) => GAP_SEVERITY[a.gap.kind] - GAP_SEVERITY[b.gap.kind] || b.share - a.share || a.topicId.localeCompare(b.topicId),
  );
  return { rows, bySubject: [...summaries.values()].filter((summary) => summary.noQuestions + summary.unreviewed + summary.exhausted + summary.fewUnseen > 0) };
}
