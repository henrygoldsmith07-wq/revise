import type { PersistenceIssue } from "./persistence-schema";

export type StorageFailureKind = "corruption" | "migration" | "quota" | "unavailable";

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
  if (name.includes("version") || message.includes("upgrade") || message.includes("migration")) return "migration";
  if (name.includes("indexeddb") || name.includes("dataerror") || message.includes("indexeddb")) return "corruption";
  return "unavailable";
}

export function storageFailureMessage(error: unknown): string {
  if (error instanceof StorageRecoveryError) return error.message;
  switch (storageFailureKind(error)) {
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

