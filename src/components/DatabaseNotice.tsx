"use client";

import { useSyncExternalStore } from "react";
import { DATABASE_NOTICE_COPY, currentDatabaseNotice, subscribeDatabaseNotice } from "@/data/db-notice";

/**
 * Cross-tab IndexedDB version notice (see src/data/db-notice.ts). Rendered
 * outside the account boundary so it shows over the "opening your profile"
 * placeholder too, which is exactly where a blocked upgrade used to hang.
 */
export function DatabaseNotice() {
  const notice = useSyncExternalStore(subscribeDatabaseNotice, currentDatabaseNotice, () => null);
  if (!notice) return null;
  return (
    <div
      role="alert"
      data-database-notice={notice}
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-b border-line bg-surface px-4 py-3 text-sm text-ink shadow-sm"
    >
      <p className="max-w-2xl">{DATABASE_NOTICE_COPY[notice]}</p>
      {notice === "stale" ? (
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      ) : null}
    </div>
  );
}
