// ---------------------------------------------------------------------------
// Exam outlook — "based on your current evidence, most likely to score X–Y".
//
// Pure derivation over the store's live predictions: predictions recompute
// whenever evidence lands (every marked answer, every paper), so the outlook
// below is always current — it *is* the update-after-every-assessment rule,
// not a snapshot that can go stale.
//
// The band reuses the same convention the weekly grade log persists:
//   low  = percent − (100 − confidence·100)/2
//   high = percent + (100 − confidence·100)/2
// so what Today shows and what the calibration record believes always agree.
// Confidence is low early (wide band) and tightens as marked answers and
// topic coverage accumulate.
//
// Honesty rule: a subject with zero marked answers has no measured signal, so
// it must never produce a number. The UI gates rows on MIN_OUTLOOK_ATTEMPTS.
// ---------------------------------------------------------------------------

import type { GradePrediction } from "./grades";
import type { Attempt, Id, IsoInstant } from "./types";

/** Marked answers needed before a subject may show a score band. */
export const MIN_OUTLOOK_ATTEMPTS = 3;

export interface PercentBand {
  low: number;
  high: number;
}

export function percentBand(prediction: GradePrediction): PercentBand {
  const half = (100 - prediction.confidence * 100) / 2;
  return {
    low: Math.max(0, Math.round(prediction.percent - half)),
    high: Math.min(100, Math.round(prediction.percent + half)),
  };
}

export interface ExamOutlookRow {
  subjectId: Id;
  /** Marked answers recorded for this subject. */
  attempts: number;
  percent: number;
  grade: string;
  low: number;
  high: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Real past-paper runs.
//
// The outlook band is a prediction; the graph's exam node should also carry
// what actually happened when whole papers were sat under the clock. Attempts
// recorded inside one sitting share a paperRunId and are collapsed into a
// single score (sum of awarded vs sum of max), so 30 question attempts from
// one morning become one "78%" — not 30 fragments pretending to be runs.
// Runs without a paperRunId (legacy sittings) collapse per day instead, the
// best available proxy for one sitting. Newest first, because the exam node
// answers "how did the most recent papers go?".
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

export interface PaperRunScore {
  /** Attempt provenance: the run id, or the date for legacy runs without one. */
  runKey: string;
  paperId?: Id;
  satAt: IsoInstant;
  /** Percent scored on the sitting (awarded ÷ max of its scorable attempts). */
  percent: number;
  awarded: number;
  max: number;
  /** Attempt count collapsed into this run. */
  questionCount: number;
}

/** Collapse paper-mode attempts into real sittings, newest first. */
export function paperRunScores(attempts: Attempt[]): PaperRunScore[] {
  const paperAttempts = attempts.filter((a) => a.mode === "paper" && a.max > 0);
  const byRun = new Map<string, Attempt[]>();
  for (const attempt of paperAttempts) {
    const key = attempt.paperRunId ?? attempt.createdAt.slice(0, 10);
    const list = byRun.get(key) ?? [];
    list.push(attempt);
    byRun.set(key, list);
  }
  const out: PaperRunScore[] = [];
  for (const [runKey, list] of byRun) {
    const awarded = list.reduce((a, x) => a + x.awarded, 0);
    const max = list.reduce((a, x) => a + x.max, 0);
    if (max <= 0) continue;
    const newest = list.reduce((a, x) => (x.createdAt > a ? x.createdAt : a), list[0]!.createdAt);
    out.push({
      runKey,
      ...(list[0]!.paperId ? { paperId: list[0]!.paperId } : {}),
      satAt: newest,
      percent: Math.round((awarded / max) * 100),
      awarded,
      max,
      questionCount: list.length,
    });
  }
  return out.sort((a, b) => b.satAt.localeCompare(a.satAt) || a.runKey.localeCompare(b.runKey));
}

/** One row per predicted subject, with measured evidence counted. */
export function outlookRows(predictions: GradePrediction[], attempts: Attempt[]): ExamOutlookRow[] {
  return predictions.map((prediction) => {
    const marked = attempts.filter((a) => a.subjectId === prediction.subjectId && a.max > 0).length;
    const band = percentBand(prediction);
    return {
      subjectId: prediction.subjectId,
      attempts: marked,
      percent: prediction.percent,
      grade: prediction.grade,
      low: band.low,
      high: band.high,
      confidence: prediction.confidence,
    };
  });
}