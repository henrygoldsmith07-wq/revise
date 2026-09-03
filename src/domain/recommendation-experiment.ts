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
// ---------------------------------------------------------------------------
// Assessment records — the primary outcome is assessment GAIN per revision
// hour, not raw practice throughput. Baseline and final assessments must be
// separately recorded, immutable, and on comparable scales.
// ---------------------------------------------------------------------------

export interface BaselineAssessment {
  anonId: string;
  subjectId: Id;
  percent: number;
  maxMarks: number;
  takenAt: IsoInstant;
  /** Frozen assessment form/version for comparability across arms. */
  assessmentVersion: string;
}

export interface FinalAssessment {
  anonId: string;
  subjectId: Id;
  percent: number;
  maxMarks: number;
  takenAt: IsoInstant;
  assessmentVersion: string;
  /** Must reference the same version as baseline for valid gain calculation. */
  matchesBaselineVersion: boolean;
}

/**
 * Primary outcome per participant:
 *   (finalPercent − baselinePercent) / revisionHours
 * Only computed when BOTH assessments exist and are on the same scale.
 */
export interface ParticipantPrimaryOutcome {
  anonId: string;
  arm: ExperimentArm;
  baselinePercent: number;
  finalPercent: number;
  gainPercent: number;
  revisionHours: number;
  marksGainedPerHour: number | null;
  assessmentVersion: string;
}

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
  /** Per-participant primary outcomes (paired baseline→final only). */
  primaryOutcomes: ParticipantPrimaryOutcome[];
  /** ITT: everyone assigned. */
  enrolledN: number;
  /** Participants with ≥1 post-assignment attempt. */
  activatedN: number;
  /** Participants with valid paired baseline+final assessments. */
  primaryOutcomeEligibleN: number;
  /** Missing baseline count. */
  missingBaselineN: number;
  /** Missing final assessment count. */
  missingFinalN: number;
  withdrawnN: number;
  /** Primary endpoint effect (Revise − control) in marks gained/hour. */
  marksGainedPerHourEffect: number | null;
  /** Bootstrap CI for the primary comparison vs strongest simple baseline. */
  primaryComparison: {
    strongestBaselineId: string;
    effect: number;
    ci95Lower: number;
    ci95Upper: number;
    reviseN: number;
    baselineN: number;
  } | null;
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
  /** Immutable pre-study assessment per participant (required for primary outcome). */
  baselineAssessments: BaselineAssessment[];
  /** Post-study held-out assessment per participant (required for primary outcome). */
  finalAssessments: FinalAssessment[];
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
  for (const p of participants) {
    const myAttempts = attempts.filter((a) => a.anonId === p).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastAttempt = myAttempts.at(-1);
    if (!lastAttempt) neverActivated++;
    else if (new Date(lastAttempt.createdAt).getTime() < cutoff) inactive++;
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


export interface ParticipantPrimaryOutcome {
  anonId: string;
  arm: ExperimentArm;
  baselinePercent: number;
  finalPercent: number;
  gainPercent: number;
  revisionHours: number;
  marksGainedPerHour: number | null;
  assessmentVersion: string;
}

/**
 * Participant-level bootstrap CI for the difference in mean gain/hour.
 * Resamples PARTICIPANTS with replacement — never individual attempts.
 */
export function bootstrapDifferenceCI(
  armA: number[],
  armB: number[],
  opts?: { iterations?: number; seed?: number },
): { estimate: number; ci95Lower: number; ci95Upper: number; iterations: number } {
  const iterations = opts?.iterations ?? 2000;
  if (!armA.length || !armB.length) return { estimate: 0, ci95Lower: 0, ci95Upper: 0, iterations: 0 };
  const observed = armA.reduce((a, v) => a + v, 0) / armA.length - armB.reduce((a, v) => a + v, 0) / armB.length;
  const rng = (() => { let s = opts?.seed ?? 42; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const diffs: number[] = [];
  for (let iter = 0; iter < iterations; iter++) {
    const sa: number[] = []; const sb: number[] = [];
    for (let i = 0; i < armA.length; i++) sa.push(armA[Math.floor(rng() * armA.length)]);
    for (let i = 0; i < armB.length; i++) sb.push(armB[Math.floor(rng() * armB.length)]);
    diffs.push(sa.reduce((a, v) => a + v, 0) / sa.length - sb.reduce((a, v) => a + v, 0) / sb.length);
  }
  diffs.sort((x, y) => x - y);
  return {
    estimate: round(observed),
    ci95Lower: round(diffs[Math.floor(0.025 * iterations)]),
    ci95Upper: round(diffs[Math.floor(0.975 * iterations)]),
    iterations,
  };
}

export function analyseExperiment(input: AnalyseExperimentInput): ExperimentAnalysis {
  const now = input.now ?? new Date();
  const windows = new Map<string, { assignedAt: number; arm: ExperimentArm }>();
  for (const a of input.assignments) {
    const at = new Date(a.assignedAt).getTime();
    const existing = windows.get(a.anonId);
    if (!existing || at < existing.assignedAt) windows.set(a.anonId, { assignedAt: at, arm: a.arm });
  }
  const minP = input.minParticipantsPerArm ?? 5;

  const enrolledN = windows.size;
  const attempts = input.attempts;
  const arms = EXPERIMENT_ARMS.map((arm) =>
    armOutcome(arm, windows, input.events, input.attempts, input.reviews, input.masteryByTopic, undefined, now)
  );

  // Primary outcome: paired baseline-to-final assessment gain per hour.
  const primaryOutcomes: Array<{ anonId: string; arm: ExperimentArm; baselinePercent: number; finalPercent: number; gainPercent: number; revisionHours: number; marksGainedPerHour: number | null; assessmentVersion: string }> = [];
  let missingBaselineN = 0;
  let missingFinalN = 0;

  const baselinesByAnon = new Map<string, typeof input.baselineAssessments[number]>();
  for (const b of input.baselineAssessments) baselinesByAnon.set(b.anonId, b);

  for (const [anonId, w] of windows) {
    const baseline = baselinesByAnon.get(anonId);
    const final = input.finalAssessments.find((f) => f.anonId === anonId);
    if (!baseline) { missingBaselineN++; continue; }
    if (!final) { missingFinalN++; continue; }
    if (!final.matchesBaselineVersion) continue;

    const hours = input.attempts
      .filter((a) => a.anonId === anonId && new Date(a.createdAt).getTime() >= w.assignedAt)
      .reduce((acc, a) => acc + a.elapsedMs, 0) / MS_HOUR;
    if (hours < 0.25) continue;

    primaryOutcomes.push({
      anonId, arm: w.arm,
      baselinePercent: baseline.percent,
      finalPercent: final.percent,
      gainPercent: round(final.percent - baseline.percent),
      revisionHours: Math.round(hours * 100) / 100,
      marksGainedPerHour: round((final.percent - baseline.percent) / hours),
      assessmentVersion: final.assessmentVersion ?? "unknown",
    });
  }

  const revise = arms.find((a) => a.arm === "revise")!;
  const control = arms.find((a) => a.arm === "control")!;
  const bm = arms.find((a) => a.arm === "baseline-mastery")!;
  const bo = arms.find((a) => a.arm === "baseline-overdue")!;

  const allPopulated = Boolean(revise && control && bm && bo);
  const operationallyUsable = allPopulated && revise.participants >= minP && control.participants >= minP && bm.participants >= minP && bo.participants >= minP;
  const descriptiveResultsReady = operationallyUsable && revise.practiceMarksPerHour != null && control.practiceMarksPerHour != null;
  const primaryOutcomeReady = descriptiveResultsReady && primaryOutcomes.length >= minP * 2;
  const efficacyClaimReady = primaryOutcomeReady && EXPERIMENT_ARMS.every((arm) => primaryOutcomes.filter((o) => o.arm === arm).length >= minP);

  // Additional evidence gates: transfer and retention must be computed for all arms.
  const transferReady = operationallyUsable &&
    revise.unseenTransferScore != null && control.unseenTransferScore != null &&
    bm.unseenTransferScore != null && bo.unseenTransferScore != null;
  const retentionReady = operationallyUsable &&
    revise.delayedRetention != null && control.delayedRetention != null &&
    bm.delayedRetention != null && bo.delayedRetention != null;
  // Efficacy claim requires all three evidence types.
  const fullEfficacyReady = efficacyClaimReady && transferReady && retentionReady;

  const gates = { operationallyUsable, descriptiveResultsReady, primaryOutcomeReady: primaryOutcomeReady, efficacyClaimReady: fullEfficacyReady };
  const readiness = efficacyClaimReady ? "efficacy-claim-ready" : primaryOutcomeReady ? "primary-outcome-ready" : descriptiveResultsReady ? "descriptive-results-ready" : operationallyUsable ? "operationally-usable" : "enrolling";

  const revOuts = primaryOutcomes.filter((o) => o.arm === "revise");
  const ctlOuts = primaryOutcomes.filter((o) => o.arm === "control");
  const revMean = revOuts.length ? revOuts.reduce((a, o) => a + (o.marksGainedPerHour ?? 0), 0) / revOuts.length : null;
  const ctlMean = ctlOuts.length ? ctlOuts.reduce((a, o) => a + (o.marksGainedPerHour ?? 0), 0) / ctlOuts.length : null;
  // Primary endpoint: assessment marks gained per revision hour.
  const effect = fullEfficacyReady && revMean != null && ctlMean != null ? round(revMean - ctlMean) : null;

  // Strongest simple baseline comparison with bootstrap CI.
  let primaryComparison: ExperimentAnalysis["primaryComparison"] = null;
  if (fullEfficacyReady) {
    const revGains = primaryOutcomes.filter((o) => o.arm === "revise").map((o) => o.marksGainedPerHour ?? 0);
    let strongestId = "baseline-mastery";
    let strongestGain = -Infinity;
    for (const bid of ["baseline-mastery", "baseline-overdue"] as const) {
      const outs = primaryOutcomes.filter((o) => o.arm === bid);
      if (!outs.length) continue;
      const mean = outs.reduce((acc, o) => acc + (o.marksGainedPerHour ?? 0), 0) / outs.length;
      if (mean > strongestGain) { strongestGain = mean; strongestId = bid; }
    }
    const baseGains = primaryOutcomes.filter((o) => o.arm === strongestId).map((o) => o.marksGainedPerHour ?? 0);
    if (revGains.length >= minP && baseGains.length >= minP) {
      const ci = bootstrapDifferenceCI(revGains, baseGains, { iterations: 2000, seed: 42 });
      primaryComparison = {
        strongestBaselineId: strongestId,
        effect: ci.estimate,
        ci95Lower: ci.ci95Lower,
        ci95Upper: ci.ci95Upper,
        reviseN: revGains.length,
        baselineN: baseGains.length,
      };
    }
  }

  const note = !operationallyUsable
    ? `Study enrolling: ${enrolledN} participants assigned.`
    : !descriptiveResultsReady
      ? "Arms populated but revision hours/marks not yet reportable."
      : !primaryOutcomeReady
        ? `Only ${primaryOutcomes.length} paired baseline-final outcomes so far.`
        : !efficacyClaimReady
          ? `Primary outcomes computed but every arm needs at least ${minP} paired outcomes.`
          : `Revise gained ${effect! > 0 ? "+" : ""}${effect} assessment marks per revision hour versus self-directed revision (${revOuts.length} vs ${ctlOuts.length} paired participants). Prospective design.`;

  return { arms, primaryOutcomes, enrolledN, activatedN: [...windows.keys()].filter((anon: string) => attempts.some((a: { anonId: string }) => a.anonId === anon)).length, primaryOutcomeEligibleN: primaryOutcomes.length, missingBaselineN, missingFinalN, withdrawnN: 0,     marksGainedPerHourEffect: effect,
    primaryComparison,
    sufficientData: fullEfficacyReady, readiness, gates, note };
}
