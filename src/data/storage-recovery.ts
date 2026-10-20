import type { PersistenceIssue } from "./persistence-schema";
import { OUTDATED_TAB_MESSAGE } from "./db-notice";

/**
 * `outdated`: the stored database is newer than this tab's code (IndexedDB
 * VersionError, or another tab upgraded it under this one). Nothing is
 * damaged and no migration failed; the tab only needs a reload.
 */
export type StorageFailureKind = "corruption" | "migration" | "quota" | "unavailable" | "outdated";

export class StorageRecoveryError extends Error {
  readonly kind: StorageFailureKind;
  readonly issues: PersistenceIssue[];

  constructor(kind: StorageFailureKind, message: string, issues: PersistenceIssue[] = []) {
    super(message);
    this.name = "StorageRecoveryError";
    this.kind = kind;
    this.issues = issues;
  }
}
export function storageFailureKind(error: unknown): StorageFailureKind {
  if (error instanceof StorageRecoveryError) return error.kind;
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (name.includes("quota") || message.includes("quota")) return "quota";
  // Before the "version" → migration rule: a VersionError is a stale tab.
  // Boot errors reach the recovery screen as message strings, so the message
  // (OUTDATED_TAB_MESSAGE, or a browser's "less than the existing version")
  // identifies it too.
  if (name === "versionerror" || message.includes("older version of revise") || message.includes("less than the existing version")) return "outdated";
  if (name.includes("version") || message.includes("upgrade") || message.includes("migration")) return "migration";
  if (name.includes("indexeddb") || name.includes("dataerror") || message.includes("indexeddb")) return "corruption";
  return "unavailable";
}

export function storageFailureMessage(error: unknown): string {
  if (error instanceof StorageRecoveryError) return error.message;
  switch (storageFailureKind(error)) {
    case "outdated":
      return OUTDATED_TAB_MESSAGE;
    case "quota":
      return "This browser is running out of storage. Export a backup, then remove old media or reset this device.";
    case "migration":
      return "Revise could not finish a local database upgrade. Your previous data is still recoverable; retry or export it first.";
    case "corruption":
      return "Some local revision data is damaged. Revise can remove only the broken rows, preserving the rest of your history.";
    default:
      return "Revise could not open local storage. Check that browser storage is enabled, then retry.";
  }
}

