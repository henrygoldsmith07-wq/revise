import type { Attempt, InterventionActivity, InterventionAttemptContext, InterventionKind, InterventionObservationResult, InterventionOutcomeRecord, InterventionPriorState, IsoInstant } from "./types";

export const INTERVENTION_PRIORS: Record<InterventionKind, number> = {
  diagnose: 0.35,
  guided: 0.45,
  independent: 0.6,
  transfer: 0.7,
  retention: 0.8,
};

const STATE_BASELINE: Record<InterventionPriorState, number> = {
  unknown: 0.35,
  weak: 0.25,
  developing: 0.6,
  secure: 0.82,
};

export interface InterventionCalibration {
  key: string;
  kind: InterventionKind;
  capabilityId?: string;
  sampleSize: number;
  reliable: boolean;
  durableGainPerMinute: number;
  confidence: number;
  /** Mean delayed score, useful for audits without confusing it with gain. */
  delayedScore: number;
}

export function interventionKey(kind: InterventionKind, capabilityId?: string): string {
  return capabilityId ? `${kind}:${capabilityId}` : kind;
}

function validScore(row: { awarded: number; max: number }): number | null {
  if (!Number.isFinite(row.awarded) || !Number.isFinite(row.max) || row.max <= 0 || row.awarded < 0 || row.awarded > row.max) return null;
  return row.awarded / row.max;
}

/** Only a complete, independent delayed chain is durable evidence. */
export function durableOutcomeScore(outcome: InterventionOutcomeRecord): number | null {
  const immediate = validScore(outcome.immediate);
  const transfer = outcome.transfer && validScore(outcome.transfer);
  const delayed = outcome.delayedRetention && validScore(outcome.delayedRetention);
  if (immediate == null || transfer == null || delayed == null || !outcome.transfer?.independent || !outcome.delayedRetention?.independent) return null;
  // Delayed performance is the strongest signal; immediate success is useful
  // only as a guard against an intervention that never produced a foothold.
  if (immediate < 0.5) return null;
  return Math.max(0, Math.min(1, immediate * 0.2 + transfer * 0.35 + delayed * 0.45));
}

export function calibratedGain(outcome: InterventionOutcomeRecord): number | null {
  const score = durableOutcomeScore(outcome);
  if (score == null || !Number.isFinite(outcome.actualMinutes) || outcome.actualMinutes <= 0) return null;
  const baseline = STATE_BASELINE[outcome.priorState] ?? STATE_BASELINE.unknown;
  return Math.max(0, score - baseline) / outcome.actualMinutes;
}

/**
 * Estimate durable marks-per-minute from observed intervention chains. A
 * small empirical sample is shrunk toward the policy prior; it is only marked
 * reliable after three complete transfer + delayed-retention observations.
 */
export function calibrateInterventions(
  outcomes: readonly InterventionOutcomeRecord[],
  options: { minimumSample?: number; priorWeight?: number } = {},
): Map<string, InterventionCalibration> {
  const minimumSample = Math.max(1, options.minimumSample ?? 3);
  const priorWeight = Math.max(0, options.priorWeight ?? 3);
  const groups = new Map<string, InterventionOutcomeRecord[]>();
  for (const outcome of outcomes) {
    if (durableOutcomeScore(outcome) == null) continue;
    const key = interventionKey(outcome.kind, outcome.capabilityId);
    const list = groups.get(key) ?? [];
    list.push(outcome);
    groups.set(key, list);
    // A capability-specific sample also informs the intervention family when
    // a capability has not yet accumulated enough evidence on its own.
    const family = interventionKey(outcome.kind);
    if (family !== key) {
      const familyList = groups.get(family) ?? [];
      familyList.push(outcome);
      groups.set(family, familyList);
    }
  }
  const result = new Map<string, InterventionCalibration>();
  for (const [key, rows] of groups) {
    const first = rows[0]!;
    const gains = rows.map(calibratedGain).filter((value): value is number => value != null);
    const delayedScores = rows.map((row) => row.delayedRetention ? validScore(row.delayedRetention) : null).filter((value): value is number => value != null);
    const prior = INTERVENTION_PRIORS[first.kind] ?? 0.5;
    const empirical = gains.length ? gains.reduce((sum, value) => sum + value, 0) / gains.length : prior;
    // Priors are expressed in the same gain/minute units as the empirical
    // value using a conservative one-minute reference.
    const estimate = (empirical * gains.length + prior * priorWeight) / (gains.length + priorWeight);
    const variance = gains.length > 1
      ? gains.reduce((sum, value) => sum + (value - empirical) ** 2, 0) / gains.length
      : 1;
    const reliability = gains.length >= minimumSample;
    result.set(key, {
      key,
      kind: first.kind,
      ...(key.includes(":") ? { capabilityId: first.capabilityId } : {}),
      sampleSize: gains.length,
      reliable: reliability,
      durableGainPerMinute: Math.max(0, estimate),
      confidence: Math.max(0, Math.min(1, (gains.length / (minimumSample * 2)) * (1 / (1 + variance)))),
      delayedScore: delayedScores.length ? delayedScores.reduce((sum, value) => sum + value, 0) / delayedScores.length : 0,
    });
  }
  return result;
}

export function effectivenessFor(
  kind: InterventionKind,
  capabilityId: string,
  calibrations: ReadonlyMap<string, InterventionCalibration>,
): { gainPerMinute: number; calibrated: boolean; sampleSize: number } {
  const exact = calibrations.get(interventionKey(kind, capabilityId));
  const family = calibrations.get(interventionKey(kind));
  const chosen = exact?.reliable ? exact : family?.reliable ? family : exact ?? family;
  return chosen
    ? { gainPerMinute: chosen.durableGainPerMinute, calibrated: chosen.reliable, sampleSize: chosen.sampleSize }
    : { gainPerMinute: INTERVENTION_PRIORS[kind], calibrated: false, sampleSize: 0 };
}

function independentFor(attempt: Attempt): boolean {
  return attempt.markedBy !== "self" && !attempt.hintTier && !attempt.repairTeachingSeen && !attempt.copiedAnswer && attempt.mode !== "recall" && attempt.markEscalation?.status !== "pending";
}

function positiveMinutes(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : Math.max(0.01, fallback);
}

/** Start an outcome record at the moment an adaptive intervention is submitted. */
export function createInterventionOutcome(input: {
  userId: string;
  subjectId: string;
  context: InterventionAttemptContext;
  attempt: Attempt;
  actualMinutes?: number;
}): InterventionOutcomeRecord {
  const { context, attempt } = input;
  return {
    // The context identifies the planned rung; the attempt identifies this
    // concrete observation. Reusing a step slot across two sessions must not
    // overwrite the earlier evidence in the calibration log.
    id: attempt.id,
    ...(context.chainId ? { chainId: context.chainId } : {}),
    activity: context.activity ?? "question",
    userId: input.userId,
    subjectId: input.subjectId,
    topicId: context.topicId,
    capabilityId: context.capabilityId,
    kind: context.kind,
    priorState: context.priorState,
    plannedMinutes: context.plannedMinutes,
    actualMinutes: positiveMinutes(input.actualMinutes, positiveMinutes(attempt.elapsedMs / 60_000, context.plannedMinutes)),
    support: context.support,
    immediate: {
      awarded: attempt.awarded,
      max: attempt.max,
      independent: independentFor(attempt),
      attemptId: attempt.id,
      at: attempt.createdAt,
      result: attempt.max > 0 && attempt.awarded / attempt.max >= 0.7 ? "passed" : "missed",
    },
    createdAt: attempt.createdAt,
    updatedAt: attempt.createdAt,
  };
}

/**
 * Record a card-retrieval or teaching observation in the same account-scoped
 * log as question attempts. These rows are deliberately incomplete chains:
 * they make support usage and immediate engagement auditable, while
 * durableOutcomeScore ignores them until a question intervention has its own
 * independent transfer and delayed-retention evidence.
 */
export function createInterventionObservation(input: {
  userId: string;
  subjectId: string;
  context: InterventionAttemptContext;
  activity: Exclude<InterventionActivity, "question">;
  result: InterventionObservationResult;
  awarded: number;
  max: number;
  at: IsoInstant;
  actualMinutes?: number;
}): InterventionOutcomeRecord {
  const actualMinutes = positiveMinutes(input.actualMinutes, input.context.plannedMinutes);
  return {
    // Retrieval/teaching steps have no Attempt id, so include the observed
    // activity and timestamp in the row key. The stable chainId still joins a
    // later question, while repeated sessions retain every observation.
    id: `${input.context.id}:${input.activity}:${input.at}`,
    ...(input.context.chainId ? { chainId: input.context.chainId } : {}),
    userId: input.userId,
    subjectId: input.subjectId,
    topicId: input.context.topicId,
    capabilityId: input.context.capabilityId,
    kind: input.context.kind,
    priorState: input.context.priorState,
    plannedMinutes: input.context.plannedMinutes,
    actualMinutes,
    support: input.context.support,
    activity: input.activity,
    immediate: {
      awarded: Math.max(0, input.awarded),
      max: Math.max(0, input.max),
      independent: false,
      attemptId: `observation:${input.context.id}`,
      at: input.at,
      result: input.result,
    },
    createdAt: input.at,
    updatedAt: input.at,
  };
}

/** Attach a later unfamiliar-context result without overwriting the immediate result. */
export function attachTransferOutcome(
  outcome: InterventionOutcomeRecord,
  attempt: Attempt,
): InterventionOutcomeRecord {
  if (!independentFor(attempt) || !Number.isFinite(Date.parse(attempt.createdAt)) || Date.parse(attempt.createdAt) < Date.parse(outcome.createdAt)) return outcome;
  return {
    ...outcome,
    transfer: { awarded: attempt.awarded, max: attempt.max, independent: true, questionId: attempt.questionId, attemptId: attempt.id, at: attempt.createdAt },
    updatedAt: attempt.createdAt,
  };
}

/** Attach the delayed retrieval result; this is the final evidence in the chain. */
export function attachDelayedRetentionOutcome(
  outcome: InterventionOutcomeRecord,
  attempt: Attempt,
): InterventionOutcomeRecord {
  if (!independentFor(attempt) || !Number.isFinite(Date.parse(attempt.createdAt)) || Date.parse(attempt.createdAt) < Date.parse(outcome.createdAt)) return outcome;
  return {
    ...outcome,
    delayedRetention: { awarded: attempt.awarded, max: attempt.max, independent: true, questionId: attempt.questionId, attemptId: attempt.id, at: attempt.createdAt },
    updatedAt: attempt.createdAt,
  };
}
