"use client";

// Persistent but dismissible exam-date nudge. Shown on Today only when an
// enrolled subject has no exam date: the planner degrades gracefully without
// dates (urgency simply drops out), so this is a quiet prompt, never a gate.
// Dismissal is per device; dates themselves live in Settings.

import { useState } from "react";
import Link from "next/link";
import { useStoreFields } from "@/state/store";

const DISMISS_KEY = (userId: string) => `revise.exam-date-nudge.dismissed.${userId}`;

function dismissed(userId: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY(userId)) === "1";
  } catch {
    return false;
  }
}

export function ExamDateNudge() {
  const { userId, examDates, settings } = useStoreFields("userId", "examDates", "settings");
  const [gone, setGone] = useState(() => dismissed(userId));
  if (gone) return null;
  const missing = settings.subjectIds.filter(
    (id) => !examDates.some((e) => e.subjectId === id),
  );
  if (!missing.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink3" role="status">
      <span>
        {missing.length === 1
          ? "No exam date yet — urgency is not a factor in your plan."
          : "No exam dates yet — urgency is not a factor in your plan."}
      </span>
      <Link href="/settings" className="font-medium text-ink2 underline underline-offset-4 hover:text-ink">
        Add dates
      </Link>
      <button
        type="button"
        className="underline underline-offset-4 hover:text-ink"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY(userId), "1");
          } catch {
            // Dismissal is a nicety; the nudge simply returns next visit.
          }
          setGone(true);
        }}
      >
        Dismiss
      </button>
    </p>
  );
}
