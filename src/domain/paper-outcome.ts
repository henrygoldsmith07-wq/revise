// ---------------------------------------------------------------------------
// Paper-outcome feedback loop — the sat-paper half of prediction honesty.
//
// Before a recommended paper is sat, the simulation has already produced a
// prediction (previewPaper → simulatePaper, calibration-adjusted). After the
// paper is sat and marked, the actual awarded marks are known. This module is
// the bridge between those two moments:
//
//   1. buildPaperOutcomeRecord() freezes the prediction INTO the record at
//      sit time — recomputing the prediction afterwards would let the
//      student's later mastery silently rewrite history.
//   2. paperOutcomeGainMultiplier() folds the (predicted, actual) pairs into
//      a per-subject multiplier for the recommender's paper-recommendation
//      gain factor. Beating the prediction means there is more recoverable
//      headroom than the static mastery model sees, so papers rank higher;
//      consistently falling short means papers over-promise for this student
//      and their rank recedes until technique/repair work catches up.
//
// Honesty rules: pairs with no stored prediction are skipped (the loop only
// learns from papers the system actually predicted), the multiplier is
// clamped to [0.7, 1.25] so a lucky or disastrous paper can never dominate
// the ranking, and each newer pair counts more (exponential recency decay,
// half-life 4 papers) so a stale calibration from three topics ago does not
// outweigh yesterday's evidence. Fewer than MIN_PAIRS outcomes → neutral 1.0.
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import type { Id, IsoInstant } from "./types";

/** A sat paper with the prediction frozen at sit time. */
export interface PaperOutcomeRecord {
  id: Id;
  userId: Id;
  subjectId: Id;
  paperId: Id;
  paperRunId?: Id;
  /** Simulation's predicted marks for the whole paper, frozen before sitting. */
  predictedMarks: number;
  /** Total marks available on the paper. */
  totalMarks: number;
  /** Marks actually awarded once marking completed. */
  actualMarks: number;
  satAt: IsoInstant;
}

/** Fewer recorded outcomes than this → the loop stays neutral. */
export const MIN_PAPER_OUTCOMES = 2;

/** The multiplier never leaves this band, whatever the evidence says. */
export const GAIN_MULTIPLIER_MIN = 0.7;
export const GAIN_MULTIPLIER_MAX = 1.25;

/** Sensitivity: a 10-point over-performance drifts the multiplier up by ~×(1 + 0.1×0.6). */
export const GAIN_SENSITIVITY = 0.6;

/** Each older outcome counts EXPONENTIAL_DECAY× less than the one after it. */
export const EXPONENTIAL_DECAY = 0.85;

/** A subject's prediction drift — mean(actual − predicted) as a share of available marks. */
export interface SubjectPredictionDrift {
  subjectId: Id;
  outcomes: number;
  /** −1..1, positive = the student beats the prediction (under-predicted). */
  drift: number;
  /** Mean |actual − predicted| as a share of available marks (calibration error). */
  meanError: number;
}

/**
 * Freeze the prediction into an outcome record. Called at sit time with the
 * prediction the simulation produced BEFORE the paper was sat.
 */
export function buildPaperOutcomeRecord(input: {
  userId: Id;
  subjectId: Id;
  paperId: Id;
  paperRunId?: Id;
  predictedMarks: number;
  totalMarks: number;
  satAt: IsoInstant;
}): PaperOutcomeRecord {
  return {
    id: `po-${input.paperRunId ?? input.paperId}-${input.satAt}`,
    userId: input.userId,
    subjectId: input.subjectId,
    paperId: input.paperId,
    ...(input.paperRunId ? { paperRunId: input.paperRunId } : {}),
    predictedMarks: Math.max(0, input.predictedMarks),
    totalMarks: Math.max(1, input.totalMarks),
    actualMarks: 0, // filled in by closePaperOutcome once marking completes
    satAt: input.satAt,
  };
}

/**
 * Fill in the actual marks once marking completes. Returns the record ready
 * to persist; the original record is not mutated (pure).
 */
export function closePaperOutcome(
  record: PaperOutcomeRecord,
  actualMarks: number,
): PaperOutcomeRecord {
  return { ...record, actualMarks: Math.max(0, Math.min(record.totalMarks, actualMarks)) };
}

/** Per-subject prediction drift over the recorded outcomes (newest first). */
export function subjectPredictionDrift(
  outcomes: PaperOutcomeRecord[],
): Map<Id, SubjectPredictionDrift> {
  const bySubject = new Map<Id, PaperOutcomeRecord[]>();
  for (const o of outcomes) {
    if (o.actualMarks <= 0 && o.predictedMarks <= 0) continue;
    const list = bySubject.get(o.subjectId) ?? [];
    list.push(o);
    bySubject.set(o.subjectId, list);
  }
  const out = new Map<Id, SubjectPredictionDrift>();
  for (const [subjectId, list] of bySubject) {
    const sorted = [...list].sort((a, b) => b.satAt.localeCompare(a.satAt));
    let weightSum = 0;
    let driftSum = 0;
    let errorSum = 0;
    for (const [i, o] of sorted.entries()) {
      const weight = Math.pow(EXPONENTIAL_DECAY, i);
      const error = (o.actualMarks - o.predictedMarks) / o.totalMarks;
      weightSum += weight;
      driftSum += weight * error;
      errorSum += weight * Math.abs(error);
    }
    const drift = weightSum > 0 ? driftSum / weightSum : 0;
    const meanError = weightSum > 0 ? errorSum / weightSum : 0;
    out.set(subjectId, {
      subjectId,
      outcomes: sorted.length,
      drift: Math.round(drift * 1000) / 1000,
      meanError: Math.round(meanError * 1000) / 1000,
    });
  }
  return out;
}

/**
 * The recommender-facing gain multiplier for one subject's paper
 * recommendations. 1.0 when evidence is thin; >1 when the student keeps
 * beating the simulation (papers are worth MORE than the static model
 * thinks — sit more); <1 when papers keep over-promising.
 */
export function paperOutcomeGainMultiplier(
  outcomes: PaperOutcomeRecord[],
  subjectId: Id,
): number {
  const drift = subjectPredictionDrift(outcomes).get(subjectId);
  if (!drift || drift.outcomes < MIN_PAPER_OUTCOMES) return 1;
  const raw = 1 + drift.drift * GAIN_SENSITIVITY;
  return Math.round(Math.max(GAIN_MULTIPLIER_MIN, Math.min(GAIN_MULTIPLIER_MAX, raw)) * 1000) / 1000;
}

/**
 * Plain-language sentence for the UI: what the sat papers say about the
 * prediction. Null when the loop has not enough evidence to speak.
 */
export function paperOutcomeNarrative(
  outcomes: PaperOutcomeRecord[],
  subjectId: Id,
): string | null {
  const drift = subjectPredictionDrift(outcomes).get(subjectId);
  if (!drift || drift.outcomes < MIN_PAPER_OUTCOMES) return null;
  const pct = Math.round(Math.abs(drift.drift) * 100);
  if (Math.abs(drift.drift) < 0.03) {
    return `Your last ${drift.outcomes} papers landed within ${pct}% of the prediction — the model knows your level.`;
  }
  return drift.drift > 0
    ? `You've beaten the prediction by ~${pct}% across the last ${drift.outcomes} papers — you have more headroom than the model thinks.`
    : `Papers came in ~${pct}% below the prediction across the last ${drift.outcomes} runs — the gap is exam technique, not knowledge.`;
}
