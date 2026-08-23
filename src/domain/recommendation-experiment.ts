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
// preregistered metrics with an honest insufficiency gate: nothing here may
// claim improvement until real participants exist. This module is pure — no
// React, no IndexedDB, no fetch.
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


export interface PolicyTask {
  kind: "practice-topic" | "review-card";
  topicId: Id | null;
  cardId: Id | null;
  /** Why this baseline picked it — shown verbatim in the UI. */
  reason: string;
}

/** FNV-1a: stable across sessions so a participant keeps their arm. */
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

/**
 * Baseline policies. The `revise` arm passes through the production
 * recommendation; `control` surfaces nothing by design.
 */
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
    return {
      kind: "practice-topic",
      topicId: weakest.topicId,
      cardId: null,
      reason: "Your lowest-mastery topic right now.",
    };
  }
  const mostOverdue = [...input.dueCounts].sort((a, b) => b.due - a.due || a.oldestDue.localeCompare(b.oldestDue))[0];
  if (!mostOverdue || mostOverdue.due <= 0) return null;
  return {
    kind: "review-card",
    topicId: mostOverdue.topicId,
    cardId: null,
    reason: `${mostOverdue.due} overdue ${mostOverdue.due === 1 ? "card" : "cards"} — the most overdue FSRS queue.`,
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

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

interface ParticipantWindow {
  assignedAt: number;
  arm: ExperimentArm;
}

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
  marksPerHour: number | null;
  marksPerActivity: number | null;
  delayedRetention: number | null;
  transferShare: number | null;
  masteryCalibrationError: number | null;
  completionRate: number | null;
  rejectionRate: number | null;
  medianSecondsToBegin: number | null;
  dropoutRate: number | null;
  finalPerformancePercent: number | null;
  shownCount: number;
}

export interface ExperimentAnalysis {
  arms: ArmOutcome[];
  /** revise.marksPerHour − control.marksPerHour, only when both arms are usable. */
  marksPerHourEffect: number | null;
  /** Honest gate — mirrors learner-outcomes: no claims until real data exists. */
  sufficientData: boolean;
  note: string;
}

export interface AnalyseExperimentInput {
  assignments: ExperimentAssignment[];
  events: ExperimentEvent[];
  attempts: AttemptLike[];
  reviews: ReviewLike[];
  /** topicId -> current mastery estimate (0..1). */
  masteryByTopic: Map<Id, number>;
  /** Optional final mock/exam results: percent per participant. */
  finalPerformance?: Map<string, number>;
  now?: Date;
  /** Minimum participants per arm before any headline is allowed. */
  minParticipantsPerArm?: number;
}

const MS_HOUR = 3_600_000;
const DROPOUT_DAYS = 14;

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

  const mine = attempts.filter((a) => {
    const w = windows.get(a.anonId);
    return w?.arm === arm && new Date(a.createdAt).getTime() >= w.assignedAt;
  });
  const myEvents = events.filter((e) => windows.get(e.anonId)?.arm === arm);
  const myReviews = reviews.filter((r) => windows.get(r.anonId)?.arm === arm);

  const hours = mine.reduce((acc, a) => acc + a.elapsedMs, 0) / MS_HOUR;
  const marks = mine.reduce((acc, a) => acc + a.awarded, 0);
  const marksPerHour = hours >= 0.25 && mine.length ? marks / hours : null;

  // Delayed retention: reviews of a card at least 7 days after its previous review.
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

  // Transfer: post-assignment attempts on questions never attempted before any assignment.
  const assignedAtMin = Math.min(...[...windows.values()].map((w) => w.assignedAt), Number.POSITIVE_INFINITY);
  const seenBefore = new Set(attempts.filter((a) => new Date(a.createdAt).getTime() < assignedAtMin).map((a) => `${a.anonId}:${a.questionId}`));
  const unseenAttempts = mine.filter((a) => !seenBefore.has(`${a.anonId}:${a.questionId}`));

  // Calibration: |current mastery − observed accuracy| per topic with enough evidence.
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

  const cutoff = now.getTime() - DROPOUT_DAYS * 86_400_000;
  let dropped = 0;
  for (const anon of participants) {
    const latest = [...attempts].reverse().find((a) => a.anonId === anon)?.createdAt;
    if (!latest || new Date(latest).getTime() < cutoff) dropped++;
  }

  const finals = participants.size
    ? [...participants].map((anon) => finalPerformance?.get(anon)).filter((v): v is number => v != null)
    : [];

  const rate = (n: number, d: number): number | null => (d ? Math.round((n / d) * 1000) / 1000 : null);
  return {
    arm,
    participants: participants.size,
    hoursPractised: Math.round(hours * 100) / 100,
    marksEarned: marks,
    marksPerHour: marksPerHour != null ? Math.round(marksPerHour * 100) / 100 : null,
    marksPerActivity: rate(marks, mine.length),
    delayedRetention: delayedTotal >= 8 ? Math.round((retained / delayedTotal) * 1000) / 1000 : null,
    transferShare: rate(unseenAttempts.length, mine.length),
    masteryCalibrationError: calTopics ? Math.round((calSum / calTopics) * 1000) / 1000 : null,
    completionRate: rate(completed, shown),
    rejectionRate: rate(rejected, shown),
    medianSecondsToBegin: median(beginPairs),
    dropoutRate: participants.size ? rate(dropped, participants.size) : null,
    finalPerformancePercent: finals.length
      ? Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 10) / 10
      : null,
    shownCount: shown,
  };
}

export function analyseExperiment(input: AnalyseExperimentInput): ExperimentAnalysis {
  const now = input.now ?? new Date();
  const windows = new Map<string, ParticipantWindow>();
  for (const a of input.assignments) {
    const at = new Date(a.assignedAt).getTime();
    const existing = windows.get(a.anonId);
    if (!existing || at < existing.assignedAt) windows.set(a.anonId, { assignedAt: at, arm: a.arm });
  }
  const minParticipants = input.minParticipantsPerArm ?? 5;
  const arms = EXPERIMENT_ARMS.map((arm) =>
    armOutcome(arm, windows, input.events, input.attempts, input.reviews, input.masteryByTopic, input.finalPerformance, now),
  );
  const revise = arms.find((a) => a.arm === "revise");
  const control = arms.find((a) => a.arm === "control");
  const sufficient =
    Boolean(revise && control && revise.participants >= minParticipants && control.participants >= minParticipants &&
      revise.marksPerHour != null && control.marksPerHour != null);
  const marksPerHourEffect =
    sufficient && revise && control && revise.marksPerHour != null && control.marksPerHour != null
      ? Math.round((revise.marksPerHour - control.marksPerHour) * 100) / 100
      : null;
  return {
    arms,
    marksPerHourEffect,
    sufficientData: sufficient,
    note: sufficient
      ? `Revise produced ${marksPerHourEffect! > 0 ? "+" : ""}${marksPerHourEffect} practice marks per hour versus self-selected revision across ${revise!.participants}/${control!.participants} participants. Prospective, not randomised-blind; treat as directional until peer review.`
      : "Prospective study is enrolling. No efficacy claim may be made until every arm has real participants and delayed unseen assessments.",
  };
}
