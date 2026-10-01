// ---------------------------------------------------------------------------
// Adaptive topic scoring — the single topic optimiser.
//
// Every enrolled topic receives one auditable score made from the evidence
// Revise already stores (FSRS pressure, mastery, open mistakes, exam timing,
// forgetting, uncertainty and capability gaps). Scoring is pure and separately
// testable; plan construction lives in ./adaptive-session.
// ---------------------------------------------------------------------------

import { daysToExam, examUrgency } from "./recommender";
import { valueNextAction } from "./next-best-action";
import { isDue, retrievability, todayIso } from "./scheduling";
import {
  capabilityState,
  emptyProfile,
  focusCapability,
  type Capability,
  type CapabilityProfile,
  type CapabilityState,
} from "./capability-mastery";
import { trustedAssessmentAttempt, trustedAssessmentMistake, trustworthyAttempt } from "./learning-evidence";
import { localDayOfInstant } from "./local-date";
import { exposureWeights } from "./evidence-weights";
import { buildTopicValue, type TopicValue } from "./marks-value";
import type { TopicProof } from "./proof-of-improvement";
import { requiresWjecContentReview } from "./physics-content-review";
import { ADAPTIVE_SESSION_MINUTES } from "./adaptive-budget";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  IsoDate,
  Mistake,
  Question,
  ReviewLog,
  Topic,
  TopicMastery,
} from "./types";

/** Normalised signals used by the single topic optimiser. */
export interface AdaptiveScoreFactors {
  /** Due/overdue pressure and current FSRS retrievability. 0–1. */
  fsrs: number;
  /** Distance from proven topic mastery. 0–1. */
  mastery: number;
  /** Marks and unresolved errors already captured. 0–1. */
  mistakes: number;
  /** Exam proximity, zero when no exam date is known. 0–1. */
  examProximity: number;
  /** Forgetting pressure independent of the due count. 0–1. */
  forgetting: number;
  /** Weakest measured capability, or diagnostic pressure when unknown. 0–1. */
  capabilityGap: number;
  /** Thin evidence should receive a small exploration allowance. 0–1. */
  uncertainty: number;
}

export interface AdaptiveEvidence {
  dueCount: number;
  overdueCount: number;
  dueCardIds: Id[];
  openMistakes: number;
  openMistakeIds: Id[];
  marksLost: number;
  mastery: number;
  retention: number;
  daysSinceStudy: number | null;
  daysToExam: number | null;
  examUrgency: number;
  questionCount: number;
  attempts: number;
  focus: Capability;
  focusState: CapabilityState;
  factors: AdaptiveScoreFactors;
  /** What the topic is worth to the exam and how well that is proven; drives the explanation. */
  value?: TopicValue;
  /** Whether this topic's gains have been proven on new questions after a delay. */
  proof?: Pick<TopicProof, "status" | "provableFrom" | "proofDue" | "gain" | "illusory">;
}

export interface AdaptiveTopicCandidate {
  topicId: Id;
  subjectId: Id;
  score: number;
  evidence: AdaptiveEvidence;
}

/**
 * Evidence used to rank a topic must meet the same trust bar as the mastery
 * engines. Draft review-gated WJEC answers remain available in the question pool for
 * practice, but a draft/poorly marked answer cannot make a topic look better
 * or worse, and a paper answer also needs authenticated provenance and human
 * marking. Keeping this predicate here prevents the session optimiser from
 * accidentally bypassing the lower-level evidence gates.
 */
export function trustedAdaptiveAttempt(
  attempt: Attempt,
  questionById: ReadonlyMap<Id, Question>,
  allAttempts: readonly Attempt[],
  questions: readonly Question[],
): boolean {
  const question = questionById.get(attempt.questionId);
  if (!question) return !requiresWjecContentReview(attempt.subjectId) && trustworthyAttempt(attempt);
  return trustedAssessmentAttempt(attempt, question, allAttempts, questions);
}

export function trustedAdaptiveEvidence(input: {
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  questions: readonly Question[];
}): { attempts: Attempt[]; mistakes: Mistake[] } {
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));
  const attempts = input.attempts.filter((attempt) => trustedAdaptiveAttempt(attempt, questionById, input.attempts, input.questions));
  const mistakes = input.mistakes.filter((mistake) => trustedAssessmentMistake(mistake, input.questions, input.attempts));
  return { attempts, mistakes };
}

/**
 * Score one topic. The exported shape makes the optimisation auditable and
 * easy to regression-test without mounting the app.
 */
export function scoreAdaptiveTopic(input: {
  topic: Topic;
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery?: TopicMastery;
  exams: ExamDate[];
  profile?: CapabilityProfile;
  now?: Date;
}): AdaptiveTopicCandidate {
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const topic = input.topic;
  const profile = input.profile ?? emptyProfile();
  const trusted = trustedAdaptiveEvidence({ attempts: input.attempts, mistakes: input.mistakes, questions: input.questions });
  return scoreTopic(topic, {
    cards: input.cards,
    reviewLogs: input.reviewLogs,
    questions: input.questions,
    attempts: trusted.attempts,
    mistakes: trusted.mistakes,
    mastery: input.mastery,
    exams: input.exams,
    profile,
    today,
    now,
    exposure: exposureWeights(input.attempts),
    attemptedQuestionIds: new Set(input.attempts.map((attempt) => attempt.questionId)),
  });
}

export interface ScoreData {
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery?: TopicMastery;
  exams: ExamDate[];
  profile: CapabilityProfile;
  today: IsoDate;
  now: Date;
  /** The topic's share of its subject's assessed content (default: the only topic). */
  share?: number;
  topicsInSubject?: number;
  /** Attempt weights over the full history, so repeats are recognised. Defaults to this topic's attempts. */
  exposure?: ReadonlyMap<Id, number>;
  attemptedQuestionIds?: ReadonlySet<Id>;
  proof?: TopicProof;
}

export function scoreTopic(topic: Topic, input: ScoreData): AdaptiveTopicCandidate {
  const dueCards = input.cards.filter((card) => isDue(card, input.today));
  const overdueCards = dueCards.filter((card) => card.due < input.today);
  const openMistakes = input.mistakes.filter((mistake) => !mistake.resolved &&
    !(mistake.repair?.stage === "transfer" && mistake.repair.dueAt && Date.parse(mistake.repair.dueAt) > input.now.getTime()));
  const marksLost = openMistakes.reduce((sum, mistake) => sum + Math.max(0, mistake.marksLost), 0);
  const retention = input.cards.length
    ? average(input.cards.map((card) => retrievability(card, input.now)))
    : 0;
  const mastery = clamp01(input.mastery?.mastery ?? 0);
  const lastStudy = latestTimestamp([
    ...input.reviewLogs.map((log) => log.reviewedAt),
    ...input.attempts.map((attempt) => attempt.createdAt),
  ]);
  const daysSinceStudy = lastStudy ? Math.max(0, daysBetween(localDayOfInstant(lastStudy), input.today)) : null;
  const daysTo = daysToExam(input.exams, topic.subjectId, input.today);
  const urgency = examUrgency(daysTo);
  const focus = focusCapability(input.profile);
  const focusEvidence = input.profile[focus];
  const focusState = capabilityState(focusEvidence);

  // These seven signals deliberately live in one weighted score. There is no
  // early return for due cards: a near exam, a large open mark-loss, or a
  // capability gap can win the same competition when it is worth more.
  const duePressure = Math.min(1, dueCards.length / 3);
  const overduePressure = Math.min(1, overdueCards.length / 3);
  const fsrs = clamp01(
    duePressure * 0.6 +
      overduePressure * 0.25 +
      (input.cards.length ? (1 - clamp01(retention)) * 0.15 : 0),
  );
  const measured = input.attempts.length > 0 || (input.mastery?.attempts ?? 0) > 0 ||
    input.reviewLogs.length > 0 || input.cards.some((card) => card.reps > 0);
  const masteryPressure = measured ? 1 - mastery : 0.35;
  const mistakePressure = clamp01(
    Math.min(1, marksLost / 6) * 0.7 + Math.min(1, openMistakes.length / 3) * 0.3,
  );
  const examProximity = daysTo == null ? 0 : clamp01((urgency - 1) / 1);
  const forgetting = clamp01(
    input.cards.length
      ? (1 - clamp01(retention)) * 0.75 + Math.min(1, (daysSinceStudy ?? 0) / 30) * 0.25
      : daysSinceStudy == null
        ? 0.25
        : Math.min(1, daysSinceStudy / 30),
  );
  const capabilityGap = focusEvidence.score == null ? 0 : 1 - clamp01(focusEvidence.score);
  const value = buildTopicValue({
    topic,
    share: input.share ?? 1,
    topicsInSubject: input.topicsInSubject ?? 1,
    attempts: input.attempts,
    exposure: input.exposure ?? exposureWeights(input.attempts),
    questions: input.questions,
    attemptedQuestionIds: input.attemptedQuestionIds ?? new Set(input.attempts.map((attempt) => attempt.questionId)),
    daysToExam: daysTo,
    measured,
  });
  // Different questions are the evidence; a question answered five times is one.
  const questionEvidence = Math.max(value.proven.effectiveQuestions, input.mastery?.distinctQuestions ?? input.mastery?.attempts ?? 0);
  const evidence = input.reviewLogs.length + questionEvidence * 2 + input.cards.filter((card) => card.reps > 0).length;
  const uncertainty = clamp01(1 - evidence / 8);
  const factors: AdaptiveScoreFactors = {
    fsrs,
    mastery: masteryPressure,
    mistakes: mistakePressure,
    examProximity,
    forgetting,
    capabilityGap,
    uncertainty,
  };
  const unprovenSuccess = measured && value.proven.rate >= 0.6 && value.proven.independentQuestions < 3;
  // A delayed unseen test that is due, or a topic that only looks learned, needs a new question now.
  const proofNeeded = Boolean(input.proof?.proofDue || input.proof?.illusory);
  const policy = valueNextAction({
    id: topic.id, kind: "adaptive-session", subjectId: topic.subjectId,
    topicId: topic.id, minutes: ADAPTIVE_SESSION_MINUTES,
    signals: {
      weakness: Math.max(masteryPressure, capabilityGap),
      forgettingRisk: forgetting, retrievalPressure: fsrs,
      mistakePressure, examUrgency: examProximity,
      // 1 for an average topic, lower for a thin one; saturates so a heavy topic cannot buy urgency.
      examWeighting: clamp01(0.5 + 0.5 * value.relativeWeight),
      learningBenefit: Math.max(masteryPressure, capabilityGap),
      retentionBenefit: fsrs, diagnosticValue: focusState === "unknown" ? 1 : uncertainty,
      // Doing well on few different questions is not yet transferable: ask for a new one.
      transferNeed: focusState === "secure" || proofNeeded ? 0.8 : unprovenSuccess ? 0.6 : 0,
      evidenceConfidence: 1 - uncertainty,
    },
  });
  const score = policy.score * value.stakesFactor * value.supplyFactor * value.phaseFactor;

  return {
    topicId: topic.id,
    subjectId: topic.subjectId,
    score: Math.round(score * 10_000) / 10_000,
    evidence: {
      dueCount: dueCards.length,
      overdueCount: overdueCards.length,
      dueCardIds: dueCards
        .slice()
        .sort((a, b) => a.due.localeCompare(b.due) || b.lapses - a.lapses || a.id.localeCompare(b.id))
        .map((card) => card.id),
      openMistakes: openMistakes.length,
      openMistakeIds: openMistakes
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .map((mistake) => mistake.id),
      marksLost,
      mastery,
      retention: Math.round(retention * 10_000) / 10_000,
      daysSinceStudy,
      daysToExam: daysTo,
      examUrgency: urgency,
      questionCount: input.questions.length,
      attempts: input.attempts.length,
      focus,
      focusState,
      factors,
      value,
      ...(input.proof
        ? { proof: { status: input.proof.status, provableFrom: input.proof.provableFrom, proofDue: input.proof.proofDue, gain: input.proof.gain, illusory: input.proof.illusory } }
        : {}),
    },
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function latestTimestamp(values: string[]): string | null {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
