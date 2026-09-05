// ---------------------------------------------------------------------------
// One adaptive learning session.
//
// Today used to choose between two queues: all due cards first, or the top
// recommendation when no card was due. This module makes that decision once.
// Every enrolled topic receives one auditable score made from the evidence
// Revise already stores (FSRS pressure, mastery, open mistakes, exam timing,
// forgetting, uncertainty and capability gaps). The winning topic then gets
// a bounded sequence whose support fades from explanation to independent work
// and transfer, ending on a delayed retrieval.
//
// Pure domain: no React, storage, network, or model calls.
// ---------------------------------------------------------------------------

import { daysToExam, examUrgency } from "./recommender";
import { isDue, retrievability, todayIso } from "./scheduling";
import {
  capabilityState,
  emptyProfile,
  focusCapability,
  type Capability,
  type CapabilityProfile,
  type CapabilityState,
} from "./capability-mastery";
import { deriveCapabilityProfiles } from "./capability-source";
import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
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

export const ADAPTIVE_SESSION_MINUTES = 20;
export const ADAPTIVE_SESSION_MIN_MINUTES = 12;
export const ADAPTIVE_SESSION_MAX_MINUTES = 25;

export type AdaptiveStepKind =
  | "overdue-retrieval"
  | "misconception-repair"
  | "explanation"
  | "supported-practice"
  | "independent-application"
  | "transfer"
  | "delayed-retrieval";

/** The individual blocks the adaptive runner exposes to the student. */
export interface AdaptiveSessionStep {
  id: string;
  kind: AdaptiveStepKind;
  minutes: number;
  label: string;
  /** One sentence explaining the purpose of the block. */
  description: string;
  /** Existing tested route that executes this block. */
  href: string;
  topicId: Id;
  subjectId: Id;
  cardIds: Id[];
  questionIds: Id[];
  mistakeIds: Id[];
}

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
}

export interface AdaptiveTopicCandidate {
  topicId: Id;
  subjectId: Id;
  score: number;
  evidence: AdaptiveEvidence;
}

export interface AdaptiveSessionPlan {
  /** Stable for a topic/day so a checkpoint can identify the same plan. */
  key: string;
  subjectId: Id;
  topicId: Id;
  topicTitle: string;
  /** The configured target (normally 20) and the actual sum after fitting. */
  targetMinutes: number;
  totalMinutes: number;
  score: number;
  reason: string;
  evidence: AdaptiveEvidence;
  steps: AdaptiveSessionStep[];
  startHref: string;
}

export interface AdaptiveSessionInput {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  exams: ExamDate[];
  subjectIds: Id[];
  /** Recall/application evidence powers the capability-aware sequence. */
  recallMastery?: RecallMasteryRow[];
  applicationMastery?: ApplicationMasteryRow[];
  /** Defaults to the product's 20-minute promise; direct callers may test 12–25. */
  targetMinutes?: number;
  now?: Date;
  /** Used by the runner when resuming a plan after an activity changed evidence. */
  topicId?: Id;
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
  return scoreTopic(topic, {
    cards: input.cards,
    reviewLogs: input.reviewLogs,
    questions: input.questions,
    attempts: input.attempts,
    mistakes: input.mistakes,
    mastery: input.mastery,
    exams: input.exams,
    profile,
    today,
    now,
  });
}

/** Build the one best sequence for the next bounded study window. */
export function buildAdaptiveSession(input: AdaptiveSessionInput): AdaptiveSessionPlan | null {
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const targetMinutes = clamp(
    Math.round(input.targetMinutes ?? ADAPTIVE_SESSION_MINUTES),
    ADAPTIVE_SESSION_MIN_MINUTES,
    ADAPTIVE_SESSION_MAX_MINUTES,
  );
  const enrolled = input.subjectIds.length
    ? new Set(input.subjectIds)
    : new Set(input.topics.map((topic) => topic.subjectId));
  const topics = input.topics.filter((topic) => enrolled.has(topic.subjectId));
  if (!topics.length) return null;

  const profiles = deriveCapabilityProfiles({
    recallMastery: input.recallMastery ?? [],
    applicationMastery: input.applicationMastery ?? [],
    attempts: input.attempts,
  });
  const cardsByTopic = groupBy(input.cards, (card) => card.topicId);
  const logsByTopic = groupBy(input.reviewLogs, (log) => log.topicId);
  const questionsByTopic = new Map<Id, Question[]>();
  for (const question of input.questions) {
    for (const topicId of question.topicIds) {
      const list = questionsByTopic.get(topicId) ?? [];
      list.push(question);
      questionsByTopic.set(topicId, list);
    }
  }
  const attemptsByTopic = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    for (const topicId of attempt.topicIds) {
      const list = attemptsByTopic.get(topicId) ?? [];
      list.push(attempt);
      attemptsByTopic.set(topicId, list);
    }
  }
  const mistakesByTopic = groupBy(input.mistakes.filter((mistake) => !mistake.resolved), (mistake) => mistake.topicId);
  const masteryByTopic = new Map(input.mastery.map((row) => [row.topicId, row] as const));

  const candidates = topics.map((topic) =>
    scoreTopic(topic, {
      cards: cardsByTopic.get(topic.id) ?? [],
      reviewLogs: logsByTopic.get(topic.id) ?? [],
      questions: questionsByTopic.get(topic.id) ?? [],
      attempts: attemptsByTopic.get(topic.id) ?? [],
      mistakes: mistakesByTopic.get(topic.id) ?? [],
      mastery: masteryByTopic.get(topic.id),
      exams: input.exams,
      profile: profiles[topic.id] ?? emptyProfile(),
      today,
      now,
    }),
  );

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTopic = topics.find((topic) => topic.id === a.topicId);
    const bTopic = topics.find((topic) => topic.id === b.topicId);
    return (aTopic?.order ?? 0) - (bTopic?.order ?? 0) || a.topicId.localeCompare(b.topicId);
  });
  const selected = (input.topicId ? candidates.find((candidate) => candidate.topicId === input.topicId) : undefined) ?? candidates[0];
  if (!selected) return null;

  const topic = topics.find((candidate) => candidate.id === selected.topicId);
  if (!topic) return null;
  const questions = questionsByTopic.get(topic.id) ?? [];
  const mistakes = mistakesByTopic.get(topic.id) ?? [];
  const attempts = attemptsByTopic.get(topic.id) ?? [];
  const profile = profiles[topic.id] ?? emptyProfile();
  const steps = buildSteps({ topic, selected, cards: cardsByTopic.get(topic.id) ?? [], questions, attempts, mistakes, profile, targetMinutes });
  const totalMinutes = steps.reduce((sum, step) => sum + step.minutes, 0);
  const startHref = `/adaptive-session?topic=${encodeURIComponent(topic.id)}&start=1`;
  const key = `${today}:${topic.id}`;

  return {
    key,
    subjectId: topic.subjectId,
    topicId: topic.id,
    topicTitle: topic.title,
    targetMinutes,
    totalMinutes,
    score: selected.score,
    reason: reasonFor(selected, topic.title),
    evidence: selected.evidence,
    steps,
    startHref,
  };
}

// ---------------------------------------------------------------------------
// Topic scoring
// ---------------------------------------------------------------------------

interface ScoreData {
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
}

function scoreTopic(topic: Topic, input: ScoreData): AdaptiveTopicCandidate {
  const dueCards = input.cards.filter((card) => isDue(card, input.today));
  const overdueCards = dueCards.filter((card) => card.due < input.today);
  const openMistakes = input.mistakes.filter((mistake) => !mistake.resolved);
  const marksLost = openMistakes.reduce((sum, mistake) => sum + Math.max(0, mistake.marksLost), 0);
  const retention = input.cards.length
    ? average(input.cards.map((card) => retrievability(card, input.now)))
    : 0;
  const mastery = clamp01(input.mastery?.mastery ?? 0);
  const lastStudy = latestTimestamp([
    ...input.reviewLogs.map((log) => log.reviewedAt),
    ...input.attempts.map((attempt) => attempt.createdAt),
  ]);
  const daysSinceStudy = lastStudy ? Math.max(0, daysBetween(lastStudy.slice(0, 10), input.today)) : null;
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
  const masteryPressure = 1 - mastery;
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
  const capabilityGap = focusEvidence.score == null ? 0.8 : 1 - clamp01(focusEvidence.score);
  const evidence = input.cards.length + input.attempts.length * 2;
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
  const score =
    fsrs * 0.24 +
    masteryPressure * 0.22 +
    mistakePressure * 0.2 +
    examProximity * 0.16 +
    forgetting * 0.1 +
    capabilityGap * 0.05 +
    uncertainty * 0.03;

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
    },
  };
}

// ---------------------------------------------------------------------------
// Sequence construction
// ---------------------------------------------------------------------------

interface StepInput {
  topic: Topic;
  selected: AdaptiveTopicCandidate;
  cards: Card[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  profile: CapabilityProfile;
  targetMinutes: number;
}

function buildSteps(input: StepInput): AdaptiveSessionStep[] {
  const { topic, selected, cards, questions, attempts, mistakes, profile, targetMinutes } = input;
  const dueCardIds = selected.evidence.dueCardIds.slice(0, 3);
  const delayedCardIds = dueCardIds.length
    ? dueCardIds
    : cards
        .filter((card) => !card.suspended)
        .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
        .slice(0, 1)
        .map((card) => card.id);
  const mistakeIds = selected.evidence.openMistakeIds.slice(0, 3);
  const usedQuestions = new Set<Id>();
  const attemptedIds = new Set(attempts.map((attempt) => attempt.questionId));
  const orderedQuestions = questions.slice().sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  const pickQuestion = (predicate: (question: Question) => boolean): Question | undefined => {
    const found = orderedQuestions.find(
      (question) => !usedQuestions.has(question.id) && !attemptedIds.has(question.id) && predicate(question),
    ) ?? orderedQuestions.find((question) => !usedQuestions.has(question.id) && predicate(question));
    if (found) usedQuestions.add(found.id);
    return found;
  };
  const supported = pickQuestion((question) => question.difficulty <= 2);
  const independent = pickQuestion((question) => question.difficulty >= 3 && question.difficulty <= 4);
  const transfer = pickQuestion(
    (question) => question.difficulty >= 4 || question.origin === "past-paper",
  );

  const focusEvidence = profile[selected.evidence.focus];
  const needsExplanation =
    mistakes.length > 0 ||
    capabilityState(focusEvidence) === "unknown" ||
    (focusEvidence.score ?? 1) < 0.65;
  const steps: AdaptiveSessionStep[] = [];
  const add = (step: Omit<AdaptiveSessionStep, "minutes"> & { minutes: number }) => steps.push(step);
  const common = {
    topicId: topic.id,
    subjectId: topic.subjectId,
    cardIds: [] as Id[],
    questionIds: [] as Id[],
    mistakeIds: [] as Id[],
  };

  if (dueCardIds.length) {
    const count = dueCardIds.length;
    add({
      ...common,
      id: `${topic.id}:overdue-retrieval`,
      kind: "overdue-retrieval",
      minutes: 2,
      label: `${count} ${selected.evidence.overdueCount ? "overdue" : "due"} retrieval${count === 1 ? "" : "s"}`,
      description: "Recall the answer before you reveal it; FSRS grades decide what returns next.",
      href: `/review?topic=${encodeURIComponent(topic.id)}&limit=${dueCardIds.length}&from=adaptive`,
      cardIds: dueCardIds,
    });
  }

  if (mistakeIds.length) {
    add({
      ...common,
      id: `${topic.id}:misconception-repair`,
      kind: "misconception-repair",
      minutes: 2,
      label: "Repair the misconception",
      description: "Name the tempting wrong idea, then replace it with the examiner-safe explanation.",
      href: `/review?mode=mistakes&topic=${encodeURIComponent(topic.id)}&limit=${mistakeIds.length}&from=adaptive`,
      mistakeIds,
    });
  }

  if (needsExplanation) {
    add({
      ...common,
      id: `${topic.id}:explanation`,
      kind: "explanation",
      minutes: 2,
      label: "Explain the gap",
      description: "Write what you remember first, then open the short step-by-step explanation.",
      href: `/lesson?subject=${encodeURIComponent(topic.subjectId)}&topic=${encodeURIComponent(topic.id)}&from=adaptive`,
    });
  }

  if (supported) {
    add({
      ...common,
      id: `${topic.id}:supported-practice`,
      kind: "supported-practice",
      minutes: 4,
      label: "Supported question",
      description: "Use one prompt or hint if needed; the support fades before the next block.",
      href: practiceHref(topic.id, supported.id, "supported"),
      questionIds: [supported.id],
    });
  }

  if (independent) {
    add({
      ...common,
      id: `${topic.id}:independent-application`,
      kind: "independent-application",
      minutes: 4,
      label: "Independent application",
      description: "Answer without notes or hints. This is the evidence rung, not a practice preview.",
      href: practiceHref(topic.id, independent.id, "independent"),
      questionIds: [independent.id],
    });
  }

  if (transfer) {
    add({
      ...common,
      id: `${topic.id}:transfer`,
      kind: "transfer",
      minutes: 4,
      label: "Unfamiliar transfer",
      description: "Apply the same idea in a new context, closer to what an exam will ask.",
      href: practiceHref(topic.id, transfer.id, "transfer"),
      questionIds: [transfer.id],
    });
  }

  // A delayed check is structural, not a suggestion. The runner uses the
  // existing one-day bury/sync path to make a due card reappear tomorrow.
  add({
    ...common,
    id: `${topic.id}:delayed-retrieval`,
    kind: "delayed-retrieval",
    minutes: 2,
    label: "Schedule delayed retrieval",
    description: "Queue one short check for tomorrow so today's gain has to survive a delay.",
    href: `/review?topic=${encodeURIComponent(topic.id)}&limit=1&from=adaptive`,
    cardIds: delayedCardIds,
  });

  fitToBudget(steps, targetMinutes);
  return steps;
}

function fitToBudget(steps: AdaptiveSessionStep[], target: number): void {
  if (!steps.length) return;
  let total = steps.reduce((sum, step) => sum + step.minutes, 0);
  if (total < target) {
    const preferred =
      steps.find((step) => step.kind === "independent-application") ??
      steps.find((step) => step.kind === "supported-practice") ??
      steps.find((step) => step.kind === "transfer") ??
      steps.find((step) => step.kind === "explanation") ??
      steps[steps.length - 1];
    preferred.minutes += target - total;
    total = target;
  }
  if (total <= target) return;

  // Keep every block visible, but shave time from the most flexible blocks
  // first. Delayed retrieval retains at least one minute even on a short test
  // budget, so the overnight rule cannot disappear by accident.
  const order: AdaptiveStepKind[] = [
    "independent-application",
    "supported-practice",
    "transfer",
    "explanation",
    "misconception-repair",
    "overdue-retrieval",
    "delayed-retrieval",
  ];
  let over = total - target;
  for (const kind of order) {
    const step = steps.find((candidate) => candidate.kind === kind);
    if (!step || over <= 0) continue;
    const minimum = kind === "delayed-retrieval" ? 1 : 1;
    const shave = Math.min(over, Math.max(0, step.minutes - minimum));
    step.minutes -= shave;
    over -= shave;
  }
}

function practiceHref(topicId: Id, questionId: Id, step: string): string {
  return `/practice?topic=${encodeURIComponent(topicId)}&question=${encodeURIComponent(questionId)}&adaptiveStep=${step}&from=adaptive`;
}

function reasonFor(candidate: AdaptiveTopicCandidate, topicTitle: string): string {
  const { evidence } = candidate;
  const reasons: string[] = [];
  if (evidence.overdueCount) reasons.push(`${evidence.overdueCount} overdue retrieval${evidence.overdueCount === 1 ? "" : "s"}`);
  else if (evidence.dueCount) reasons.push(`${evidence.dueCount} FSRS retrieval${evidence.dueCount === 1 ? "" : "s"} due`);
  if (evidence.openMistakes) reasons.push(`${evidence.openMistakes} open misconception${evidence.openMistakes === 1 ? "" : "s"}`);
  if (evidence.mastery < 0.55) reasons.push(`${Math.round(evidence.mastery * 100)}% proven mastery`);
  if (evidence.daysToExam != null && evidence.daysToExam <= 30) reasons.push(`exam in ${Math.max(0, evidence.daysToExam)} days`);
  if (evidence.focusState === "unknown") reasons.push(`first ${evidence.focus} evidence`);
  if (!reasons.length) reasons.push("the best balance of recall, application and exam readiness");
  return `${topicTitle}: ${reasons.slice(0, 3).join(" · ")}.`;
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

function groupBy<T>(items: T[], key: (item: T) => Id): Map<Id, T[]> {
  const map = new Map<Id, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}
