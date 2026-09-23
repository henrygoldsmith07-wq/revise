"use client";

import Link from "next/link";
import { useStore } from "@/state/store";

// ---------------------------------------------------------------------------
// One-time exam-phase notice for Today.
//
// The timed-paper fortnight is a *transition*, and the student should hear
// about it on the day it happens — "Biology has entered the timed-paper
// fortnight." Store.refreshPhaseNotices (fired from Today's mount) turns a
// subject newly inside the ≤14-day window into exactly one notice: markers in
// the synced settings make it one-time per run-up, so a reload never re-shows
// it, while an exam date pushed back out of the window re-arms it for the
// next genuine entry. This banner is purely presentational: it reads the
// transient notice from the store and lets the student dismiss it.
// ---------------------------------------------------------------------------

export function PhaseEntryNotice() {
  const store = useStore();
  const notice = store.examPhaseNotice;
  if (!notice) return null;
  return (
    <section aria-label="Exam phase notice" role="status" className="card px-4 py-3 border-l-2 border-l-accent">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{notice.title}</p>
          <p className="text-[11px] text-ink3 leading-snug">{notice.body}</p>
          <Link href="/schedule" className="block text-xs text-ink2 hover:text-ink underline mt-1">
            See the re-weighted run-up on Schedule →
          </Link>
        </div>
        <button
          type="button"
          aria-label="Dismiss this notice"
          onClick={() => void store.dismissExamPhaseNotice()}
          className="text-ink3 hover:text-ink text-lg leading-none shrink-0 px-1 -mt-0.5"
        >
          ×
        </button>
      </div>
    </section>
  );
}
