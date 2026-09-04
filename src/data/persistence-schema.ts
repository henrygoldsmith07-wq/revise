import type { Id } from "@/domain/types";

/**
 * The IndexedDB shape is a public data contract even though the database is
 * local. A browser can be offline for weeks, so old rows must remain readable
 * after a new build ships. Keep this list in lockstep with `src/data/db.ts`.
 */
export const PERSISTED_SCHEMA_VERSION = 6 as const;

/**
 * Append-only migration inventory. Keeping the steps named and contiguous
 * gives compatibility tests something concrete to assert and makes an
 * interrupted upgrade diagnosable without inspecting a user's rows.
 */
export const PERSISTED_MIGRATIONS = [
  { version: 1, name: "create-stores" },
  { version: 2, name: "card-tags-and-index" },
  { version: 3, name: "lesson-progress" },
  { version: 4, name: "history-indexes" },
  { version: 5, name: "ai-marking-stores" },
  { version: 6, name: "owned-outbox-indexes" },
] as const;

export const PERSISTED_STORES = [
  "cards",
  "reviewLogs",
  "questions",
  "attempts",
  "mistakes",
  "papers",
  "plannedSessions",
  "examDates",
  "settings",
  "streak",
  "lessonProgress",
  "outbox",
  "meta",
  "aiCache",
  "aiDlq",
] as const;

export type PersistedStore = (typeof PERSISTED_STORES)[number];

export interface PersistenceIssue {
  store: PersistedStore;
  row: string;
  field?: string;
  reason: string;
}

type RecordLike = Record<string, unknown>;

function record(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function numberValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function issue(store: PersistedStore, row: string, field: string | undefined, reason: string): PersistenceIssue {
  return { store, row, ...(field ? { field } : {}), reason };
}

/**
 * Validate only the invariants needed to safely load a row. This deliberately
 * does not reject new optional fields: adding a domain field must not brick an
 * older device. It does reject malformed required fields so the UI can offer
 * repair instead of crashing deep inside a derived calculation.
 */
export function validatePersistedRecord(store: PersistedStore, value: unknown, row = "?"): PersistenceIssue[] {
  if (!record(value)) return [issue(store, row, undefined, "row is not an object")];

  switch (store) {
    case "cards": {
      const required: Array<[string, (v: unknown) => boolean]> = [
        ["id", text],
        ["userId", text],
        ["subjectId", text],
        ["topicId", text],
        ["front", text],
        ["back", text],
        ["due", text],
        ["createdAt", text],
        ["updatedAt", text],
        ["stability", numberValue],
        ["difficulty", numberValue],
        ["reps", numberValue],
        ["lapses", numberValue],
      ];
      return [
        ...required.flatMap(([field, check]) => (check(value[field]) ? [] : [issue(store, row, field, "missing or invalid required value")])),
        ...(Array.isArray(value.tags) ? [] : [issue(store, row, "tags", "expected an array")]),
      ];
    }
    case "reviewLogs":
      return requiredTextFields(store, value, row, ["id", "userId", "cardId", "topicId", "grade", "reviewedAt"]);
    case "questions":
      // Authored questions are shared and predate per-user question rows, so
      // `userId` is intentionally not required here.
      return [
        ...requiredTextFields(store, value, row, ["id", "subjectId", "createdAt"]),
        ...(Array.isArray(value.topicIds) ? [] : [issue(store, row, "topicIds", "expected an array")]),
        ...(Array.isArray(value.parts) ? [] : [issue(store, row, "parts", "expected an array")]),
        ...(numberValue(value.totalMarks) ? [] : [issue(store, row, "totalMarks", "expected a finite number")]),
      ];
    case "attempts":
      return [
        ...requiredTextFields(store, value, row, ["id", "userId", "questionId", "subjectId", "createdAt"]),
        ...(numberValue(value.awarded) ? [] : [issue(store, row, "awarded", "expected a finite number")]),
        ...(numberValue(value.max) ? [] : [issue(store, row, "max", "expected a finite number")]),
      ];
    case "mistakes":
      return [
        ...requiredTextFields(store, value, row, ["id", "userId", "subjectId", "topicId", "createdAt"]),
        ...(numberValue(value.marksLost) ? [] : [issue(store, row, "marksLost", "expected a finite number")]),
        ...(typeof value.resolved === "boolean" ? [] : [issue(store, row, "resolved", "expected a boolean")]),
      ];
    case "papers":
      return [
        ...requiredTextFields(store, value, row, ["id", "userId", "subjectId", "title", "createdAt", "status"]),
        ...(Array.isArray(value.questionIds) ? [] : [issue(store, row, "questionIds", "expected an array")]),
        ...(numberValue(value.totalMarks) ? [] : [issue(store, row, "totalMarks", "expected a finite number")]),
      ];
    case "plannedSessions":
      return [
        ...requiredTextFields(store, value, row, ["id", "userId", "date", "subjectId", "activity", "status"]),
        ...(numberValue(value.minutes) ? [] : [issue(store, row, "minutes", "expected a finite number")]),
      ];
    case "examDates":
      return requiredTextFields(store, value, row, ["id", "userId", "subjectId", "date", "label"]);
    case "settings":
      return [
        ...requiredTextFields(store, value, row, ["userId", "displayName", "updatedAt"]),
        ...(Array.isArray(value.subjectIds) ? [] : [issue(store, row, "subjectIds", "expected an array")]),
        ...(Array.isArray(value.availability) ? [] : [issue(store, row, "availability", "expected an array")]),
        ...(record(value.targetGrades) ? [] : [issue(store, row, "targetGrades", "expected an object")]),
      ];
    case "streak":
      return [
        ...requiredTextFields(store, value, row, ["userId"]),
        ...(numberValue(value.current) ? [] : [issue(store, row, "current", "expected a finite number")]),
        ...(numberValue(value.longest) ? [] : [issue(store, row, "longest", "expected a finite number")]),
        ...(Array.isArray(value.achievements) ? [] : [issue(store, row, "achievements", "expected an array")]),
      ];
    case "outbox":
      return [
        ...requiredTextFields(store, value, row, ["id", "entity", "op", "queuedAt"]),
        ...(numberValue(value.attempts) ? [] : [issue(store, row, "attempts", "expected a finite number")]),
        ...(value.ownerId === undefined || text(value.ownerId)
          ? []
          : [issue(store, row, "ownerId", "expected a non-empty account id when present")]),
      ];
    case "lessonProgress":
      return [
        ...requiredTextFields(store, value, row, ["userId", "updatedAt"]),
        ...(record(value.completed) ? [] : [issue(store, row, "completed", "expected an object")]),
        ...(record(value.streak) ? [] : [issue(store, row, "streak", "expected an object")]),
      ];
    case "meta":
      return requiredTextFields(store, value, row, ["key"]);
    case "aiCache":
      return requiredTextFields(store, value, row, ["key", "scope", "createdAt"]);
    case "aiDlq":
      return [
        ...requiredTextFields(store, value, row, ["id", "attemptId", "queuedAt", "nextAttemptAt"]),
        ...(numberValue(value.attempts) ? [] : [issue(store, row, "attempts", "expected a finite number")]),
      ];
  }
}

function requiredTextFields(
  store: PersistedStore,
  value: RecordLike,
  row: string,
  fields: string[],
): PersistenceIssue[] {
  return fields.flatMap((field) => (text(value[field]) ? [] : [issue(store, row, field, "missing or invalid required value")]));
}

export function persistedRowId(store: PersistedStore, value: unknown, fallback = "?"): Id {
  if (!record(value)) return fallback;
  const candidate = store === "settings" || store === "streak" || store === "lessonProgress"
    ? value.userId
    : store === "meta" || store === "aiCache"
      ? value.key
      : value.id;
  return text(candidate) ? candidate : fallback;
}

export function validatePersistedStores(
  stores: Partial<Record<PersistedStore, unknown[]>>,
): PersistenceIssue[] {
  return PERSISTED_STORES.flatMap((store) =>
    (stores[store] ?? []).flatMap((value, index) =>
      validatePersistedRecord(store, value, persistedRowId(store, value, String(index + 1))),
    ),
  );
}
