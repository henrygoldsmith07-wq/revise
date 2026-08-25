// ---------------------------------------------------------------------------
// The prospective recommendation experiment — the instrument behind Revise's
// central claim: "what should I revise next?" beats self-directed revision.
//
// Four arms:
//   control          student chooses freely (no recommendation surfaced)
//   baseline-mastery always the lowest-mastery topic
//   baseline-overdue always the most overdue FSRS content
//   revise           the production recommender's top pick
//
// Assignment is deterministic per anonymous participant, events accumulate in
// local-first meta storage, and analyseExperiment() turns them into the ten
// preregistered metrics with a four-tier readiness gate. This module is pure.
//
// Measurement integrity:
//   practiceMarksPerHour  = raw throughput during revision (NOT learning gain)
//   unseenExposureShare   = fraction of attempts on unseen questions (exposure)
//   unseenTransferScore   = accuracy on unseen attempts (transfer performance)
//   marksPerHourEffect    = only surfaced when ALL arms have data AND delayed
//                           retention + unseen transfer + final assessments exist
// ---------------------------------------------------------------------------

import type { Id, IsoDate, IsoInstant } from "./types";

export const EXPERIMENT_ARMS = ["revise", "baseline-mastery", "baseline-overdue", "control"] as const;
export type ExperimentArm = (typeof EXPERIMENT_ARMS)[number];

export interface ExperimentAssignment {
  anonId: string;
  arm: ExperimentArm;
  assignedAt: IsoInstant;
  version: 1;
}

export type ExperimentEventType = "shown" | "started" | "completed" | "rejected";

export interface ExperimentEvent {
  anonId: string;
  taskId: string;
  activity: string;
  topicId: Id | null;
  type: ExperimentEventType;
  at: IsoInstant;
}


function hashAnon(anonId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < anonId.length; i++) {
    hash ^= anonId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assignArm(anonId: string, now = new Date()): ExperimentAssignment {
  const arm = EXPERIMENT_ARMS[hashAnon(`revise-exp-v1:${anonId}`) % EXPERIMENT_ARMS.length];
  return { anonId, arm, assignedAt: now.toISOString(), version: 1 };
}

export interface PolicyTask { kind: "practice-topic" | "review-card"; topicId: Id | null; cardId: Id | null; reason: string }

export function policyTaskFor(
  arm: ExperimentArm,
  input: {
    mastery: Array<{ topicId: Id; mastery: number; lastStudiedAt: string | null }>;
    dueCounts: Array<{ topicId: Id; due: number; oldestDue: IsoDate }>;
  },
): PolicyTask | null {
  if (arm === "control") return null;
  if (arm === "baseline-mastery") {
    const weakest = [...input.mastery]
      .sort((a, b) => a.mastery - b.mastery || String(a.lastStudiedAt ?? "").localeCompare(String(b.lastStudiedAt ?? "")))[0];
    if (!weakest) return null;
    return { kind: "practice-topic", topicId: weakest.topicId, cardId: null, reason: "Your lowest-mastery topic right now." };
  }
  const mostOverdue = [...input.dueCounts].sort((a, b) => b.due - a.due || a.oldestDue.localeCompare(b.oldestDue))[0];
  if (!mostOverdue || mostOverdue.due <= 0) return null;
  return { kind: "review-card", topicId: mostOverdue.topicId, cardId: null, reason: `${mostOverdue.due} overdue ${mostOverdue.due === 1 ? "card" : "cards"} — the most overdue FSRS queue.` };
}


export interface AttemptLike {
  anonId: string;
  topicIds: Id[];
  questionId: Id;
  awarded: number;
  max: number;
  elapsedMs: number;
  createdAt: IsoInstant;
}

export interface ReviewLike {
  anonId: string;
  cardId: Id;
  reviewedAt: IsoInstant;
  grade: string;
}

interface ParticipantWindow { assignedAt: number; arm: ExperimentArm }

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

export interface ArmOutcome {
  arm: ExperimentArm;
  participants: number;
  hoursPractised: number;
  marksEarned: number;
  /** Raw practice throughput — NOT learning gain. */
  practiceMarksPerHour: number | null;
  marksPerActivity: number | null;
  delayedRetention: number | null;
  /** Share of post-assignment attempts on previously unseen questions (exposure composition). */
  unseenExposureShare: number | null;
  /** Accuracy on unseen post-assignment attempts (transfer performance proxy). */
  unseenTransferScore: number | null;
  masteryCalibrationError: number | null;
  completionRate: number | null;
  rejectionRate: number | null;
  medianSecondsToBegin: number | null;
  dropoutRate: number | null;
  finalPerformancePercent: number | null;
  shownCount: number;
}

/** Four escalating readiness tiers. Each implies the ones before it. */
export type ExperimentReadiness =
  | "enrolling"
  | "operationally-usable"
  | "descriptive-results-ready"
  | "primary-outcome-ready"
  | "efficacy-claim-ready";

export interface ExperimentReadinessGates {
  operationallyUsable: boolean;
  descriptiveResultsReady: boolean;
  primaryOutcomeReady: boolean;
  efficacyClaimReady: boolean;
}

export interface ExperimentAnalysis {
  arms: ArmOutcome[];
  /** revise.practiceMarksPerHour − control.practiceMarksPerHour; null unless efficacyClaimReady. */
  marksPerHourEffect: number | null;
  sufficientData: boolean;
  readiness: ExperimentReadiness;
  gates: ExperimentReadinessGates;
  note: string;
}

export interface AnalyseExperimentInput {
  assignments: ExperimentAssignment[];
  events: ExperimentEvent[];
  attempts: AttemptLike[];
  reviews: ReviewLike[];
  masteryByTopic: Map<Id, number>;
  finalPerformance?: Map<string, number>;
  now?: Date;
  minParticipantsPerArm?: number;
}

const MS_HOUR = 3_600_000;
const DROPOUT_DAYS = 14;

function round(n: number): number { return Math.round(n * 1000) / 1000; }
function rate(n: number, d: number): number | null { return d ? round(n / d) : null; }

function armOutcome(
  arm: ExperimentArm,
  windows: Map<string, ParticipantWindow>,
  events: ExperimentEvent[],
  attempts: AttemptLike[],
  reviews: ReviewLike[],
  masteryByTopic: Map<Id, number>,
  finalPerformance: Map<string, number> | undefined,
  now: Date,
): ArmOutcome {
  const participants = new Set<string>();
  for (const [anon, w] of windows) if (w.arm === arm) participants.add(anon);

  // Post-assignment attempts for this arm only.
  const mine = attempts.filter((a) => {
    const w = windows.get(a.anonId);
    return w?.arm === arm && new Date(a.createdAt).getTime() >= w.assignedAt;
  });
  const myEvents = events.filter((e) => windows.get(e.anonId)?.arm === arm);
  // Only reviews AFTER assignment — pre-experiment FSRS history is baseline.
  const myReviews = reviews.filter((r) => {
    const w = windows.get(r.anonId);
    return w?.arm === arm && new Date(r.reviewedAt).getTime() >= w.assignedAt;
  });

  const hours = mine.reduce((acc, a) => acc + a.elapsedMs, 0) / MS_HOUR;
  const marks = mine.reduce((acc, a) => acc + a.awarded, 0);
  const practiceMarksPerHour = hours >= 0.25 && mine.length ? marks / hours : null;

  // Delayed retention from post-assignment reviews ≥7 days apart.
  const lastSeen = new Map<string, number>();
  let retained = 0;
  let delayedTotal = 0;
  for (const r of [...myReviews].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
    const key = `${r.anonId}:${r.cardId}`;
    const prev = lastSeen.get(key);
    const t = new Date(r.reviewedAt).getTime();
    if (prev != null && t - prev >= 7 * 86_400_000) {
      delayedTotal++;
      if (r.grade !== "again") retained++;
    }
    lastSeen.set(key, t);
  }

  // Per-participant unseen exposure: a question is unseen if THIS participant never attempted it before THEIR assignment.
  const seenByParticipant = new Map<string, Set<Id>>();
  for (const a of attempts) {
    const w = windows.get(a.anonId);
    if (!w || new Date(a.createdAt).getTime() >= w.assignedAt) continue;
    const set = seenByParticipant.get(a.anonId) ?? new Set<Id>();
    set.add(a.questionId);
    seenByParticipant.set(a.anonId, set);
  }
  const unseenAttempts = mine.filter((a) => {
    const prior = seenByParticipant.get(a.anonId);
    return !prior || !prior.has(a.questionId);
  });

  // Unseen transfer score: accuracy on the unseen subset.
  const unseenScored = unseenAttempts.filter((a) => a.max > 0);
  const unseenScore = unseenScored.length
    ? round(unseenScored.reduce((acc, a) => acc + a.awarded, 0) / unseenScored.reduce((acc, a) => acc + a.max, 0))
    : null;

  // Calibration.
  const byTopic = new Map<Id, { earned: number; possible: number }>();
  for (const a of mine) {
    const key = a.topicIds[0];
    if (!key) continue;
    const row = byTopic.get(key) ?? { earned: 0, possible: 0 };
    row.earned += a.awarded;
    row.possible += a.max;
    byTopic.set(key, row);
  }
  let calSum = 0;
  let calTopics = 0;
  for (const [topicId, row] of byTopic) {
    if (row.possible < 6) continue;
    const predicted = masteryByTopic.get(topicId);
    if (predicted == null) continue;
    calSum += Math.abs(predicted - row.earned / row.possible);
    calTopics++;
  }

  const shown = myEvents.filter((e) => e.type === "shown").length;
  const completed = myEvents.filter((e) => e.type === "completed").length;
  const rejected = myEvents.filter((e) => e.type === "rejected").length;

  const beginPairs: number[] = [];
  const shownAt = new Map<string, number>();
  for (const e of myEvents) {
    if (e.type === "shown") shownAt.set(e.taskId, new Date(e.at).getTime());
    if (e.type === "started") {
      const s = shownAt.get(e.taskId);
      if (s != null) beginPairs.push(Math.max(0, (new Date(e.at).getTime() - s) / 1000));
    }
  }

  // Dropout: sort by timestamp before finding latest — input may not be chronological.
  const cutoff = now.getTime() - DROPOUT_DAYS * 86_400_000;
  let neverActivated = 0;
  let inactive = 0;
  let completedStudy = 0;
  for (const p of participants) {
    const myAttempts = attempts.filter((a) => a.anonId === p).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastAttempt = myAttempts.at(-1);
    if (!lastAttempt) neverActivated++;
    else if (new Date(lastAttempt.createdAt).getTime() < cutoff) inactive++;
    else completedStudy++;
  }
  const dropoutRate = participants.size ? round((neverActivated + inactive) / participants.size) : null;

  const finals = participants.size
    ? [...participants].map((anon) => finalPerformance?.get(anon)).filter((v): v is number => v != null)
    : [];

  return {
    arm,
    participants: participants.size,
    hoursPractised: Math.round(hours * 100) / 100,
    marksEarned: marks,
    practiceMarksPerHour: practiceMarksPerHour != null ? round(practiceMarksPerHour) : null,
    marksPerActivity: rate(marks, mine.length),
    delayedRetention: delayedTotal >= 8 ? round(retained / delayedTotal) : null,
    unseenExposureShare: rate(unseenAttempts.length, mine.length),
    unseenTransferScore: unseenScore,
    masteryCalibrationError: calTopics ? round(calSum / calTopics) : null,
    completionRate: rate(completed, shown),
    rejectionRate: rate(rejected, shown),
    medianSecondsToBegin: median(beginPairs),
    dropoutRate,
    finalPerformancePercent: finals.length ? round(finals.reduce((a, b) => a + b, 0) / finals.length) : null,
    shownCount: shown,
  };
}

/**
 * Four escalating readiness tiers, each implying the ones before it.
 * Efficacy claim requires: all four arms populated, delayed retention and
 * unseen transfer computed for every arm, final assessments recorded for
 * every arm, and minimum follow-up duration elapsed since first enrolment.
 */
export function analyseExperiment(input: AnalyseExperimentInput): ExperimentAnalysis {
  const now = input.now ?? new Date();
  const windows = new Map<string, ParticipantWindow>();
  for (const a of input.assignments) {
    const at = new Date(a.assignedAt).getTime();
    const existing = windows.get(a.anonId);
    if (!existing || at < existing.assignedAt) windows.set(a.anonId, { assignedAt: at, arm: a.arm });
  }
  const minP = input.minParticipantsPerArm ?? 5;
  const arms = EXPERIMENT_ARMS.map((arm) =>
    armOutcome(arm, windows, input.events, input.attempts, input.reviews, input.masteryByTopic, input.finalPerformance, now),
  );
  const revise = arms.find((a) => a.arm === "revise")!;
  const control = arms.find((a) => a.arm === "control")!;
  const bm = arms.find((a) => a.arm === "baseline-mastery")!;
  const bo = arms.find((a) => a.arm === "baseline-overdue")!;

  const allPopulated = Boolean(revise && control && bm && bo);

  const operationallyUsable =
    allPopulated &&
    revise.participants >= minP &&
    control.participants >= minP &&
    bm.participants >= minP &&
    bo.participants >= minP;

  const descriptiveReady =
    operationallyUsable &&
    revise.practiceMarksPerHour != null &&
    control.practiceMarksPerHour != null &&
    bm.practiceMarksPerHour != null &&
    bo.practiceMarksPerHour != null;

  const primaryReady =
    descriptiveReady &&
    revise.delayedRetention != null &&
    control.delayedRetention != null &&
    bm.delayedRetention != null &&
    bo.delayedRetention != null &&
    revise.unseenExposureShare != null &&
    control.unseenExposureShare != null;

  // Efficacy additionally requires final assessments for all four arms
  // and minimum follow-up since the earliest assignment.
  const earliestMs = input.assignments.length
    ? Math.min(...input.assignments.map((a) => new Date(a.assignedAt).getTime()))
    : Infinity;
  const followUpDays = (now.getTime() - earliestMs) / 86_400_000;
  const efficacyClaimReady =
    primaryReady &&
    revise.finalPerformancePercent != null &&
    control.finalPerformancePercent != null &&
    bm.finalPerformancePercent != null &&
    bo.finalPerformancePercent != null &&
    followUpDays >= 14;

  const gates: ExperimentReadinessGates = {
    operationallyUsable,
    descriptiveResultsReady: descriptiveReady,
    primaryOutcomeReady: primaryReady,
    efficacyClaimReady,
  };
  const readiness: ExperimentReadiness = efficacyClaimReady
    ? "efficacy-claim-ready"
    : primaryReady
      ? "primary-outcome-ready"
      : descriptiveReady
        ? "descriptive-results-ready"
        : operationallyUsable
          ? "operationally-usable"
          : "enrolling";

  const marksPerHourEffect =
    efficacyClaimReady && revise.practiceMarksPerHour != null && control.practiceMarksPerHour != null
      ? round(revise.practiceMarksPerHour - control.practiceMarksPerHour)
      : null;

  const note = !operationallyUsable
    ? "Study is enrolling — no arm has reached the minimum participant count."
    : !descriptiveReady
      ? "Arms are populated but revision hours/marks are not yet reportable across all arms."
      : !primaryReady
        ? "Descriptive results available but delayed retention or unseen transfer is incomplete in one or more arms."
        : !efficacyClaimReady
          ? "Primary outcomes computed but final assessments or minimum follow-up duration not yet met across all arms."
          : `Revise ${marksPerHourEffect! > 0 ? "outperformed" : "underperformed"} self-directed revision by ${Math.abs(marksPerHourEffect!)} practice marks per hour across ${revise.participants} vs ${control.participants} participants. Prospective design.`;

  return {
    arms,
    marksPerHourEffect,
    sufficientData: efficacyClaimReady,
    readiness,
    gates,
    note,
  };
}
