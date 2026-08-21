import type { Id, IsoInstant } from "./types";

export type RevisionActivity = "practice" | "review" | "paper" | "study";

export interface RevisionCheckpointInput {
  activity: RevisionActivity;
  title: string;
  href: string;
  position: number;
  total: number;
  queueIds?: Id[];
  paperId?: Id;
  paperRunId?: Id;
  retestMistakeId?: Id;
  repeatCount?: number;
}

export interface RevisionCheckpoint extends RevisionCheckpointInput {
  version: 1;
  userId: Id;
  updatedAt: IsoInstant;
}

const ACTIVITIES = new Set<RevisionActivity>(["practice", "review", "paper", "study"]);
const ROUTES = ["/practice", "/review", "/papers", "/study"];

export function createRevisionCheckpoint(
  userId: Id,
  input: RevisionCheckpointInput,
  now = new Date().toISOString(),
): RevisionCheckpoint {
  return {
    ...input,
    version: 1,
    userId,
    position: clampInteger(input.position, 0, Math.max(0, input.total - 1)),
    total: Math.max(0, Math.floor(input.total)),
    queueIds: input.queueIds?.filter((id, index, ids) => Boolean(id) && ids.indexOf(id) === index),
    repeatCount: input.repeatCount == null ? undefined : Math.max(0, Math.floor(input.repeatCount)),
    updatedAt: now,
  };
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
    typeof checkpoint.position === "number" &&
    Number.isInteger(checkpoint.position) &&
    checkpoint.position >= 0 &&
    typeof checkpoint.total === "number" &&
    Number.isInteger(checkpoint.total) &&
    checkpoint.total >= 0 &&
    (checkpoint.queueIds === undefined || (Array.isArray(checkpoint.queueIds) && checkpoint.queueIds.every((id) => typeof id === "string"))) &&
    (checkpoint.repeatCount === undefined || Number.isInteger(checkpoint.repeatCount)) &&
    typeof checkpoint.updatedAt === "string"
  );
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
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
}
