"use client";

import { useMemo, useState } from "react";
import { countLabel } from "@/domain/plural";
import { dueForecast, reviewCalendar, type CalendarDay } from "@/domain/review-stats";
import { todayIso } from "@/domain/scheduling";
import type { Card, ReviewLog } from "@/domain/types";
import { DeckStatsPanel } from "./CardStatsPanel";
import { Button, Panel, StatTile, cx } from "./ui";

// Anki's statistics screen, from what is already on the device: when cards
// fall due ("Future due"), which days you reviewed (the calendar), and the
// deck's own numbers (true retention, card states, grade mix).

const LEVEL_CLASS: Record<CalendarDay["level"], string> = {
  0: "bg-surface2",
  1: "bg-accent/25",
  2: "bg-accent/50",
  3: "bg-accent/75",
  4: "bg-accent",
};

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

function dayLabel(date: string, withWeekday = true): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    ...(withWeekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function FlashcardStatistics({ cards, logs, target }: { cards: Card[]; logs: ReviewLog[]; target: number }) {
  const today = todayIso();
  const forecast = useMemo(() => dueForecast(cards, today, 30), [cards, today]);
  const calendar = useMemo(() => reviewCalendar(logs, today, 26), [logs, today]);
  const [showTables, setShowTables] = useState(false);
  const peak = Math.max(1, ...forecast.days.map((day) => day.count));

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Cards due, next 30 days</h3>
          <p className="text-[11px] text-ink3">
            Studied cards only. Today includes {countLabel(forecast.overdue, "overdue card")}.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Today" value={forecast.dueToday} />
          <StatTile label="Tomorrow" value={forecast.dueTomorrow} />
          <StatTile label="Next 7 days" value={forecast.nextSevenDays} />
        </div>
        <div className="flex items-end gap-[2px] h-24" role="img" aria-label={forecastSummary(forecast.days.map((d) => d.count), forecast.busiest)}>
          {forecast.days.map((day, index) => (
            <span
              key={day.date}
              title={`${dayLabel(day.date)}: ${countLabel(day.count, "card")} due`}
              className="relative flex-1 h-full flex items-end group"
            >
              <span
                className={cx("block w-full rounded-t-xs", day.count ? (index === 0 ? "bg-review" : "bg-accent") : "bg-line h-px")}
                style={day.count ? { height: `${Math.max(4, (day.count / peak) * 100)}%` } : undefined}
              />
            </span>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-ink3 tabular-nums">
          <span>Today</span>
          <span>{dayLabel(forecast.days[14]?.date ?? today, false)}</span>
          <span>{dayLabel(forecast.days.at(-1)?.date ?? today, false)}</span>
        </div>
        {forecast.busiest && forecast.busiest.count > forecast.dueToday ? (
          <p className="text-xs text-ink2">
            Busiest day: {dayLabel(forecast.busiest.date)}, {countLabel(forecast.busiest.count, "card")}. Reviewing a few
            early (Custom study) spreads it out.
          </p>
        ) : null}
      </Panel>

      <Panel className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Review calendar, last 26 weeks</h3>
          <p className="text-[11px] text-ink3">
            Studied on {calendar.daysStudied} of {calendar.daysInRange} days
            {calendar.daysStudied ? ` · ${countLabel(calendar.averageOnStudyDays, "review")} a day when you studied` : ""}.
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="grid grid-rows-7 gap-[2px] text-[9px] text-ink3 leading-none" aria-hidden>
            {WEEKDAYS.map((label, index) => (
              <span key={index} className="flex items-center">{label}</span>
            ))}
          </div>
          <div
            className="flex-1 grid grid-flow-col grid-rows-7 gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))` }}
            role="img"
            aria-label={`Reviews per day over the last 26 weeks: ${countLabel(calendar.totalReviews, "review")} on ${countLabel(calendar.daysStudied, "day")}.`}
          >
            {calendar.weeks.flatMap((week, w) =>
              week.map((day, d) =>
                day ? (
                  <span
                    key={day.date}
                    title={`${dayLabel(day.date)}: ${countLabel(day.count, "review")}`}
                    className={cx("aspect-square rounded-xs", LEVEL_CLASS[day.level])}
                  />
                ) : (
                  <span key={`empty-${w}-${d}`} className="aspect-square" />
                ),
              ),
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 text-[10px] text-ink3" aria-hidden>
          <span>Fewer</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} className={cx("inline-block h-2.5 w-2.5 rounded-xs", LEVEL_CLASS[level])} />
          ))}
          <span>More</span>
        </div>
      </Panel>

      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowTables((open) => !open)} aria-expanded={showTables}>
          {showTables ? "Hide the numbers" : "Show the numbers as tables"}
        </Button>
        {showTables ? (
          <div className="grid sm:grid-cols-2 gap-3 mt-2 text-xs">
            <table className="w-full">
              <caption className="text-left font-semibold text-ink2 mb-1">Cards due by day</caption>
              <thead><tr><th scope="col" className="text-left text-ink3">Day</th><th scope="col" className="text-right text-ink3">Cards</th></tr></thead>
              <tbody>
                {forecast.days.filter((day) => day.count).map((day) => (
                  <tr key={day.date} className="border-t border-line"><td>{dayLabel(day.date)}</td><td className="text-right tabular-nums">{day.count}</td></tr>
                ))}
              </tbody>
            </table>
            <table className="w-full">
              <caption className="text-left font-semibold text-ink2 mb-1">Reviews by day studied</caption>
              <thead><tr><th scope="col" className="text-left text-ink3">Day</th><th scope="col" className="text-right text-ink3">Reviews</th></tr></thead>
              <tbody>
                {calendar.weeks.flat().filter((day): day is CalendarDay => Boolean(day?.count)).reverse().map((day) => (
                  <tr key={day.date} className="border-t border-line"><td>{dayLabel(day.date)}</td><td className="text-right tabular-nums">{day.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <DeckStatsPanel cards={cards} logs={logs} target={target} />
    </div>
  );
}

function forecastSummary(counts: number[], busiest: { date: string; count: number } | null): string {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return busiest
    ? `${countLabel(total, "card")} due over the next 30 days; busiest ${dayLabel(busiest.date)} with ${busiest.count}.`
    : "No studied cards due in the next 30 days.";
}
