import type {
  Attempt,
  FarTransferAttemptLink,
  FarTransferOutcome,
  FarTransferRetestStatus,
  Id,
  IsoDate,
  Question,
} from "./types";

export const DELAYED_FAR_TRANSFER_DELAY_DAYS = 7;
export const FAR_TRANSFER_SOURCE_THRESHOLD = 0.8;
export const FAR_TRANSFER_PASS_THRESHOLD = 0.6;
export const FAR_TRANSFER_SECURE_THRESHOLD = 0.8;

export interface FarTransferCandidate {
  question: Question;
  sharedSpecPointIds: Id[];
  sharedLearningClaims: string[];
  sharedTopicIds: Id[];
  noveltyScore: number;
}

export interface ScheduleDelayedFarTransferInput {
  attempt: Attempt;
  question: Question;
  questions: readonly Question[];
  attemptedQuestionIds?: readonly Id[];
  delayDays?: number;
}

export interface DelayedFarTransferRetest extends FarTransferAttemptLink {
  userId: Id;
  subjectId: Id;
  topicIds: Id[];
  status: FarTransferRetestStatus;
}

export interface DelayedFarTransferReport {
  scheduled: number;
  due: number;
  upcoming: number;
  completed: number;
  passed: number;
  passRate: number | null;
  averagePercentage: number | null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stemTokens(value: string): Set<string> {
  return new Set(normalise(value).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean));
}

function questionSpecPointIds(question: Question): Id[] {
  return unique([
    ...(question.specPointIds ?? []),
    ...question.parts.flatMap((part) => part.specPointIds ?? []),
  ]);
}

function questionLearningClaims(question: Question): string[] {
  return unique(question.parts.flatMap((part) => (part.learningClaims ?? []).map(normalise)));
}

function questionTopicIds(question: Question): Id[] {
  return unique(question.topicIds);
}

function overlap(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value)));
}

function noveltyScore(source: Question, candidate: Question): number {
  const sourceTokens = stemTokens(source.stem);
  const candidateTokens = stemTokens(candidate.stem);
  const union = new Set([...sourceTokens, ...candidateTokens]);
  const shared = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
  const lexicalDistance = union.size ? 1 - shared / union.size : 1;
  const kindDistance = source.kind === candidate.kind ? 0 : 0.15;
  return Math.min(1, Math.round((lexicalDistance + kindDistance) * 1000) / 1000);
}

/** Pick a different context/question that still tests the same mapped claim. */
export function selectFarTransferCandidate(
  source: Question,
  questions: readonly Question[],
  attemptedQuestionIds: readonly Id[] = [],
): FarTransferCandidate | undefined {
  const sourceSpecPoints = questionSpecPointIds(source);
  const sourceClaims = questionLearningClaims(source);
  const sourceTopics = questionTopicIds(source);
  const attempted = new Set(attemptedQuestionIds);
  const sourceStem = normalise(source.stem);

  const candidates = questions
    .filter((candidate) => candidate.subjectId === source.subjectId)
    .filter((candidate) => candidate.id !== source.id && !attempted.has(candidate.id))
    .filter((candidate) => normalise(candidate.stem) !== sourceStem)
    .map((candidate) => {
      const sharedSpecPointIds = overlap(sourceSpecPoints, questionSpecPointIds(candidate));
      const sharedLearningClaims = overlap(sourceClaims, questionLearningClaims(candidate));
      const sharedTopicIds = overlap(sourceTopics, questionTopicIds(candidate));
      return {
        question: candidate,
        sharedSpecPointIds,
        sharedLearningClaims,
        sharedTopicIds,
        noveltyScore: noveltyScore(source, candidate),
      };
    })
    .filter((candidate) => candidate.sharedSpecPointIds.length || candidate.sharedLearningClaims.length || candidate.sharedTopicIds.length)
    .sort((a, b) => {
      // Mapped spec points and learning claims are stronger evidence than a
      // shared topic, while novelty breaks ties inside the same anchor.
      const anchorA = a.sharedSpecPointIds.length * 1000 + a.sharedLearningClaims.length * 500 + a.sharedTopicIds.length * 100;
      const anchorB = b.sharedSpecPointIds.length * 1000 + b.sharedLearningClaims.length * 500 + b.sharedTopicIds.length * 100;
      if (anchorA !== anchorB) return anchorB - anchorA;
      if (a.noveltyScore !== b.noveltyScore) return b.noveltyScore - a.noveltyScore;
      return a.question.id.localeCompare(b.question.id);
    });

  return candidates[0];
}

function validDelayDays(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 365
    ? value
    : DELAYED_FAR_TRANSFER_DELAY_DAYS;
}

function scheduledDate(createdAt: string, delayDays: number): IsoDate | undefined {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + delayDays);
  return date.toISOString().slice(0, 10);
}

function score(attempt: Attempt): number {
  if (!Number.isFinite(attempt.max) || attempt.max <= 0) return 0;
  return Math.max(0, Math.min(1, attempt.awarded / attempt.max));
}

function eligibleSource(attempt: Attempt): boolean {
  return (
    !attempt.farTransfer &&
    attempt.max > 0 &&
    score(attempt) >= FAR_TRANSFER_SOURCE_THRESHOLD &&
    attempt.markEscalation?.status !== "pending"
  );
}

export function scheduleDelayedFarTransfer(input: ScheduleDelayedFarTransferInput): FarTransferAttemptLink | undefined {
  if (!eligibleSource(input.attempt)) return undefined;

  const delayDays = validDelayDays(input.delayDays);
  const scheduledFor = scheduledDate(input.attempt.createdAt, delayDays);
  if (!scheduledFor) return undefined;

  const candidate = selectFarTransferCandidate(input.question, input.questions, [
    ...(input.attemptedQuestionIds ?? []),
    input.question.id,
  ]);
  if (!candidate) return undefined;

  return {
    retestId: `far-transfer:${input.attempt.id}`,
    role: "source",
    sourceAttemptId: input.attempt.id,
    sourceQuestionId: input.question.id,
    candidateQuestionId: candidate.question.id,
    scheduledFor,
    delayDays,
  };
}

export function scoreFarTransferRetest(retestAttempt: Attempt): FarTransferOutcome {
  const percentage = score(retestAttempt);
  const band = percentage >= FAR_TRANSFER_SECURE_THRESHOLD
    ? "secure"
    : percentage >= FAR_TRANSFER_PASS_THRESHOLD
      ? "partial"
      : "not-secure";

  return {
    awarded: retestAttempt.awarded,
    max: retestAttempt.max,
    percentage,
    passed: percentage >= FAR_TRANSFER_PASS_THRESHOLD,
    band,
    completedAt: retestAttempt.createdAt,
  };
}

export function completeDelayedFarTransfer(
  retest: DelayedFarTransferRetest,
  attempt: Attempt,
): FarTransferAttemptLink {
  return {
    retestId: retest.retestId,
    role: "retest",
    sourceAttemptId: retest.sourceAttemptId,
    sourceQuestionId: retest.sourceQuestionId,
    candidateQuestionId: retest.candidateQuestionId,
    scheduledFor: retest.scheduledFor,
    delayDays: retest.delayDays,
    outcome: scoreFarTransferRetest(attempt),
  };
}

function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function delayedFarTransferRetests(input: {
  attempts: readonly Attempt[];
  questions: readonly Question[];
  today?: IsoDate;
}): DelayedFarTransferRetest[] {
  const today = input.today ?? todayIso();
  const attemptsByUser = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    const rows = attemptsByUser.get(attempt.userId) ?? [];
    rows.push(attempt);
    attemptsByUser.set(attempt.userId, rows);
  }

  const completedByRetestId = new Map<Id, Attempt>();
  for (const attempt of input.attempts) {
    const link = attempt.farTransfer;
    if (link?.role !== "retest") continue;
    const existing = completedByRetestId.get(link.retestId);
    if (!existing || existing.createdAt < attempt.createdAt) completedByRetestId.set(link.retestId, attempt);
  }

  const records = new Map<Id, DelayedFarTransferRetest>();
  for (const sourceAttempt of input.attempts) {
    if (sourceAttempt.farTransfer?.role === "retest") continue;
    const sourceQuestion = input.questions.find((question) => question.id === sourceAttempt.questionId);
    if (!sourceQuestion) continue;

    const stored = sourceAttempt.farTransfer?.role === "source" ? sourceAttempt.farTransfer : undefined;
    const link = stored ?? scheduleDelayedFarTransfer({
      attempt: sourceAttempt,
      question: sourceQuestion,
      questions: input.questions,
      attemptedQuestionIds: (attemptsByUser.get(sourceAttempt.userId) ?? []).map((attempt) => attempt.questionId),
    });
    if (!link) continue;

    const completed = completedByRetestId.get(link.retestId);
    records.set(link.retestId, {
      ...link,
      userId: sourceAttempt.userId,
      subjectId: sourceAttempt.subjectId,
      topicIds: sourceAttempt.topicIds,
      status: completed ? "completed" : link.scheduledFor <= today ? "due" : "scheduled",
      outcome: completed?.farTransfer?.outcome,
    });
  }

  const statusOrder: Record<FarTransferRetestStatus, number> = { due: 0, scheduled: 1, completed: 2 };
  return [...records.values()].sort((a, b) => {
    const status = statusOrder[a.status] - statusOrder[b.status];
    if (status !== 0) return status;
    if (a.scheduledFor !== b.scheduledFor) return a.scheduledFor.localeCompare(b.scheduledFor);
    return a.retestId.localeCompare(b.retestId);
  });
}

export function delayedFarTransferReport(retests: readonly DelayedFarTransferRetest[]): DelayedFarTransferReport {
  const completed = retests.filter((retest) => retest.status === "completed");
  const passed = completed.filter((retest) => retest.outcome?.passed).length;
  const percentages = completed.flatMap((retest) => (retest.outcome ? [retest.outcome.percentage] : []));

  return {
    scheduled: retests.length,
    due: retests.filter((retest) => retest.status === "due").length,
    upcoming: retests.filter((retest) => retest.status === "scheduled").length,
    completed: completed.length,
    passed,
    passRate: completed.length ? passed / completed.length : null,
    averagePercentage: percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null,
  };
}
