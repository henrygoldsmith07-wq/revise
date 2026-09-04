"use client";

// ---------------------------------------------------------------------------
// Countdown phase banner for Today.
//
// Today answers "what should I do right now?" — and when an exam is inside
// the countdown window, the *strategy* is part of that answer: a subject two
// weeks out wants timed papers and weak-topic retests, one three days out
// wants light recall and sleep, not a new first pass. This banner shows the
// active phase and its one-line strategy for each subject within 42 days of
// an exam, with a link to the full run-up on Schedule. It renders nothing
// when no subject is inside the window — no dates, no invented urgency.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo } from "react";
import { getSubject } from "@/domain/curriculum";
import { countdownGuidance } from "@/domain/exam-countdown";
import { daysToExam } from "@/domain/recommender";
import { useStore } from "@/state/store";
import { Pill } from "@/components/ui";

/** Application phase and closer: weak-topic work and timed practice step up. */
const COUNTDOWN_WINDOW_DAYS = 42;

interface BannerRow {
  subjectId: string;
  name: string;
  days: number;
  label: string;
  strategy: string;
  tone: "neutral" | "accent" | "danger";
}

function toneFor(days: number): BannerRow["tone"] {
  if (days <= 3) return "danger"; // final days — protect sleep, light recall
  if (days <= 14) return "accent"; // technique fortnight — papers intensify
  return "neutral"; // application — closing gaps while there is still time
}

export function CountdownPhaseBanner() {
  const store = useStore();

  const rows = useMemo<BannerRow[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const out: BannerRow[] = [];
    for (const subjectId of store.settings.subjectIds) {
      const days = daysToExam(store.examDates, subjectId, today);
      if (days == null || days > COUNTDOWN_WINDOW_DAYS) continue;
      const guidance = countdownGuidance(days);
      const subject = getSubject(subjectId);
      out.push({
        subjectId,
        name: subject?.name ?? subjectId,
        days,
        label: guidance.label,
        strategy: guidance.strategy,
        tone: toneFor(days),
      });
    }
    return out.sort((a, b) => a.days - b.days);
  }, [store.settings.subjectIds, store.examDates]);

  if (!rows.length) return null;

  return (
    <section aria-label="Exam countdown" className="card px-4 py-3 space-y-2.5">
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Exam countdown</p>
      {rows.map((row) => (
        <div key={row.subjectId} className="space-y-0.5">
          <p className="text-sm font-semibold text-ink">
            {row.name}{" "}
            <Pill tone={row.tone}>{row.label}</Pill>
            <span className="text-[11px] font-normal text-ink3 ml-1">
              — exam {row.days === 0 ? "today" : row.days === 1 ? "tomorrow" : `in ${row.days} days`}
            </span>
          </p>
          <p className="text-[11px] text-ink3 leading-snug">{row.strategy}</p>
        </div>
      ))}
      <Link href="/schedule" className="block text-xs text-ink2 hover:text-ink underline mt-1">
        See the full run-up on Schedule →
      </Link>
    </section>
  );
}
