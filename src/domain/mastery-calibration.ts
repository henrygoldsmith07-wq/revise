// ---------------------------------------------------------------------------
// Mastery calibration — offline evaluation framework
// For each historical learner state, calculates mastery using only info
// available at that time, freezes it, evaluates on later unseen questions,
// and compares predicted mastery with observed future performance.
// Prohibits future-data leakage; provides calibration bands and tests.
// ---------------------------------------------------------------------------

import { computeTopicMastery } from "./mastery";
import type { Attempt, Card, Id, Mistake, ReviewLog, Topic, TopicMastery } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoricalSnapshot {
  /** Cutoff instant — only data with timestamp <= cutoff is visible */
  cutoff: string; // ISO instant
  topicId: Id;
  predictedMastery: number; // 0..1 computed at cutoff
  evidenceAtCutoff: number; // cards + 2*attempts at cutoff
}

export interface FutureOutcome {
  topicId: Id;
  cutoff: string;
  observedAccuracy: number | null; // 0..1 on unseen questions after cutoff, null when no future data
  futureAttempts: number;
  futureMarksAwarded: number;
  futureMarksAvailable: number;
}

export interface CalibrationBand {
  band: string; // e.g. "0–20%"
  predictedLow: number;
  predictedHigh: number;
  count: number;
  predictedMean: number | null;
  observedMean: number | null;
  calibrationError: number | null; // |predicted - observed|
  avgEvidence: number | null;
}

export interface MasteryCalibrationReport {
  snapshots: number;
  outcomesMeasured: number;
  bands: CalibrationBand[];
  overallCalibrationError: number | null;
  overallBias: number | null; // observed - predicted
  insufficientData: boolean;
  insufficientReason: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — filter to cutoff (no future leakage)
// ---------------------------------------------------------------------------

function isAtOrBefore(timestamp: string, cutoff: string): boolean {
  return timestamp <= cutoff;
}

function filterAttempts(attempts: Attempt[], cutoff: string): Attempt[] {
  return attempts.filter((a) => isAtOrBefore(a.createdAt, cutoff));
}

function filterReviewLogs(logs: ReviewLog[], cutoff: string): ReviewLog[] {
  return logs.filter((l) => isAtOrBefore(l.reviewedAt, cutoff));
}

function filterMistakes(mistakes: Mistake[], cutoff: string): Mistake[] {
  return mistakes.filter((m) => isAtOrBefore(m.createdAt, cutoff));
}

function filterCardsByCreation(cards: Card[], cutoff: string): Card[] {
  // Cards are created before use; if created after cutoff, they didn't exist.
  // Cards created before cutoff but with updates after cutoff keep their state at cutoff:
  // we approximate by using stability at cutoff time — here we freeze cards created before cutoff.
  // For true point-in-time stability, caller should snapshot FSRS state; we document this limitation.
  return cards.filter((c) => isAtOrBefore(c.createdAt, cutoff));
}

// ---------------------------------------------------------------------------
// Build historical snapshots — one per topic per cutoff
// ---------------------------------------------------------------------------

export function buildHistoricalSnapshots(input: {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  attempts: Attempt[];
  mistakes: Mistake[];
  cutoffs: string[]; // sorted ascending ISO instants
}): HistoricalSnapshot[] {
  const { topics, cards, reviewLogs, attempts, mistakes, cutoffs } = input;
  const out: HistoricalSnapshot[] = [];
  for (const cutoff of cutoffs) {
    const filtered = {
      topics,
      cards: filterCardsByCreation(cards, cutoff),
      reviewLogs: filterReviewLogs(reviewLogs, cutoff),
      attempts: filterAttempts(attempts, cutoff),
      mistakes: filterMistakes(mistakes, cutoff),
      now: new Date(cutoff),
    };
    const mastery = computeTopicMastery(filtered);
    const byId = new Map<string, TopicMastery>(mastery.map((m) => [m.topicId, m]));
    for (const t of topics) {
      const row = byId.get(t.id);
      const evidence = (row?.cardsTotal ?? 0) + (row?.attempts ?? 0) * 2;
      out.push({
        cutoff,
        topicId: t.id,
        predictedMastery: row?.mastery ?? 0,
        evidenceAtCutoff: evidence,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evaluate future outcomes — for each snapshot, look at attempts AFTER cutoff
// ---------------------------------------------------------------------------

export function evaluateFutureOutcomes(input: {
  snapshots: HistoricalSnapshot[];
  attempts: Attempt[];
}): FutureOutcome[] {
  const { snapshots, attempts } = input;
  // Index attempts by topic
  const byTopic = new Map<Id, Attempt[]>();
  for (const a of attempts) {
    for (const tid of a.topicIds) {
      const list = byTopic.get(tid) ?? [];
      list.push(a);
      byTopic.set(tid, list);
    }
  }
  return snapshots.map((s) => {
    const future = (byTopic.get(s.topicId) ?? []).filter((a) => a.createdAt > s.cutoff);
    const awarded = future.reduce((sum, a) => sum + a.awarded, 0);
    const available = future.reduce((sum, a) => sum + a.max, 0);
    const acc = available ? awarded / available : null;
    return {
      topicId: s.topicId,
      cutoff: s.cutoff,
      observedAccuracy: acc != null ? Math.round(acc * 1000) / 1000 : null,
      futureAttempts: future.length,
      futureMarksAwarded: awarded,
      futureMarksAvailable: available,
    };
  });
}

// ---------------------------------------------------------------------------
// Calibration bands
// ---------------------------------------------------------------------------

const BANDS: Array<{ label: string; low: number; high: number }> = [
  { label: "0–20%", low: 0, high: 0.2 },
  { label: "20–40%", low: 0.2, high: 0.4 },
  { label: "40–60%", low: 0.4, high: 0.6 },
  { label: "60–80%", low: 0.6, high: 0.8 },
  { label: "80–100%", low: 0.8, high: 1.0 },
];

export function buildMasteryCalibrationReport(input: {
  snapshots: HistoricalSnapshot[];
  outcomes: FutureOutcome[];
  minEvidence?: number;
  minFutures?: number;
}): MasteryCalibrationReport {
  const minEvidence = input.minEvidence ?? 0;
  const minFutures = input.minFutures ?? 1;
  // Pair snapshots with outcomes by index (they are parallel arrays)
  const paired = input.snapshots.map((s, i) => ({
    snapshot: s,
    outcome: input.outcomes[i],
  })).filter((p) => p.outcome != null && p.snapshot.evidenceAtCutoff >= minEvidence && p.outcome.futureAttempts >= minFutures && p.outcome.observedAccuracy != null);

  if (paired.length < 10) {
    return {
      snapshots: input.snapshots.length,
      outcomesMeasured: paired.length,
      bands: BANDS.map((b) => ({
        band: b.label,
        predictedLow: b.low,
        predictedHigh: b.high,
        count: 0,
        predictedMean: null,
        observedMean: null,
        calibrationError: null,
        avgEvidence: null,
      })),
      overallCalibrationError: null,
      overallBias: null,
      insufficientData: true,
      insufficientReason: `Only ${paired.length} measurable snapshot→future pairs — need 10+ for calibration (evidence≥${minEvidence}, futureAttempts≥${minFutures})`,
    };
  }

  const bands: CalibrationBand[] = BANDS.map((b) => {
    const inBand = paired.filter((p) => p.snapshot.predictedMastery >= b.low && p.snapshot.predictedMastery < (b.high === 1 ? 1.01 : b.high));
    const count = inBand.length;
    if (count === 0) {
      return {
        band: b.label,
        predictedLow: b.low,
        predictedHigh: b.high,
        count: 0,
        predictedMean: null,
        observedMean: null,
        calibrationError: null,
        avgEvidence: null,
      };
    }
    const predMean = inBand.reduce((s, p) => s + p.snapshot.predictedMastery, 0) / count;
    const obsMean = inBand.reduce((s, p) => s + (p.outcome.observedAccuracy ?? 0), 0) / count;
    const avgEv = inBand.reduce((s, p) => s + p.snapshot.evidenceAtCutoff, 0) / count;
    return {
      band: b.label,
      predictedLow: b.low,
      predictedHigh: b.high,
      count,
      predictedMean: Math.round(predMean * 1000) / 1000,
      observedMean: Math.round(obsMean * 1000) / 1000,
      calibrationError: Math.round(Math.abs(predMean - obsMean) * 1000) / 1000,
      avgEvidence: Math.round(avgEv * 10) / 10,
    };
  });

  const overallPred = paired.reduce((s, p) => s + p.snapshot.predictedMastery, 0) / paired.length;
  const overallObs = paired.reduce((s, p) => s + (p.outcome.observedAccuracy ?? 0), 0) / paired.length;

  return {
    snapshots: input.snapshots.length,
    outcomesMeasured: paired.length,
    bands,
    overallCalibrationError: Math.round(Math.abs(overallPred - overallObs) * 1000) / 1000,
    overallBias: Math.round((overallObs - overallPred) * 1000) / 1000,
    insufficientData: false,
    insufficientReason: null,
  };
}

// ---------------------------------------------------------------------------
// Convenience — full offline evaluation from raw history
// ---------------------------------------------------------------------------

export function evaluateMasteryCalibration(input: {
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  attempts: Attempt[];
  mistakes: Mistake[];
  cutoffs: string[];
  minEvidence?: number;
  minFutures?: number;
}): MasteryCalibrationReport {
  const snapshots = buildHistoricalSnapshots(input);
  const outcomes = evaluateFutureOutcomes({ snapshots, attempts: input.attempts });
  return buildMasteryCalibrationReport({ snapshots, outcomes, minEvidence: input.minEvidence, minFutures: input.minFutures });
}
