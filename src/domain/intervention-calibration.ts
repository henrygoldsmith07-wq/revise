import { requiresWjecContentReview } from "./physics-content-review";
import type { Attempt, InterventionActivity, InterventionAttemptContext, InterventionKind, InterventionObservationResult, InterventionOutcomeRecord, IsoInstant, Question } from "./types";
import { authenticPaperEvidence, independentAttempt, isTransferQuestion, partFamily, questionCapabilities, trustworthyAttempt, unseenQuestion } from "./learning-evidence";
import { trustedAssessmentContent } from "./physics-content-review";

export const INTERVENTION_PRIORS: Record<InterventionKind, number> = {
  diagnose: 0.015,
  guided: 0.025,
  independent: 0.030,
  transfer: 0.025,
  retention: 0.020,
};

const RETENTION_DELAY = 7 * 86_400_000;

export interface InterventionCalibration {
  key: string;
  kind: InterventionKind;
  capabilityId?: string;
  /** Present for the subject-level fallback calibration. */
  subjectId?: string;
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

/** Stable subject-scoped key used when a capability has too little evidence. */
export function interventionFamilyKey(kind: InterventionKind, subjectId: string): string {
  return `${kind}:subject:${subjectId}`;
}

function validScore(row: { awarded: number; max: number }): number | null {
  if (!Number.isFinite(row.awarded) || !Number.isFinite(row.max) || row.max <= 0 || row.awarded < 0 || row.awarded > row.max) return null;
  return row.awarded / row.max;
}

/** Only a complete, independent delayed chain is durable evidence. */
export function durableOutcomeScore(outcome: InterventionOutcomeRecord): number | null {
  if (outcome.evidenceVersion !== 2 || !outcome.timeMeasured ||
    ![outcome.immediate.at, outcome.transfer?.at, outcome.delayedRetention?.at].every((at) => at && Number.isFinite(Date.parse(at))) ||
    !outcome.transfer?.trusted || !outcome.delayedRetention?.trusted ||
    !outcome.immediateFamilyId || !outcome.transfer.familyId || !outcome.delayedRetention.familyId ||
    new Set([outcome.immediateFamilyId, outcome.transfer.familyId, outcome.delayedRetention.familyId]).size !== 3 ||
    (requiresWjecContentReview(outcome.subjectId) && outcome.immediate.trusted !== true) ||
    Date.parse(outcome.transfer.at) <= Date.parse(outcome.immediate.at) ||
    Date.parse(outcome.delayedRetention.at) - Date.parse(outcome.transfer.at) < RETENTION_DELAY) return null;
  const immediate = validScore(outcome.immediate);
  const transfer = outcome.transfer && validScore(outcome.transfer);
  const delayed = outcome.delayedRetention && validScore(outcome.delayedRetention);
  if (immediate == null || transfer == null || delayed == null || !outcome.transfer?.independent || !outcome.delayedRetention?.independent) return null;
  // Failed chains matter too: excluding them would bias effectiveness upwards.
  return transfer * 0.4 + delayed * 0.6;
}

export function calibratedGain(outcome: InterventionOutcomeRecord): number | null {
  const score = durableOutcomeScore(outcome);
  if (score == null || !Number.isFinite(outcome.actualMinutes) || outcome.actualMinutes <= 0) return null;
  const baseline = outcome.priorAccuracy;
  if (baseline == null || !Number.isFinite(baseline) || baseline < 0 || baseline > 1) return null;
  return (score - baseline) / outcome.actualMinutes;
}

/**
 * Estimate durable marks-per-minute from observed intervention chains. A
 * small empirical sample is shrunk toward the policy prior; it is only marked
 * reliable after at least twenty complete chains across five learners.
 * These observational associations are not causal estimates of superiority.
 */
export function calibrateInterventions(
  outcomes: readonly InterventionOutcomeRecord[],
  options: { minimumSample?: number; priorWeight?: number } = {},
): Map<string, InterventionCalibration> {
  const minimumSample = Math.max(20, options.minimumSample ?? 20);
  const priorWeight = Math.max(20, options.priorWeight ?? 20);
  const groups = new Map<string, {
    rows: InterventionOutcomeRecord[];
    scope: "capability" | "subject";
  }>();
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    // Replayed rows and the same chain cannot inflate sample size. A chain
    // label is intentionally reusable across sessions (the same capability
    // can need repair again), so include the immutable creation instant in
    // the identity. This collapses an exported/replayed copy of one chain
    // while retaining a later chain with the same capability label.
    const identity = `${outcome.userId}:${outcome.chainId ?? outcome.id}:${outcome.createdAt}`;
    if (seen.has(identity) || calibratedGain(outcome) == null) continue;
    seen.add(identity);
    // Capability ids are subject-scoped; never borrow effects across subjects.
    const key = interventionKey(outcome.kind, outcome.capabilityId);
    const capabilityGroup = groups.get(key) ?? { rows: [], scope: "capability" as const };
    capabilityGroup.rows.push(outcome);
    groups.set(key, capabilityGroup);
    // A capability-specific sample also informs the intervention family when
    // a capability has not yet accumulated enough evidence on its own.
    const family = interventionFamilyKey(outcome.kind, outcome.subjectId);
    const familyGroup = groups.get(family) ?? { rows: [], scope: "subject" as const };
    familyGroup.rows.push(outcome);
    groups.set(family, familyGroup);
  }
  const result = new Map<string, InterventionCalibration>();
  for (const [key, group] of groups) {
    const rows = group.rows;
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
    const reliability = gains.length >= minimumSample && new Set(rows.map((row) => row.userId)).size >= 5;
    result.set(key, {
      key,
      kind: first.kind,
      ...(group.scope === "capability" ? { capabilityId: first.capabilityId } : { subjectId: first.subjectId }),
      sampleSize: gains.length,
      reliable: reliability,
      durableGainPerMinute: estimate,
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
  subjectId?: string,
): { gainPerMinute: number; calibrated: boolean; sampleSize: number } {
  const exact = calibrations.get(interventionKey(kind, capabilityId));
  const family = subjectId ? calibrations.get(interventionFamilyKey(kind, subjectId)) : undefined;
  // Prefer a reliable capability estimate. If it is not reliable yet, use a
  // reliable subject estimate built from complete chains across capabilities.
  // This lets scarce capability evidence benefit from a conservative pooled
  // estimate without allowing one small or stale group to override the prior.
  const chosen = exact?.reliable ? exact : family?.reliable ? family : exact ?? family;
  return chosen
    ? { gainPerMinute: chosen.reliable ? Math.max(0, chosen.durableGainPerMinute) : INTERVENTION_PRIORS[kind], calibrated: chosen.reliable, sampleSize: chosen.sampleSize }
    : { gainPerMinute: INTERVENTION_PRIORS[kind], calibrated: false, sampleSize: 0 };
}

function independentFor(attempt: Attempt): boolean {
  return independentAttempt(attempt);
}

function positiveMinutes(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : Math.max(0.01, fallback);
}

function capabilityScore(attempt: Attempt, question: Question | undefined, capabilityId: string): { awarded: number; max: number } | null {
  const parts = question?.parts.filter((part) => part.capabilityIds?.length === 1 && part.capabilityIds[0] === capabilityId) ?? [];
  if (!parts.length) return null;
  let awarded = 0;
  let max = 0;
  for (const part of parts) {
    const marked = attempt.marked.find((row) => row.partId === part.id);
    if (!marked || marked.max !== part.marks || validScore(marked) === null) return null;
    awarded += marked.awarded;
    max += marked.max;
  }
  return { awarded, max };
}

function familyForCapability(question: Question, capabilityId: string): string {
  if (question.learning?.familyId) return question.learning.familyId;
  return partFamily(question, question.parts.find((part) => part.capabilityIds?.includes(capabilityId)) ?? question.parts[0]!);
}

/** Start an outcome record at the moment an adaptive intervention is submitted. */
export function createInterventionOutcome(input: {
  userId: string;
  subjectId: string;
  context: InterventionAttemptContext;
  attempt: Attempt;
  actualMinutes?: number;
  question?: Question;
  /** Needed to authenticate a Physics paper response before it can enter a chain. */
  questions?: readonly Question[];
  history?: readonly Attempt[];
}): InterventionOutcomeRecord {
  const { context, attempt } = input;
  const score = capabilityScore(attempt, input.question, context.capabilityId);
  const immediateTrusted = Boolean(trustworthyAttempt(attempt) && input.question && input.question.subjectId === input.subjectId && trustedAssessmentContent(input.question) &&
    (!requiresWjecContentReview(input.subjectId) || attempt.mode !== "paper" ||
      (input.questions && authenticPaperEvidence(attempt, input.question, input.history ?? [attempt], input.questions))));
  return {
    // The context identifies the planned rung; the attempt identifies this
    // concrete observation. Reusing a step slot across two sessions must not
    // overwrite the earlier evidence in the calibration log.
    id: attempt.id,
    ...(score ? { evidenceVersion: 2 as const } : {}),
    immediateQuestionId: attempt.questionId,
    ...(input.question ? { immediateFamilyId: familyForCapability(input.question, context.capabilityId) } : {}),
    ...(context.priorAccuracy !== undefined ? { priorAccuracy: context.priorAccuracy } : {}),
    timeMeasured: Number.isFinite(attempt.elapsedMs) && attempt.elapsedMs > 0,
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
    support: attempt.hintTier ?? (attempt.repairTeachingSeen ? "worked-solution" : context.support),
    immediate: {
      awarded: score?.awarded ?? attempt.awarded,
      max: score?.max ?? attempt.max,
      independent: independentFor(attempt),
      attemptId: attempt.id,
      at: attempt.createdAt,
      result: (score?.max ?? attempt.max) > 0 && (score?.awarded ?? attempt.awarded) / (score?.max ?? attempt.max) >= 0.7 ? "passed" : "missed",
      ...(requiresWjecContentReview(input.subjectId) ? { trusted: immediateTrusted } : {}),
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
    timeMeasured: Number.isFinite(input.actualMinutes) && (input.actualMinutes ?? 0) > 0,
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
export interface OutcomeEvidenceContext {
  question: Question;
  questions: readonly Question[];
  history: readonly Attempt[];
  lastLearningAt?: IsoInstant;
}

function validFollowUp(outcome: InterventionOutcomeRecord, attempt: Attempt, evidence?: OutcomeEvidenceContext): evidence is OutcomeEvidenceContext {
  if (!evidence || !independentFor(attempt) || attempt.userId !== outcome.userId || attempt.subjectId !== outcome.subjectId ||
    (requiresWjecContentReview(outcome.subjectId) && outcome.immediate.trusted !== true) ||
    attempt.questionId !== evidence.question.id || !trustedAssessmentContent(evidence.question) ||
    !questionCapabilities(evidence.question).includes(outcome.capabilityId) ||
    !capabilityScore(attempt, evidence.question, outcome.capabilityId) ||
    Date.parse(attempt.createdAt) <= Date.parse(outcome.createdAt) ||
    attempt.questionId === outcome.immediateQuestionId ||
    familyForCapability(evidence.question, outcome.capabilityId) === outcome.immediateFamilyId ||
    !Number.isFinite(attempt.elapsedMs) || attempt.elapsedMs <= 0) return false;
  if (requiresWjecContentReview(outcome.subjectId) && attempt.mode === "paper" &&
    !authenticPaperEvidence(attempt, evidence.question, evidence.history, evidence.questions)) return false;
  const prior = evidence.history.filter((row) => row.userId === attempt.userId && row.id !== attempt.id &&
    Date.parse(row.createdAt) <= Date.parse(attempt.createdAt));
  return unseenQuestion(evidence.question, prior, evidence.questions);
}

export function attachTransferOutcome(
  outcome: InterventionOutcomeRecord,
  attempt: Attempt,
  evidence?: OutcomeEvidenceContext,
): InterventionOutcomeRecord {
  if (outcome.transfer || !validFollowUp(outcome, attempt, evidence) || !isTransferQuestion(evidence.question)) return outcome;
  const score = capabilityScore(attempt, evidence.question, outcome.capabilityId)!;
  return {
    ...outcome,
    actualMinutes: outcome.actualMinutes + attempt.elapsedMs / 60_000,
    transfer: { ...score, independent: true, questionId: attempt.questionId, attemptId: attempt.id, at: attempt.createdAt,
      familyId: familyForCapability(evidence.question, outcome.capabilityId), trusted: true },
    updatedAt: attempt.createdAt,
  };
}

/** Attach the delayed retrieval result; this is the final evidence in the chain. */
export function attachDelayedRetentionOutcome(
  outcome: InterventionOutcomeRecord,
  attempt: Attempt,
  evidence?: OutcomeEvidenceContext,
): InterventionOutcomeRecord {
  if (outcome.delayedRetention || !outcome.transfer || !validFollowUp(outcome, attempt, evidence) ||
    familyForCapability(evidence.question, outcome.capabilityId) === outcome.transfer.familyId) return outcome;
  // Every intervening attempt at this capability restarts the unpractised delay.
  const byId = new Map(evidence.questions.map((question) => [question.id, question]));
  const lastPractice = evidence.history.filter((row) => {
    const question = byId.get(row.questionId);
    return row.userId === attempt.userId && row.id !== attempt.id &&
      Date.parse(row.createdAt) < Date.parse(attempt.createdAt) &&
      question && questionCapabilities(question).includes(outcome.capabilityId);
  }).reduce((latest, row) => Math.max(latest, Date.parse(row.createdAt)),
    Math.max(Date.parse(outcome.transfer.at), Date.parse(evidence.lastLearningAt ?? outcome.transfer.at)));
  if (Date.parse(attempt.createdAt) - lastPractice < RETENTION_DELAY) return outcome;
  const score = capabilityScore(attempt, evidence.question, outcome.capabilityId)!;
  return {
    ...outcome,
    actualMinutes: outcome.actualMinutes + attempt.elapsedMs / 60_000,
    delayedRetention: { ...score, independent: true, questionId: attempt.questionId, attemptId: attempt.id, at: attempt.createdAt,
      familyId: familyForCapability(evidence.question, outcome.capabilityId), trusted: true },
    updatedAt: attempt.createdAt,
  };
}
