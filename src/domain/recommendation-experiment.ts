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
  /** revise.marksPerHour − control.marksPerHour; null unless efficacyClaimReady. */
  marksPerHourEffect: number | null;
  /** Honest gate — no claims until every arm has real participants AND delayed unseen assessments. */
  sufficientData: boolean;
  readiness: ExperimentReadiness;
  gates: ExperimentReadinessGates;
  note: string;
}

/**
 * Four escalating readiness tiers. Each implies the ones before it.
 *   enrolling               assignments exist but no arm has enough data
 *   operationally-usable    every arm has ≥ minParticipants
 *   descriptive-results     per-arm descriptive stats are reportable (hours + marks)
 *   primary-outcome-ready   delayed retention and unseen transfer computed for all arms
 *   efficacy-claim-ready    primary outcome ready + final assessments exist for ≥ minParticipants in each arm
 */
export type ExperimentReadiness =
  | "enrolling"
  | "operationally-usable"
  | "descriptive-results-ready"
  | "primary-outcome-ready"
  | "efficacy-claim-ready";

export interface ExperimentReadinessGates {
  /** Every arm has at least one participant. */
  operationallyUsable: boolean;
  /** Descriptive per-arm stats are reportable (hours + marks). */
  descriptiveResultsReady: boolean;
  /** Delayed retention and unseen-transfer computed for all arms. */
  primaryOutcomeReady: boolean;
  /** Full preregistered evidence: all of the above plus final assessments. */
  efficacyClaimReady: boolean;
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
  // Only reviews AFTER the participant's assignment date contribute to the
  // experimental delayed-retention measurement — pre-experiment FSRS history
  // is baseline, not treatment effect.
  const myReviews = reviews.filter((r) => {
    const w = windows.get(r.anonId);
    return w?.arm === arm && new Date(r.reviewedAt).getTime() >= w.assignedAt;
  });

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

  // Transfer: per-participant exposure history — a question is only
  // "previously seen" if THIS participant attempted it before THEIR OWN
  // assignment date. Never use the cohort's earliest assignment date for an
  // individual exposure history.
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
  let neverActivated = 0;
  let inactive = 0;
  let studyDropout = 0;
  let completedStudy = 0;
  for (const anon of participants) {
    const latest = [...attempts].reverse().find((a) => a.anonId === anon)?.createdAt;
    if (!latest || new Date(latest).getTime() < cutoff) {
      if (!latest) neverActivated++;
      else inactive++;
    } else if (windows.get(anon)?.arm != null && new Date(latest).getTime() >= cutoff) {
      completedStudy++;
    } else {
      studyDropout++;
    }
  }
  const dropoutRate = participants.size
    ? Math.round(((neverActivated + studyDropout) / participants.size) * 1000) / 1000
    : null;

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
    dropoutRate,
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
  const revise = arms.find((a) => a.arm === "revise")!;
  const control = arms.find((a) => a.arm === "control")!;
  const baselineMastery = arms.find((a) => a.arm === "baseline-mastery");
  const baselineOverdue = arms.find((a) => a.arm === "baseline-overdue");

  // --- readiness gates -------------------------------------------------------
  const allArmsPopulated =
    revise != null && control != null && baselineMastery != null && baselineOverdue != null;

  const operationallyUsable =
    allArmsPopulated &&
    revise.participants >= minParticipants &&
    control.participants >= minParticipants &&
    baselineMastery.participants >= minParticipants &&
    baselineOverdue.participants >= minParticipants;

  const descriptiveResultsReady =
    operationallyUsable &&
    revise.marksPerHour != null &&
    control.marksPerHour != null &&
    baselineMastery.marksPerHour != null &&
    baselineOverdue.marksPerHour != null;

  const primaryOutcomeReady =
    descriptiveResultsReady &&
    revise.delayedRetention != null &&
    control.delayedRetention != null &&
    baselineMastery.delayedRetention != null &&
    baselineOverdue.delayedRetention != null &&
    revise.transferShare != null &&
    control.transferShare != null &&
    baselineMastery.transferShare != null &&
    baselineOverdue.transferShare != null;

  // Efficacy claim additionally requires final-assessment data for every arm
  // and a minimum follow-up period (at least 14 days since first assignment).
  const earliestAssignment = Math.min(
    ...input.assignments.map((a) => new Date(a.assignedAt).getTime()),
  );
  const followUpDays = (now.getTime() - earliestAssignment) / 86_400_000;
  const efficacyClaimReady =
    primaryOutcomeReady &&
    revise.finalPerformancePercent != null &&
    control.finalPerformancePercent != null &&
    baselineMastery.finalPerformancePercent != null &&
    baselineOverdue.finalPerformancePercent != null &&
    followUpDays >= 14;

  const gates: ExperimentReadinessGates = {
    operationallyUsable,
    descriptiveResultsReady,
    primaryOutcomeReady,
    efficacyClaimReady,
  };
  const readiness: ExperimentReadiness = efficacyClaimReady
    ? "efficacy-claim-ready"
    : primaryOutcomeReady
      ? "primary-outcome-ready"
      : descriptiveResultsReady
        ? "descriptive-results-ready"
        : operationallyUsable
          ? "operationally-usable"
          : "enrolling";

  const marksPerHourEffect =
    efficacyClaimReady && revise!.marksPerHour != null && control!.marksPerHour != null
      ? Math.round((revise!.marksPerHour! - control!.marksPerHour!) * 100) / 100
      : null;

  const note = !operationallyUsable
    ? "Prospective study is still enrolling — no arm has reached the minimum participant count yet."
    : !descriptiveResultsReady
      ? "Every arm has participants but not enough have logged revision time for descriptive statistics."
      : !primaryOutcomeReady
        ? "Descriptive results are available but delayed retention and unseen transfer have not been measured across all arms."
        : !efficacyClaimReady
          ? "Primary outcomes computed but final assessments or minimum follow-up duration not yet met."
          : `Revise ${marksPerHourEffect! > 0 ? "outperformed" : "underperformed"} self-directed revision by ${Math.abs(marksPerHourEffect!)} marks per hour across ${revise!.participants}/${control!.participants} participants. Prospective design; treat as directional until peer review.`;

  return {
    arms,
    marksPerHourEffect,
    sufficientData: efficacyClaimReady,
    readiness,
    gates,
    note,
  };
}
