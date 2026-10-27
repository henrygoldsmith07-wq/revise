"use client";

import { useMemo } from "react";
import { useStoreFields } from "@/state/store";
import { liveStreak, studyWeek } from "@/domain/study-week";
import { todayLocal } from "@/domain/local-date";
import { CreditedIcon, ICON_SIZE, StreakIcon } from "@/components/icons";
import { cx } from "@/components/ui";

/**
 * This week at a glance: a day is filled when it holds any marked answer or
 * reviewed card, so the row is the record, not a promise. Hidden until there
 * is something to show, so a new student is not greeted by seven empty boxes.
 */
export function StudyWeek() {
  const { attempts, reviewLogs, streak } = useStoreFields("attempts", "reviewLogs", "streak");
  const today = todayLocal();
  const week = useMemo(
    () => studyWeek([...attempts.map((a) => a.createdAt), ...reviewLogs.map((r) => r.reviewedAt)], today),
    [attempts, reviewLogs, today],
  );
  const run = liveStreak(streak, today);
  const studied = week.filter((day) => day.studied).length;
  if (!studied && !run) return null;

  return (
    <section aria-label="This week" className="card p-4" data-testid="study-week">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          {studied} {studied === 1 ? "day" : "days"} studied this week
        </p>
        {run > 1 ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink tabular-nums">
            <StreakIcon size={ICON_SIZE.sm} aria-hidden="true" />
            {run}-day streak
          </span>
        ) : null}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {week.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-1">
            <span
              className={cx(
                "grid h-8 w-full place-items-center rounded-lg border",
                day.studied ? "border-accent bg-accent text-onaccent" : "border-line",
                day.future && "border-dashed opacity-60",
                day.isToday && !day.studied && "border-ink2",
              )}
            >
              {day.studied ? <CreditedIcon size={ICON_SIZE.sm} /> : null}
            </span>
            <span className={cx("text-[11px] text-ink3", day.isToday && "font-semibold text-ink")}>{day.letter}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
