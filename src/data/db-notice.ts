// ---------------------------------------------------------------------------
// Cross-tab database notices.
//
// IndexedDB upgrades need every other connection to the database closed. A
// tab still running the previous build holds one open, so after a deploy:
//
//   * the old tab gets `versionchange` (idb's `blocking`): it closes its
//     connection so the new tab can upgrade, and must reload, because every
//     later read or write would fail ("stale");
//   * the new tab's open is `blocked` until the old tab closes: without a
//     notice it sits at the boot screen with no explanation ("blocked").
//
// Kept apart from db.ts so the shell can render the notice without pulling
// the database module into its first chunk.
// ---------------------------------------------------------------------------

export type DatabaseNotice = "blocked" | "stale" | null;

export const DATABASE_NOTICE_EVENT = "revise:database-notice";

let notice: DatabaseNotice = null;
const listeners = new Set<() => void>();

export function currentDatabaseNotice(): DatabaseNotice {
  return notice;
}

export function setDatabaseNotice(next: DatabaseNotice): void {
  // "stale" is terminal for this tab: only a reload clears it.
  if (notice === next || notice === "stale") return;
  notice = next;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(DATABASE_NOTICE_EVENT));
  }
}

export function subscribeDatabaseNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only. */
export function resetDatabaseNoticeForTests(): void {
  notice = null;
}

/** What each notice tells the learner. Plain sentences; the UI adds a Reload button. */
export const DATABASE_NOTICE_COPY: Record<Exclude<DatabaseNotice, null>, string> = {
  blocked:
    "Revise has been updated. Close or reload your other open Revise tabs so this one can finish opening your profile.",
  stale:
    "Revise was updated in another tab, so this tab is running an older version. Reload to keep working; everything you saved is kept.",
};

/** The error a stale tab's database calls fail with (named for storage-recovery). */
export const OUTDATED_TAB_MESSAGE =
  "This tab is running an older version of Revise than your saved data. Reload the page to continue; nothing has been lost.";

export class OutdatedTabError extends Error {
  constructor() {
    super(OUTDATED_TAB_MESSAGE);
    this.name = "VersionError";
  }
}
