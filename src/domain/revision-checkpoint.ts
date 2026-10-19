import type { Attempt, Id, IsoInstant, MissionAttemptContext, ReviewLog } from "./types";

export type RevisionActivity = "practice" | "review" | "paper" | "study" | "adaptive";

/** The exact questions, support and attribution of a mission step, so a refresh resumes that step rather than rebuilding it. */
export interface MissionCheckpointState {
  missionId: Id;
  /** Normalised stage route parameter, or "" when the route carried none. */
  stage: string;
  startedAt: IsoInstant;
  questionIds: Id[];
  /** null = full hint ladder. */
  hintBudgetFor: Record<Id, number | null>;
  contextFor: Record<Id, MissionAttemptContext>;
}

export interface RevisionCheckpointInput {
  activity: RevisionActivity;
  title: string;
  href: string;
  /** Optional topic pin for adaptive sessions that re-rank after a step. */
  topicId?: Id;
  position: number;
  total: number;
  queueIds?: Id[];
  paperId?: Id;
  paperRunId?: Id;
  retestMistakeId?: Id;
  repeatCount?: number;
  mission?: MissionCheckpointState;
  /**
   * When this run began. Carried across saves of the same run, so "answered
   * since the run began" has a fixed cut-off (see checkpointHasProgress).
   * Absent on checkpoints written before the twenty-sixth pass.
   */
  startedAt?: IsoInstant;
}

export interface RevisionCheckpoint extends RevisionCheckpointInput {
  version: 1;
  userId: Id;
  updatedAt: IsoInstant;
}

const ACTIVITIES = new Set<RevisionActivity>(["practice", "review", "paper", "study", "adaptive"]);
const ROUTES = ["/practice", "/review", "/papers", "/study", "/adaptive-session"];

export function createRevisionCheckpoint(
  userId: Id,
  input: RevisionCheckpointInput,
  now = new Date().toISOString(),
  previous: RevisionCheckpoint | null = null,
): RevisionCheckpoint {
  const startedAt = input.startedAt
    ?? (previous && sameRun(previous, userId, input) ? previous.startedAt ?? previous.updatedAt : now);
  return {
    ...input,
    startedAt,
    version: 1,
    userId,
    position: clampInteger(input.position, 0, Math.max(0, input.total - 1)),
    total: Math.max(0, Math.floor(input.total)),
    queueIds: input.queueIds?.filter((id, index, ids) => Boolean(id) && ids.indexOf(id) === index),
    repeatCount: input.repeatCount == null ? undefined : Math.max(0, Math.floor(input.repeatCount)),
    updatedAt: now,
  };
}

/** The same run saved again: same learner, activity, route, mission and first question. */
function sameRun(previous: RevisionCheckpoint, userId: Id, input: RevisionCheckpointInput): boolean {
  return previous.userId === userId && previous.activity === input.activity && previous.href === input.href &&
    previous.mission?.missionId === input.mission?.missionId && previous.queueIds?.[0] === input.queueIds?.[0];
}

type ProgressEvidence = {
  attempts: ReadonlyArray<Pick<Attempt, "questionId" | "topicIds" | "createdAt">>;
  reviewLogs: ReadonlyArray<Pick<ReviewLog, "cardId" | "topicId" | "reviewedAt">>;
};

/**
 * Whether a saved run holds anything to resume. Every revision page saves a
 * checkpoint as soon as its first question is on screen, so opening a step and
 * going back used to leave Today offering "Resume interrupted revision" (and
 * hiding its recommendation) for a run with nothing in it. A run counts once
 * the student has moved past its first item, or has answered or reviewed
 * something from it since it began. The checkpoint itself is kept either way:
 * the page still uses it to restore the same questions on refresh.
 */
export function checkpointHasProgress(checkpoint: RevisionCheckpoint, evidence: ProgressEvidence): boolean {
  if (checkpoint.position > 0) return true;
  const since = checkpoint.mission?.startedAt ?? checkpoint.startedAt ?? checkpoint.updatedAt;
  const ids = new Set([...(checkpoint.queueIds ?? []), ...(checkpoint.mission?.questionIds ?? [])]);
  // Adaptive queue ids are step ids, not question or card ids; its steps are
  // all on the pinned topic.
  const topic = checkpoint.activity === "adaptive" ? checkpoint.topicId : undefined;
  return evidence.attempts.some((a) => a.createdAt >= since && (ids.has(a.questionId) || (topic !== undefined && a.topicIds.includes(topic)))) ||
    evidence.reviewLogs.some((l) => l.reviewedAt >= since && (ids.has(l.cardId) || (topic !== undefined && l.topicId === topic)));
}

export function isRevisionCheckpoint(value: unknown): value is RevisionCheckpoint {
  if (!value || typeof value !== "object") return false;
  const checkpoint = value as Partial<RevisionCheckpoint>;
  return (
    checkpoint.version === 1 &&
    typeof checkpoint.userId === "string" &&
    ACTIVITIES.has(checkpoint.activity as RevisionActivity) &&
    typeof checkpoint.title === "string" &&
    checkpoint.title.trim().length > 0 &&
    isLocalRoute(checkpoint.href) &&
    (checkpoint.topicId === undefined || typeof checkpoint.topicId === "string") &&
    typeof checkpoint.position === "number" &&
    Number.isInteger(checkpoint.position) &&
    checkpoint.position >= 0 &&
    typeof checkpoint.total === "number" &&
    Number.isInteger(checkpoint.total) &&
    checkpoint.total >= 0 &&
    (checkpoint.queueIds === undefined || (Array.isArray(checkpoint.queueIds) && checkpoint.queueIds.every((id) => typeof id === "string"))) &&
    (checkpoint.repeatCount === undefined || Number.isInteger(checkpoint.repeatCount)) &&
    (checkpoint.mission === undefined || isMissionCheckpointState(checkpoint.mission)) &&
    (checkpoint.startedAt === undefined || typeof checkpoint.startedAt === "string") &&
    typeof checkpoint.updatedAt === "string"
  );
}

function isMissionCheckpointState(value: unknown): value is MissionCheckpointState {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<MissionCheckpointState>;
  return typeof m.missionId === "string" && typeof m.stage === "string" && typeof m.startedAt === "string" &&
    Array.isArray(m.questionIds) && m.questionIds.every((id) => typeof id === "string") &&
    Boolean(m.hintBudgetFor) && typeof m.hintBudgetFor === "object" && Boolean(m.contextFor) && typeof m.contextFor === "object";
}

export function isLocalRoute(href: unknown): href is string {
  return typeof href === "string" && ROUTES.some((route) => href === route || href.startsWith(`${route}?`));
}

export function revisionActivityLabel(activity: RevisionActivity): string {
  switch (activity) {
    case "practice":
      return "Exam questions";
    case "review":
      return "Spaced repetition";
    case "paper":
      return "Past paper";
    case "study":
      return "Study mode";
    case "adaptive":
      return "Adaptive session";
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
}
