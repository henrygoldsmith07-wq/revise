// ---------------------------------------------------------------------------
// Real learner outcome support — infrastructure for longitudinal studies:
// baseline → several weeks of Revise use → delayed unseen assessment →
// comparison with baseline. Supports anonymised analysis without PII.
// Does NOT claim learning improvement until real data exists.
// ---------------------------------------------------------------------------

import type { Id, IsoInstant } from "./types";

export type StudyPhase = "baseline" | "intervention" | "delayed-assessment" | "completed" | "withdrawn";

export interface AnonymisedLearner {
  /** Stable anonymous ID — never the userId. Hash or random. */
  anonId: string;
  subjectId: Id;
  cohortLabel?: string; // e.g. "2026-spring-gcse"
}

export interface LearnerAssessment {
  id: Id;
  anonId: string;
  subjectId: Id;
  awarded: number;
  max: number;
  accuracy: number;
  takenAt: IsoInstant;
  isUnseen: boolean; // true when questions were not previously attempted
  paperId?: Id;
  questionIds?: Id[];
}

export interface LongitudinalStudy {
  id: Id;
  subjectId: Id;
  baseline: LearnerAssessment | null;
  interventionStart: IsoInstant | null;
  interventionEnd: IsoInstant | null;
  delayedAssessment: LearnerAssessment | null;
  phase: StudyPhase;
  anonId: string;
  weeksOfUse: number | null;
  revisionMinutes: number | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface LongitudinalOutcome {
  anonId: string;
  subjectId: Id;
  baselineAccuracy: number | null;
  delayedAccuracy: number | null;
  gain: number | null; // delayed - baseline
  weeks: number | null;
  revisionMinutes: number | null;
  isUnseen: boolean;
}

export interface LongitudinalStudyReport {
  participants: number;
  withBaselineAndDelayed: number;
  meanBaselineAccuracy: number | null;
  meanDelayedAccuracy: number | null;
  meanGain: number | null;
  medianGain: number | null;
  /** Mean gain per hour of recorded revision time; null when minutes unrecorded. */
  improvementPerHour: number | null;
  /** Share of all participants who withdrew before the delayed assessment. */
  dropoutRate: number | null;
  /** Share of participants past baseline who reached "completed". */
  completionRate: number | null;
  unseenShare: number | null;
  insufficientData: boolean;
  insufficientReason: string | null;
  outcomes: LongitudinalOutcome[];
}

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function createStudy(input: { id: Id; subjectId: Id; anonId: string; now?: Date }): LongitudinalStudy {
  const at = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    subjectId: input.subjectId,
    anonId: input.anonId,
    baseline: null,
    interventionStart: null,
    interventionEnd: null,
    delayedAssessment: null,
    phase: "baseline",
    weeksOfUse: null,
    revisionMinutes: null,
    createdAt: at,
    updatedAt: at,
  };
}

export function recordBaseline(study: LongitudinalStudy, assessment: LearnerAssessment, now = new Date()): LongitudinalStudy {
  const at = now.toISOString();
  return { ...study, baseline: assessment, phase: "intervention", interventionStart: at, updatedAt: at };
}

export function recordDelayed(study: LongitudinalStudy, assessment: LearnerAssessment, revisionMinutes?: number, now = new Date()): LongitudinalStudy {
  const at = now.toISOString();
  const start = study.interventionStart ? new Date(study.interventionStart).getTime() : new Date(study.createdAt).getTime();
  const weeks = Math.round(((new Date(assessment.takenAt).getTime() - start) / (7 * 86_400_000)) * 10) / 10;
  return {
    ...study,
    delayedAssessment: assessment,
    phase: "completed",
    interventionEnd: assessment.takenAt,
    weeksOfUse: weeks,
    revisionMinutes: revisionMinutes ?? study.revisionMinutes,
    updatedAt: at,
  };
}

export function withdrawStudy(study: LongitudinalStudy, now = new Date()): LongitudinalStudy {
  const at = now.toISOString();
  return { ...study, phase: "withdrawn", interventionEnd: study.interventionEnd ?? at, updatedAt: at };
}

/**
 * Trial instrumentation for "were recommendations followed?". One event per
 * recommended slot: `performed` is the activity actually done (null when the
 * student studied something else / nothing). Pure — studies import their logs.
 */
export interface RecommendationFollowEvent {
  /** Activity id the engine recommended, e.g. "review-due" or "practice-topic". */
  recommended: string;
  /** What the student actually did next; null when nothing was recorded. */
  performed: string | null;
}

export interface RecommendationFollowRate {
  measured: number;
  followed: number;
  rate: number | null;
}

export function recommendationFollowRate(events: RecommendationFollowEvent[]): RecommendationFollowRate {
  const measurable = events.filter((e) => e.recommended);
  if (!measurable.length) return { measured: 0, followed: 0, rate: null };
  const followed = measurable.filter((e) => e.performed != null && e.performed === e.recommended).length;
  return { measured: measurable.length, followed, rate: round(followed / measurable.length, 3) };
}

function summarise(studies: LongitudinalStudy[], outcomes: LongitudinalOutcome[]): LongitudinalStudyReport {
  const complete = outcomes.filter((o) => o.baselineAccuracy != null && o.delayedAccuracy != null);
  const n = complete.length;

  if (n < 5) {
    return {
      participants: studies.length,
      withBaselineAndDelayed: n,
      meanBaselineAccuracy: null,
      meanDelayedAccuracy: null,
      meanGain: null,
      medianGain: null,
      improvementPerHour: null,
      dropoutRate: null,
      completionRate: null,
      unseenShare: null,
      insufficientData: true,
      insufficientReason: `Only ${n} participants with both baseline and delayed unseen assessment — need 5+ to report learning gain (currently ${studies.length} participants total). Do not claim improvement until real data exists.`,
      outcomes,
    };
  }

  const gains = complete.map((o) => o.gain!);
  const baselines = complete.map((o) => o.baselineAccuracy!);
  const delayeds = complete.map((o) => o.delayedAccuracy!);
  const unseenShare = round(complete.filter((o) => o.isUnseen).length / n, 3);

  // Gain per hour uses only participants that recorded revision time, so an
  // unrecorded denominator can never inflate the figure.
  const timed = complete.filter((o) => o.revisionMinutes != null && o.revisionMinutes > 0);
  let improvementPerHour: number | null = null;
  if (timed.length >= 5) {
    const totalHours = timed.reduce((a, o) => a + (o.revisionMinutes! / 60), 0);
    const totalGain = timed.reduce((a, o) => a + (o.gain ?? 0), 0);
    improvementPerHour = totalHours > 0 ? round(totalGain / totalHours, 4) : null;
  }

  const participants = studies.length;
  const withdrawn = studies.filter((s) => s.phase === "withdrawn").length;
  const pastBaseline = studies.filter((s) => s.phase !== "baseline").length;
  const completedCount = studies.filter((s) => s.phase === "completed").length;

  return {
    participants,
    withBaselineAndDelayed: n,
    meanBaselineAccuracy: round(baselines.reduce((a, b) => a + b, 0) / baselines.length, 3),
    meanDelayedAccuracy: round(delayeds.reduce((a, b) => a + b, 0) / delayeds.length, 3),
    meanGain: round(gains.reduce((a, b) => a + b, 0) / gains.length, 3),
    medianGain: round(median(gains), 3),
    improvementPerHour,
    dropoutRate: participants ? round(withdrawn / participants, 3) : null,
    completionRate: pastBaseline ? round(completedCount / pastBaseline, 3) : null,
    unseenShare,
    insufficientData: false,
    insufficientReason: null,
    outcomes,
  };
}

export function buildLongitudinalReport(studies: LongitudinalStudy[]): LongitudinalStudyReport {
  const outcomes: LongitudinalOutcome[] = studies.map((s) => {
    const baselineAccuracy = s.baseline ? s.baseline.awarded / Math.max(1, s.baseline.max) : null;
    const delayedAccuracy = s.delayedAssessment ? s.delayedAssessment.awarded / Math.max(1, s.delayedAssessment.max) : null;
    const gain = baselineAccuracy != null && delayedAccuracy != null ? delayedAccuracy - baselineAccuracy : null;
    return {
      anonId: s.anonId,
      subjectId: s.subjectId,
      baselineAccuracy: baselineAccuracy != null ? round(baselineAccuracy, 3) : null,
      delayedAccuracy: delayedAccuracy != null ? round(delayedAccuracy, 3) : null,
      gain: gain != null ? round(gain, 3) : null,
      weeks: s.weeksOfUse,
      revisionMinutes: s.revisionMinutes,
      isUnseen: s.delayedAssessment?.isUnseen ?? false,
    };
  });

  return summarise(studies, outcomes);
}
