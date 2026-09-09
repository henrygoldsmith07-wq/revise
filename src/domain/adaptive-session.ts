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
import { readinessStopFor } from "./adaptive-stop";
import { wjecCapabilities } from "@/content/capabilities";
import { selectLearningAction, type LearningAction } from "./learning-action";
import { isTransferQuestion } from "./learning-evidence";
import { trustedAssessmentContent } from "./physics-content-review";
import type { HintTier } from "./hints";
import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
import type { ExamReadiness } from "./exam-readiness";
import type {
  Attempt,
  Card,
  ExamDate,
  Id,
  IsoDate,
  Mistake,
  Question,
  RecallGrade,
  ReviewLog,
  Topic,
  TopicMastery,
  InterventionAttemptContext,
  InterventionOutcomeRecord,
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
  | "prerequisite-repair"
  | "delayed-retrieval";

/** Execution parameters a step's runner needs, beyond the ids it targets. */
export interface AdaptiveStepParams {
  /** Whether this rung may offer hints. Independent rungs never may. */
  support: "supported" | "independent";
  /** Highest hint tier a supported rung offers before the worked solution. */
  hintBudget: number;
}

/** Plain-language labels the runner/UI reads off a step. */
export const STEP_LABELS: Record<AdaptiveStepKind, string> = {
  "overdue-retrieval": "Retrieval",
  "misconception-repair": "Repair the misconception",
  explanation: "Explain the gap",
  "supported-practice": "Supported question",
  "independent-application": "Independent application",
  transfer: "Unfamiliar transfer",
  "prerequisite-repair": "Fix the foundation first",
  "delayed-retrieval": "Schedule delayed retrieval",
};

/** The individual blocks the adaptive runner exposes to the student. */
export interface AdaptiveSessionStep {
  id: string;
  kind: AdaptiveStepKind;
  minutes: number;
  label: string;
  /** One sentence explaining the purpose of the block. */
  description: string;
  /** Existing tested route that executes this block (fallback link). */
  href: string;
  topicId: Id;
  subjectId: Id;
  cardIds: Id[];
  questionIds: Id[];
  mistakeIds: Id[];
  /** Why this block is in today's plan, in the student's language. */
  why?: string;
  /** How this rung must be run (hints on/off); independent rungs carry 0 budget. */
  params?: AdaptiveStepParams;
  capabilityId?: Id;
  teaching?: boolean;
  /** Evidence context attached to the attempt for effect calibration. */
  intervention?: InterventionAttemptContext;
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
  /** Set when readiness evidence already proves this topic — core rungs dropped. */
  stoppedEarly?: { reason: string };
  /** Replan one mapped skill action after every submitted answer. */
  learningPolicy?: "capability-evidence-v1";
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
  /** Exam-readiness rows for these subjects; a ready topic may stop early. */
  readiness?: ExamReadiness[];
  /** Defaults to the product's 20-minute promise; direct callers may test 12–25. */
  targetMinutes?: number;
  now?: Date;
  /** Used by the runner when resuming a plan after an activity changed evidence. */
  topicId?: Id;
  /** Observed intervention chains used to replace policy priors. */
  interventionOutcomes?: InterventionOutcomeRecord[];
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
    questions: input.questions,
    trustedQuestion: trustedAssessmentContent,
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
  const stop = readinessStopFor(input.readiness ?? [], topic.subjectId);
  const steps = buildSteps({ topic, selected, cards: cardsByTopic.get(topic.id) ?? [], questions, attempts, mistakes, profile, targetMinutes, stopTopicDone: stop.stop });
  const mapped = questions.some((q) => q.parts.some((p) => p.capabilityIds?.some((id) => wjecCapabilities.some((n) => n.id === id))));
  const action = mapped ? selectLearningAction({ topicId: topic.id, nodes: wjecCapabilities, questions, attempts, mistakes, now, remainingMinutes: targetMinutes, interventionOutcomes: input.interventionOutcomes }) : undefined;
  if (mapped) {
    const retrieval = steps.filter((s) => s.kind === "overdue-retrieval" || s.kind === "delayed-retrieval");
    const delayed = retrieval.find((s) => s.kind === "delayed-retrieval");
    steps.splice(0, steps.length, ...retrieval.filter((s) => s.kind !== "delayed-retrieval"),
      ...(action ? [learningActionStep(action, topic.id, topic.subjectId, 0)] : []), ...(delayed ? [{ ...delayed, minutes: 1 }] : []));
  }
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
    reason: action?.reason ?? reasonFor(selected, topic.title),
    evidence: selected.evidence,
    steps,
    startHref,
    ...(mapped ? { learningPolicy: "capability-evidence-v1" as const } : {}),
    ...(stop.stop && stop.reason ? { stoppedEarly: { reason: stop.reason } } : {}),
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
  /** True while this topic's readiness says the core loop may stop early. */
  stopTopicDone: boolean;
}

function buildSteps(input: StepInput): AdaptiveSessionStep[] {
  const { topic, selected, cards, questions, attempts, mistakes, profile, targetMinutes, stopTopicDone } = input;
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
    (question) => isTransferQuestion(question) && !attemptedIds.has(question.id),
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
  const priorState: InterventionAttemptContext["priorState"] =
    selected.evidence.focusState === "unknown" ? "unknown" :
      selected.evidence.focusState === "emerging" ? "weak" : selected.evidence.focusState;
  const focusCapabilityId: Id = selected.evidence.focus;
  const contextFor = (stepId: Id, kind: InterventionAttemptContext["kind"], activity: NonNullable<InterventionAttemptContext["activity"]>, plannedMinutes: number,
    support: InterventionAttemptContext["support"], capabilityId = focusCapabilityId, chainId = `${topic.id}:${capabilityId}`): InterventionAttemptContext => ({
      id: `${topic.id}:intervention:${stepId}`,
      chainId,
      kind,
      capabilityId,
      topicId: topic.id,
      priorState,
      plannedMinutes,
      support,
      activity,
    });
  const capabilityForQuestion = (question: Question): Id =>
    question.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? focusCapabilityId;

  if (dueCardIds.length) {
    const count = dueCardIds.length;
    add({
      ...common,
      id: `${topic.id}:overdue-retrieval`,
      kind: "overdue-retrieval",
      minutes: 2,
      label: `${count} ${selected.evidence.overdueCount ? "overdue" : "due"} retrieval${count === 1 ? "" : "s"}`,
      description: "Recall the answer before you reveal it; FSRS grades decide what returns next.",
      href: reviewHref(topic.id, `limit=${dueCardIds.length}`),
      cardIds: dueCardIds,
      why: `${count} card${count === 1 ? " is" : "s are"} due — recall first so today's work builds on what is actually there.`,
      intervention: contextFor(`${topic.id}:overdue-retrieval`, "retention", "retrieval", 2, "none"),
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
      href: reviewHref(topic.id, `mode=mistakes&limit=${mistakeIds.length}`),
      mistakeIds,
      why: `${mistakeIds.length} open misconception${mistakeIds.length === 1 ? "" : "s"} — the same lost mark returns unless the wrong idea is replaced.`,
      intervention: contextFor(`${topic.id}:misconception-repair`, "guided", "teaching", 2, "scaffold"),
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
      href: `/lesson?subject=${encodeURIComponent(topic.subjectId)}&topic=${encodeURIComponent(topic.id)}&from=adaptive&return=${encodeURIComponent(`/adaptive-session?topic=${encodeURIComponent(topic.id)}&start=1&resume=1`)}`,
      why: `Your ${selected.evidence.focus} evidence is ${selected.evidence.focusState} — teaching lands on the gap instead of a page of prose.`,
      intervention: contextFor(`${topic.id}:explanation`, "guided", "teaching", 2, "scaffold"),
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
      why: "Scaffolded attempt first — support that counts as weaker evidence, then fades.",
      params: { support: "supported", hintBudget: 3 },
      intervention: contextFor(`${topic.id}:supported-practice:${supported.id}`, "guided", "question", 4, "scaffold", capabilityForQuestion(supported)),
    });
  }

  if (independent && !stopTopicDone) {
    add({
      ...common,
      id: `${topic.id}:independent-application`,
      kind: "independent-application",
      minutes: 4,
      label: "Independent application",
      description: "Answer without notes or hints. This is the evidence rung, not a practice preview.",
      href: practiceHref(topic.id, independent.id, "independent"),
      questionIds: [independent.id],
      why: "Unaided success is the only proof that counts — this rung carries full evidence weight.",
      params: { support: "independent", hintBudget: 0 },
      intervention: contextFor(`${topic.id}:independent-application:${independent.id}`, "independent", "question", 4, "none", capabilityForQuestion(independent)),
    });
  }

  if (transfer && !stopTopicDone) {
    add({
      ...common,
      id: `${topic.id}:transfer`,
      kind: "transfer",
      minutes: 4,
      label: "Unfamiliar transfer",
      description: "Apply the same idea in a new context, closer to what an exam will ask.",
      href: practiceHref(topic.id, transfer.id, "transfer"),
      questionIds: [transfer.id],
      why: "Same idea, new clothing — transfer is what the exam actually tests.",
      params: { support: "independent", hintBudget: 0 },
      intervention: contextFor(`${topic.id}:transfer:${transfer.id}`, "transfer", "question", 4, "none", capabilityForQuestion(transfer)),
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
    href: reviewHref(topic.id, `limit=1`),
    cardIds: delayedCardIds,
    why: "Today's gain only counts if it survives a delay — this check proves it.",
    intervention: contextFor(`${topic.id}:delayed-retrieval`, "retention", "retrieval", 2, "none"),
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
  const back = `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1&resume=1`;
  return `/practice?topic=${encodeURIComponent(topicId)}&question=${encodeURIComponent(questionId)}&adaptiveStep=${step}&from=adaptive&return=${encodeURIComponent(back)}`;
}

function reviewHref(topicId: Id, extra: string): string {
  const back = `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1&resume=1`;
  return `/review?topic=${encodeURIComponent(topicId)}&${extra}&from=adaptive&return=${encodeURIComponent(back)}`;
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

// ---------------------------------------------------------------------------
// Continuous in-session adaptation — the live tutor loop.
//
// buildAdaptiveSession picks the session; this section decides what happens
// INSIDE it. Every executed step becomes a recorded outcome and replanning
// re-derives the remaining sequence from those outcomes plus the evidence the
// step just created, so the sequence adapts to evidence rather than to a
// fixed countdown. Guardrails keep it stable: one topic (plus at most one
// short prerequisite detour), one time budget, never a loop.
//
//   independent success  ⇒ drop unneeded support and teaching;
//   assisted success     ⇒ weaker evidence, an independent retry still owed;
//   failure              ⇒ repair the misconception, raise support, or
//                          (on repetition) detour to the prerequisite;
//   transfer success     ⇒ schedule delayed retrieval and stop drilling;
//   repeated failure     ⇒ close the rung honestly instead of looping.
//
// Pure and deterministic: no React, storage, network or model calls.
// ---------------------------------------------------------------------------

/** Kinds executed as one markable question pass (also the only retestable kinds). */
export const QUESTION_STEP_KINDS: ReadonlySet<AdaptiveStepKind> = new Set([
  "supported-practice",
  "independent-application",
  "transfer",
  "misconception-repair",
  "prerequisite-repair",
]);

/** Minutes a rebuilt mid-session step claims from the remaining budget. */
const REBUILT_STEP_MINUTES: Record<AdaptiveStepKind, number> = {
  "overdue-retrieval": 2,
  "misconception-repair": 3,
  explanation: 2,
  "supported-practice": 4,
  "independent-application": 4,
  transfer: 4,
  "prerequisite-repair": 3,
  "delayed-retrieval": 1,
};

/** Marks ratio a question attempt needs to count as a pass. */
export const ADAPTIVE_PASS_RATIO = 0.7;
/** Question attempts per topic before the tutor closes instead of looping. */
export const ADAPTIVE_MAX_QUESTION_ATTEMPTS = 5;
/** Times the same retrieval card may fail before teaching replaces retrying. */
export const ADAPTIVE_MAX_RETRIEVAL_FAILS = 2;
/** Misconception-repair attempts per session (each one is an independent retest). */
export const ADAPTIVE_MAX_REPAIR_ATTEMPTS = 2;

export type AdaptiveStepResult =
  | "passed-independent"
  | "passed-assisted"
  | "missed"
  | "gave-up"
  | "scheduled"
  | "viewed";

/** One executed step's outcome, kept in run order for replay and replanning. */
export interface AdaptiveStepRecord {
  stepId: Id;
  kind: AdaptiveStepKind;
  minutes: number;
  result: AdaptiveStepResult;
  /** Marks earned on this rung's question (0 for non-question rungs). */
  awardedMarks: number;
  maxMarks: number;
  /** Highest hint tier reached, or null when none was used. */
  hintTier: HintTier | null;
  /** The question attempted or the last card shown for this step. */
  itemId?: Id;
  /** Retrieval cards still missed when this step ended. */
  missedItemIds?: Id[];
  /** Mistake resolved by this step's retest, when one was. */
  resolvedMistakeId?: Id;
  elapsedMs: number;
}

/** The distilled verdict of a prerequisite diagnosis (page passes it in). */
export interface AdaptivePrereqVerdict {
  prereqTopicId: Id;
  prereqTopicTitle: string;
  kind: "prereq-first" | "prereq-unmeasured";
}

export interface AdaptiveReplanInput {
  /** The session as chosen on Today (anchor: topic, focus, budget, original rungs). */
  plan: AdaptiveSessionPlan;
  /** Executed steps in order — the run's evidence so far. */
  completed: AdaptiveStepRecord[];
  /** The topic's question bank, including any questions just attempted. */
  questions: Question[];
  /** The topic's cards in their persisted state. */
  cards: Card[];
  /** Unresolved mistakes on the topic right now (including just-created ones). */
  mistakes: Mistake[];
  /** All attempts on the topic so far (before the run and during it). */
  attempts: Attempt[];
  /** The prerequisite topic's questions, when a detour is being offered. */
  prereqQuestions?: Question[];
  /** The verdict a prerequisite diagnosis produced, when it points upstream. */
  prereq?: AdaptivePrereqVerdict | null;
  /** Observed intervention chains used to replan after every answer. */
  interventionOutcomes?: InterventionOutcomeRecord[];
  now?: Date;
}

export interface AdaptiveReplan {
  /** The next steps, in order. Never repeats an executed step id. */
  steps: AdaptiveSessionStep[];
  /** True when the tutor is satisfied — no more steps to run. */
  done: boolean;
  /** One line saying why the next step (or the stop) happens. */
  reason: string;
  /** True when the run was capped (attempt/exhaustion) rather than satisfied. */
  stopped: boolean;
}

export const DONE_REASON_BUDGET =
  "Your time budget for this session is used up — the gain is scheduled to be tested after a delay.";
export const DONE_REASON_EVIDENCE =
  "Independent application is demonstrated and transfer held — further similar questions would be unnecessary drilling.";
export const DONE_REASON_CAPPED =
  "This rung has been tried enough times in one session; repeating it now would be drilling, not learning. The open points are queued for repair.";

/**
 * Classify one question-rung execution from its marks and support use.
 * Even the smallest hint demotes an otherwise-full success to assisted
 * evidence: only a hint-free pass can be independent proof.
 */
export function resultFromQuestionAttempt(input: {
  awarded: number;
  max: number;
  hintTier: HintTier | null;
  /** A copied model answer is a successful mark, never independent evidence. */
  copiedAnswer?: boolean;
  gaveUp?: boolean;
}): AdaptiveStepResult {
  if (input.gaveUp) return "gave-up";
  const ratio = input.max > 0 ? input.awarded / input.max : 0;
  if (ratio < ADAPTIVE_PASS_RATIO) return "missed";
  return input.hintTier === null && !input.copiedAnswer ? "passed-independent" : "passed-assisted";
}

/** Classify one card-retrieval pass from the grades the student gave. */
export function resultFromRetrievalGrades(grades: RecallGrade[]): AdaptiveStepResult {
  return grades.some((grade) => grade === "again") ? "missed" : "passed-independent";
}

function difficultyNumber(question: Question): number {
  return typeof question.difficulty === "number" && Number.isFinite(question.difficulty)
    ? question.difficulty
    : 3;
}

function inBand(question: Question, band: "supported" | "independent" | "transfer"): boolean {
  const difficulty = difficultyNumber(question);
  if (band === "supported") return difficulty <= 2;
  if (band === "independent") return difficulty >= 3 && difficulty <= 4;
  return isTransferQuestion(question);
}

function baseStep(plan: AdaptiveSessionPlan, kind: AdaptiveStepKind, seq: number): AdaptiveSessionStep {
  const id = `${plan.topicId}:${kind}${seq > 0 ? `-${seq}` : ""}`;
  return {
    id,
    kind,
    minutes: REBUILT_STEP_MINUTES[kind],
    label: STEP_LABELS[kind],
    description: "",
    href: practiceHref(plan.topicId, "", kind),
    topicId: plan.topicId,
    subjectId: plan.subjectId,
    cardIds: [],
    questionIds: [],
    mistakeIds: [],
  };
}

/**
 * Re-derive the rest of a session from what has actually happened.
 * Called after every meaningful step; the caller replaces its remaining
 * queue with the returned steps (never mutating completed history).
 */
export function replanAdaptiveSession(input: AdaptiveReplanInput): AdaptiveReplan {
  const { plan, completed, questions, cards, mistakes, attempts, prereq, prereqQuestions } = input;

  if (plan.learningPolicy === "capability-evidence-v1") {
    const spent = completed.reduce((sum, r) => sum + (r.elapsedMs > 0 ? r.elapsedMs / 60_000 : r.minutes), 0);
    const remaining = Math.max(0, plan.targetMinutes - spent);
    const count = completed.filter((r) => QUESTION_STEP_KINDS.has(r.kind)).length;
    const scheduled = completed.some((r) => r.kind === "delayed-retrieval" && r.result === "scheduled");
    const action = count < ADAPTIVE_MAX_QUESTION_ATTEMPTS && !scheduled ? selectLearningAction({
      topicId: plan.topicId, nodes: wjecCapabilities, questions, attempts, mistakes,
      now: input.now ?? new Date(), remainingMinutes: remaining, interventionOutcomes: input.interventionOutcomes,
    }) : undefined;
    if (action) return { steps: [learningActionStep(action, plan.topicId, plan.subjectId, completed.length + 1)],
      done: false, stopped: false, reason: action.reason };
    const delayed = plan.steps.find((s) => s.kind === "delayed-retrieval");
    const delayedStep = !scheduled && delayed && remaining > 0 ? { ...delayed, minutes: Math.min(1, remaining) } : undefined;
    const waiting = mistakes.find((m) => !m.resolved && m.repair?.stage === "transfer" && m.repair.dueAt);
    const reason = count >= ADAPTIVE_MAX_QUESTION_ATTEMPTS ? DONE_REASON_CAPPED : waiting?.repair?.dueAt
      ? `Transfer is demonstrated. The repair stays open until an independent check after ${waiting.repair.dueAt.slice(0, 10)}.`
      : "No further fresh mapped check fits this session. Remaining skills stay unproven; more targeted content or a later check is needed.";
    return { steps: delayedStep ? [delayedStep] : [],
      done: scheduled || !delayed || remaining <= 0, stopped: true, reason };
  }

  const spent = completed.reduce((sum, record) => sum + Math.max(0, record.minutes), 0);
  const remaining = Math.max(0, plan.targetMinutes - spent);
  const executed = new Set(completed.map((record) => record.stepId));
  // Steps of the original ladder that have not run yet (original order).
  const tail = plan.steps.filter((step) => !executed.has(step.id));

  const questionRecords = completed.filter((record) => QUESTION_STEP_KINDS.has(record.kind));
  const retrievalRecords = completed.filter((record) => record.kind === "overdue-retrieval");
  const repairRecords = completed.filter((record) => record.kind === "misconception-repair");
  const prereqRecords = completed.filter((record) => record.kind === "prerequisite-repair");
  const explanations = completed.filter((record) => record.kind === "explanation");
  const supportedPassedIndependent = completed.some(
    (record) => record.kind === "supported-practice" && record.result === "passed-independent",
  );
  const independentPassedIndependent = completed.some(
    (record) => record.kind === "independent-application" && record.result === "passed-independent",
  );
  const transferPassedIndependent = completed.some(
    (record) => record.kind === "transfer" && record.result === "passed-independent",
  );
  const scheduled = completed.some((record) => record.kind === "delayed-retrieval" && record.result === "scheduled");
  const lastRetrieval = retrievalRecords.at(-1);
  const availableCardIds = new Set(
    cards
      .filter((card) => !card.suspended)
      .map((card) => card.id),
  );

  // Question pools: fresh = never attempted anywhere; retryable = missed here.
  const ordered = [...questions].sort(
    (a, b) => difficultyNumber(a) - difficultyNumber(b) || a.id.localeCompare(b.id),
  );
  const usedThisRun = new Set(
    completed
      .map((record) => record.itemId)
      .filter((id): id is Id => Boolean(id)),
  );
  const attemptedEver = new Set(attempts.map((attempt) => attempt.questionId));
  const fresh = ordered.filter((question) => !usedThisRun.has(question.id) && !attemptedEver.has(question.id));
  const missedIds = new Set(
    completed
      .filter((record) => record.result === "missed" || record.result === "gave-up")
      .map((record) => record.itemId)
      .filter((id): id is Id => Boolean(id)),
  );
  const retryPool = ordered.filter((question) => missedIds.has(question.id));

  const pickQuestion = (
    band: "supported" | "independent" | "transfer",
    prefer: "fresh" | "retry" | "any" = "fresh",
  ): Question | undefined => {
    if (prefer !== "retry") {
      const fromFresh = fresh.find((question) => inBand(question, band)) ?? (prefer === "any" ? fresh[0] : undefined);
      if (fromFresh) return fromFresh;
    }
    if (band === "transfer") return undefined;
    const fromRetry = retryPool.find((question) => inBand(question, band)) ?? (prefer === "any" ? retryPool[0] : undefined);
    return fromRetry;
  };

  const openMistakes = mistakes.filter((mistake) => !mistake.resolved);
  const resolvedIds = new Set(
    completed
      .map((record) => record.resolvedMistakeId)
      .filter((id): id is Id => Boolean(id)),
  );
  // Mistakes still open that this run has not already repaired (by retest).
  const openWithoutRepair = openMistakes.filter((mistake) => !resolvedIds.has(mistake.id));

  const steps: AdaptiveSessionStep[] = [];
  const priorState: InterventionAttemptContext["priorState"] =
    plan.evidence.focusState === "unknown" ? "unknown" :
      plan.evidence.focusState === "emerging" ? "weak" : plan.evidence.focusState;
  const defaultCapabilityId: Id = plan.evidence.focus;
  const defaultIntervention = (stepId: Id, kind: InterventionAttemptContext["kind"], activity: NonNullable<InterventionAttemptContext["activity"]>, plannedMinutes: number,
    support: InterventionAttemptContext["support"], capabilityId = defaultCapabilityId, chainId = `${plan.topicId}:${capabilityId}`, topicId = plan.topicId): InterventionAttemptContext => ({
      id: `${plan.topicId}:intervention:${stepId}`,
      chainId,
      kind,
      capabilityId,
      topicId,
      priorState,
      plannedMinutes,
      support,
      activity,
    });
  const pushStep = (kind: AdaptiveStepKind, seq: number, partial: Partial<AdaptiveSessionStep> = {}) => {
    const step = { ...baseStep(plan, kind, seq), ...partial, minutes: REBUILT_STEP_MINUTES[kind] };
    if (!step.intervention) {
      const activity = kind === "overdue-retrieval" || kind === "delayed-retrieval" ? "retrieval" : "teaching";
      const interventionKind = activity === "retrieval" ? "retention" : "guided";
      step.intervention = defaultIntervention(step.id, interventionKind, activity, step.minutes, activity === "teaching" ? "scaffold" : "none");
    }
    steps.push(step);
  };
  const pushQuestionStep = (
    kind: AdaptiveStepKind,
    seq: number,
    question: Question | undefined,
    opts: { support: "supported" | "independent"; hintBudget: number; mistakeId?: Id },
  ): boolean => {
    if (!question) return false;
    const partial: Partial<AdaptiveSessionStep> = {
      questionIds: [question.id],
      params: { support: opts.support, hintBudget: opts.hintBudget },
      href: practiceHref(plan.topicId, question.id, kind),
      intervention: defaultIntervention(
        `${kind}:${seq}:${question.id}`,
        kind === "transfer" ? "transfer" : kind === "prerequisite-repair" ? "diagnose" : opts.support === "supported" ? "guided" : "independent",
        "question",
        REBUILT_STEP_MINUTES[kind],
        opts.support === "supported" ? "scaffold" : "none",
        question.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId,
        opts.mistakeId ?? `${plan.topicId}:${question.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId}`,
      ),
    };
    if (kind === "misconception-repair" && opts.mistakeId) partial.mistakeIds = [opts.mistakeId];
    pushStep(kind, seq, partial);
    return true;
  };

  let reason = "";
  let stopped = false;

  // --- A. Retrieval: retry missed cards once; teach instead of retrying twice.
  if (lastRetrieval && lastRetrieval.result === "missed") {
    const fails = retrievalRecords.length;
    const stillMissed = (lastRetrieval.missedItemIds ?? []).filter((id) => availableCardIds.has(id));
    if (fails < ADAPTIVE_MAX_RETRIEVAL_FAILS && stillMissed.length) {
      // Failed recall → retrieval cue → immediate retry of exactly those cards.
      pushStep("overdue-retrieval", fails, {
        cardIds: stillMissed,
        label: "Retry the missed retrieval",
        description: "The cards you missed come back now, while the attempt is fresh.",
        href: `/review?topic=${encodeURIComponent(plan.topicId)}&limit=${stillMissed.length}&from=adaptive`,
      });
      reason =
        "A retrieval came back as a miss — the same cards are retried once while the attempt is fresh, before anything new.";
    } else if (fails >= ADAPTIVE_MAX_RETRIEVAL_FAILS && explanations.length === 0) {
      // Repeated recall failure: stop cycling the card, teach the gap first.
      pushStep("explanation", explanations.length + 1, {
        description: "Recall failed twice — read the short explanation, then apply it with support.",
        href: `/lesson?subject=${encodeURIComponent(plan.subjectId)}&topic=${encodeURIComponent(plan.topicId)}&from=adaptive`,
      });
      const supported = pickQuestion("supported", "any");
      if (supported) {
        pushQuestionStep("supported-practice", questionRecords.length + 1, supported, {
          support: "supported",
          hintBudget: 3,
        });
      }
      reason = "The same card failed twice — more retrieval would just cycle it. Teaching, then one supported attempt, replaces the retry.";
    }
  }

  // --- B. A fresh question miss with an open mistake ⇒ misconception repair.
  const lastQuestion = questionRecords.at(-1);
  const lastMissedOrGaveUp =
    lastQuestion && (lastQuestion.result === "missed" || lastQuestion.result === "gave-up");
  if (
    lastMissedOrGaveUp &&
    lastQuestion?.kind !== "misconception-repair" &&
    lastQuestion?.kind !== "prerequisite-repair" &&
    openWithoutRepair.length > 0 &&
    repairRecords.length < ADAPTIVE_MAX_REPAIR_ATTEMPTS &&
    !steps.some((step) => step.kind === "misconception-repair") &&
    !tail.some((step) => step.kind === "misconception-repair")
  ) {
    // Repair targets the mistake with a source question when one exists — the
    // retest is an independent re-answer, which is the only thing that can
    // resolve it. Otherwise it runs as a supported re-application that re-tests
    // the same idea in a new attempt; contrast copy still precedes it.
    const target = openWithoutRepair[0];
    const sourceQuestion = target?.questionId
      ? ordered.find((candidate) => candidate.id === target.questionId)
      : undefined;
    const question = sourceQuestion ?? pickQuestion("supported", "retry");
    const canResolve = Boolean(sourceQuestion);
    pushQuestionStep("misconception-repair", repairRecords.length + 1, question, {
      support: "independent",
      hintBudget: 0,
      ...(canResolve && target ? { mistakeId: target.id } : {}),
    });
    reason = "A dropped mark exposed a misconception — contrast it and re-earn the point independently before anything new.";
  }

  // --- C. Repeated failure on this topic ⇒ short prerequisite detour.
  const topicQuestionMisses = questionRecords.filter(
    (record) =>
      (record.kind === "supported-practice" ||
        record.kind === "independent-application" ||
        record.kind === "transfer") &&
      (record.result === "missed" || record.result === "gave-up"),
  ).length;
  if (
    topicQuestionMisses >= 2 &&
    prereq &&
    prereqRecords.length === 0 &&
    (prereqQuestions?.length ?? 0) > 0 &&
    !steps.some((step) => step.kind === "prerequisite-repair")
  ) {
    const prereqOrdered = [...(prereqQuestions ?? [])].sort(
      (a, b) => difficultyNumber(a) - difficultyNumber(b) || a.id.localeCompare(b.id),
    );
    const prereqQuestion =
      prereqOrdered.find((question) => inBand(question, "supported")) ?? prereqOrdered[0];
    if (prereqQuestion) {
      const prereqCapabilityId = prereqQuestion.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId;
      steps.push({
        ...baseStep(plan, "prerequisite-repair", prereqRecords.length + 1),
        topicId: prereq.prereqTopicId,
        label: `Fix ${prereq.prereqTopicTitle} first`,
        description:
          "This topic keeps breaking because an earlier skill is not secure. One short question on the foundation, then back here.",
        questionIds: [prereqQuestion.id],
        params: { support: "supported", hintBudget: 2 },
        href: practiceHref(prereq.prereqTopicId, prereqQuestion.id, "prerequisite-repair"),
        intervention: defaultIntervention(
          `prerequisite-repair:${prereqRecords.length + 1}:${prereqQuestion.id}`,
          "diagnose",
          "question",
          REBUILT_STEP_MINUTES["prerequisite-repair"],
          "scaffold",
          prereqCapabilityId,
          `${prereq.prereqTopicId}:${prereqCapabilityId}`,
          prereq.prereqTopicId,
        ),
      });
      reason = "Two misses on the same topic point upstream — a two-minute foundation check replaces another similar question here.";
    }
  }

  // --- D. Independent-application failure ⇒ raise support before transfer.
  const lastIndependent = [...completed]
    .reverse()
    .find((record) => record.kind === "independent-application");
  if (
    lastIndependent &&
    (lastIndependent.result === "missed" || lastIndependent.result === "gave-up") &&
    !independentPassedIndependent &&
    !steps.some((step) => step.kind === "supported-practice" || step.kind === "misconception-repair") &&
    !tail.some((step) => step.kind === "supported-practice")
  ) {
    // Increase support: a supported attempt (fresh or the missed question) then
    // the independent rung is owed again — assisted success is not enough.
    const supported = pickQuestion("supported", "any");
    if (supported) {
      pushQuestionStep("supported-practice", questionRecords.length + 2, supported, {
        support: "supported",
        hintBudget: 3,
      });
      const independent = pickQuestion("independent", "fresh");
      if (independent) {
        pushQuestionStep("independent-application", questionRecords.length + 3, independent, {
          support: "independent",
          hintBudget: 0,
        });
      }
      reason = "Independent application missed — support returns for one attempt, then the independent rung is owed again.";
    }
  }

  // --- E. Independent success removes unnecessary teaching/support.
  const explanationInTail = tail.findIndex((step) => step.kind === "explanation");
  if (
    explanationInTail >= 0 &&
    !explanations.length &&
    (supportedPassedIndependent || independentPassedIndependent) &&
    !steps.some((step) => step.kind === "explanation")
  ) {
    tail.splice(explanationInTail, 1);
    reason = reason || "Independent success already proves the gap is closed — the planned teaching step is skipped.";
  }

  // --- F. Keep the remaining original rungs, in order.
  steps.push(...tail);

  // --- G. Drop rungs whose evidence is already satisfied.
  const satisfiedTransfer = steps.findIndex((step) => step.kind === "transfer");
  if (transferPassedIndependent && satisfiedTransfer >= 0) {
    steps.splice(satisfiedTransfer, 1);
  }

  // --- H. Attempt cap: never drill the SAME topic more than MAX times. Repair
  // and the single prerequisite detour are bounded by their own rules, so they
  // survive the cap — the cap exists to stop same-topic rung loops.
  const TOPIC_RUNGS: ReadonlySet<AdaptiveStepKind> = new Set([
    "supported-practice",
    "independent-application",
    "transfer",
  ]);
  const executedTopicAttempts = questionRecords.filter((record) => TOPIC_RUNGS.has(record.kind)).length;
  const plannedTopicRungs = steps.filter((step) => TOPIC_RUNGS.has(step.kind)).length;
  if (executedTopicAttempts + plannedTopicRungs > ADAPTIVE_MAX_QUESTION_ATTEMPTS && executedTopicAttempts > 0) {
    const kept: AdaptiveSessionStep[] = [];
    for (const step of steps) {
      if (!TOPIC_RUNGS.has(step.kind)) kept.push(step);
    }
    steps.splice(0, steps.length, ...kept);
    stopped = true;
    reason = reason || DONE_REASON_CAPPED;
  }

  // --- I. Delayed retrieval is structural: always the final rung once.
  if (!scheduled && !steps.some((step) => step.kind === "delayed-retrieval")) {
    const delayedCardIds = (plan.steps.at(-1)?.cardIds ?? []).slice(0, 1);
    steps.push({
      ...baseStep(plan, "delayed-retrieval", scheduled ? 1 : 0),
      cardIds: delayedCardIds,
      label: "Schedule delayed retrieval",
      description: "Queue one short check for tomorrow so today's gain has to survive a delay.",
      href: `/review?topic=${encodeURIComponent(plan.topicId)}&limit=1&from=adaptive`,
    });
  }

  // --- J. Fit the remaining time budget. Delayed retrieval is structural:
  // it survives even when every budgeted minute is already spent.
  const trimmed: AdaptiveSessionStep[] = [];
  let allotted = 0;
  for (const step of steps) {
    const isDelayed = step.kind === "delayed-retrieval";
    if (isDelayed && scheduled) continue; // already done; nothing left
    if (!isDelayed && remaining <= 0) continue; // a rung cannot start with no time
    const stepMinutes = isDelayed ? Math.max(0, Math.min(1, remaining - allotted)) : step.minutes;
    if (!isDelayed && allotted + stepMinutes > remaining) continue;
    trimmed.push(step);
    allotted += stepMinutes;
  }
  // A structural final step that reports "schedule later" still closes the
  // loop even when every budgeted minute is gone.
  if (!scheduled) {
    const delayed = steps.find((step) => step.kind === "delayed-retrieval");
    if (delayed && !trimmed.some((step) => step.kind === "delayed-retrieval")) {
      trimmed.push(delayed.intervention ? delayed : {
        ...delayed,
        intervention: defaultIntervention(
          `${delayed.id}:schedule`,
          "retention",
          "retrieval",
          delayed.minutes,
          "none",
        ),
      });
    }
  }

  const evidenceSatisfied =
    independentPassedIndependent &&
    (transferPassedIndependent || !ordered.some((question) => inBand(question, "transfer")));
  const hasUndoneRungs = trimmed.some((step) => step.kind !== "delayed-retrieval");
  const done = trimmed.length === 0 || (!hasUndoneRungs && scheduled);

  if (!reason && trimmed.length) {
    const nextKind = trimmed[0].kind;
    reason =
      nextKind === "delayed-retrieval"
        ? "The evidence rungs are done — the only step left is to queue the delayed check."
        : nextKind === "explanation"
          ? "The next rung needs the short explanation first."
          : nextKind === "supported-practice"
            ? "The next attempt runs with support available — the minimum that gets you there."
            : nextKind === "independent-application"
              ? "Support has done its job — the next rung is answered alone."
              : nextKind === "transfer"
                ? "The idea held on familiar ground — now the same idea in a new context."
                : nextKind === "misconception-repair"
                  ? "Repair comes before new material: re-earn the dropped point first."
                  : "Keep the sequence moving — one clear action at a time.";
  }
  if (done && !reason) {
    reason = evidenceSatisfied ? DONE_REASON_EVIDENCE : scheduled ? DONE_REASON_BUDGET : DONE_REASON_CAPPED;
  }

  return { steps: trimmed, done, reason, stopped };
}

function learningActionStep(action: LearningAction, topicId: Id, subjectId: Id, seq: number): AdaptiveSessionStep {
  const questionTopicId = action.topicId ?? topicId;
  const kind: AdaptiveStepKind = action.kind === "guided" ? "misconception-repair" :
    action.kind === "transfer" ? "transfer" : "independent-application";
  const intervention: InterventionAttemptContext = {
    id: `${topicId}:intervention:${seq}:${action.question.id}`,
    ...(action.mistakeId ? { chainId: action.mistakeId } : { chainId: `${topicId}:${action.capabilityId}` }),
    kind: action.kind,
    capabilityId: action.capabilityId,
    topicId: questionTopicId,
    priorState: action.priorState,
    ...(action.priorAccuracy !== undefined ? { priorAccuracy: action.priorAccuracy } : {}),
    plannedMinutes: action.minutes,
    support: action.teaching ? "scaffold" : "none",
    activity: "question",
  };
  return {
    id: `${topicId}:skill:${seq}:${action.question.id}`, kind,
    label: action.kind === "diagnose" ? "Check the smallest gap" : action.kind === "retention" ? "Check what stayed with you" : STEP_LABELS[kind],
    description: action.reason, why: action.reason, minutes: action.minutes,
    topicId: questionTopicId, subjectId, questionIds: [action.question.id], cardIds: [],
    mistakeIds: action.mistakeId && action.kind !== "diagnose" ? [action.mistakeId] : [],
    capabilityId: action.capabilityId, teaching: action.teaching,
    intervention,
    href: practiceHref(questionTopicId, action.question.id, kind),
    params: { support: action.teaching ? "supported" : "independent", hintBudget: action.teaching ? 3 : 0 },
  };
}

// ---------------------------------------------------------------------------
// Run summary — the session debrief from the run's own evidence.
// ---------------------------------------------------------------------------

export interface AdaptiveRunSummary {
  /** What measurably improved, per rung. */
  improved: string[];
  /** What is still fragile or unproven. */
  fragile: string[];
  /** Mistakes repaired by an independent retest this run. */
  repaired: string[];
  /** What happens later (delayed checks). */
  later: string[];
  /** What Revise learned about the student's support needs. */
  learned: string[];
  /** The single best next action, from the run evidence. */
  bestNext: string;
  /** Marks earned across the run's question rungs (0/0 when none ran). */
  marks: { awarded: number; max: number };
}

const RUNG_LABELS: Partial<Record<AdaptiveStepKind, string>> = {
  "supported-practice": "Supported application",
  "independent-application": "Independent application",
  transfer: "Unfamiliar transfer",
  "misconception-repair": "Misconception repair",
  "prerequisite-repair": "Prerequisite repair",
};

/** The tutor-grade debrief for a finished run, straight from its records. */
export function summariseAdaptiveRun(input: {
  plan: AdaptiveSessionPlan;
  completed: AdaptiveStepRecord[];
  openMistakeIds: Id[];
}): AdaptiveRunSummary {
  const { plan, completed, openMistakeIds } = input;
  const questionRecords = completed.filter((record) => QUESTION_STEP_KINDS.has(record.kind));
  const questionPasses = questionRecords.filter((record) => record.result === "passed-independent");
  const assistedPasses = questionRecords.filter((record) => record.result === "passed-assisted");
  const questionMisses = questionRecords.filter(
    (record) => record.result === "missed" || record.result === "gave-up",
  );
  const repairEvidence = completed.filter((record) => record.resolvedMistakeId);
  const stillMissedRetrieval = completed
    .filter((record) => record.kind === "overdue-retrieval" && record.result === "missed")
    .flatMap((record) => record.missedItemIds ?? []);
  const scheduledLater = completed.filter(
    (record) => record.kind === "delayed-retrieval" && record.result === "scheduled",
  );

  const improved: string[] = [];
  const fragile: string[] = [];
  const repaired: string[] = [];
  const learned: string[] = [];
  const later: string[] = [];

  for (const pass of questionPasses) {
    const label = RUNG_LABELS[pass.kind] ?? "Application";
    if (pass.maxMarks > 0 && pass.awardedMarks === pass.maxMarks) {
      improved.push(`${label} of ${plan.topicTitle} demonstrated without support (full marks).`);
    } else {
      improved.push(`${label} on ${plan.topicTitle} passed without support.`);
    }
  }

  if (assistedPasses.length) {
    learned.push(
      `Some successes needed a cue or prompt — ${assistedPasses.length} assisted pass${assistedPasses.length === 1 ? "" : "es"} counted as weaker evidence than independent work.`,
    );
  }

  const fragileKinds = new Set<AdaptiveStepKind>();
  for (const miss of questionMisses) {
    fragileKinds.add(miss.kind);
  }
  const fragiles = [...fragileKinds]
    .map((kind) => RUNG_LABELS[kind] ?? kind)
    .filter((label): label is string => Boolean(label));
  if (fragiles.length) {
    fragile.push(`Still fragile: ${fragiles.join(" and ").toLowerCase()} missed a mark this session.`);
  }
  if (stillMissedRetrieval.length) {
    fragile.push(
      `${stillMissedRetrieval.length} retrieval${stillMissedRetrieval.length === 1 ? "" : "s"} did not hold — the topic's recall schedule needs another pass.`,
    );
  }
  if (openMistakeIds.length) {
    fragile.push(
      `${openMistakeIds.length} open mistake${openMistakeIds.length === 1 ? "" : "s"} remain${openMistakeIds.length === 1 ? "s" : ""} to repair across sessions.`,
    );
  }

  const repairedLines = repairEvidence.map((record) => {
    const label = RUNG_LABELS[record.kind] ?? "A retest";
    return `${label} re-earned its point independently — the mistake is closed.`;
  });
  if (repairedLines.length) {
    repaired.push(...repairedLines);
  }

  if (scheduledLater.length) {
    later.push("Delayed retrieval scheduled — the gain is only proven once it survives a delay.");
  } else {
    later.push("A delayed retrieval check is the next scheduled event for this topic.");
  }

  if (!improved.length && !repairedLines.length && !questionMisses.length) {
    improved.push("This session's work is recorded; no new marks were earned or lost.");
  }

  const marks = {
    awarded: questionRecords.reduce((sum, record) => sum + record.awardedMarks, 0),
    max: questionRecords.reduce((sum, record) => sum + record.maxMarks, 0),
  };

  let bestNext: string;
  if (openMistakeIds.length) {
    bestNext = "Clear the open mistakes first — each needs an independent retest before it closes.";
  } else if (fragiles.length) {
    bestNext = "Revisit the fragile rung with support in the next session before new material.";
  } else if (!scheduledLater.length) {
    bestNext = "Queue the delayed retrieval so today's gain is tested after a delay.";
  } else {
    bestNext = "Move to the next best topic — this one has earned a delay before more practice.";
  }

  return { improved, fragile, repaired: repairedLines, later, learned, bestNext, marks };
}
