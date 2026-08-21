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

  return {
    participants: studies.length,
    withBaselineAndDelayed: n,
    meanBaselineAccuracy: round(baselines.reduce((a, b) => a + b, 0) / baselines.length, 3),
    meanDelayedAccuracy: round(delayeds.reduce((a, b) => a + b, 0) / delayeds.length, 3),
    meanGain: round(gains.reduce((a, b) => a + b, 0) / gains.length, 3),
    medianGain: round(median(gains), 3),
    unseenShare,
    insufficientData: false,
    insufficientReason: null,
    outcomes,
  };
}
