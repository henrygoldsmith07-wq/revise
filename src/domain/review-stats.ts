import { addLocalDays, localDayOfInstant, localDaysBetween } from "./local-date";
import { isStudiedCard } from "./scheduling";
import type { Card, IsoDate, ReviewLog } from "./types";

// ---------------------------------------------------------------------------
// Anki's two most-used statistics, from the cards and review logs already on
// the device:
//
// - "Future due": how many studied cards fall due on each of the coming days,
//   so a learner can see a heavy day coming and spread the work before it.
// - The review calendar: a heatmap of reviews per day over recent weeks.
//
// Both are counts of what happened or is scheduled. Neither predicts recall.
// ---------------------------------------------------------------------------

export interface ForecastDay {
  date: IsoDate;
  /** Studied cards due that day. Day 0 also holds every overdue card. */
  count: number;
}

export interface DueForecast {
  days: ForecastDay[];
  /** Cards already past their due date, included in day 0. */
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
  nextSevenDays: number;
  /** The busiest day in the window (first if tied), or null when nothing is due. */
  busiest: ForecastDay | null;
}

/**
 * Cards due on each of the next `days` days, starting today. Only cards the
 * learner has studied count: a never-studied card is new material, not a
 * review (`isStudiedCard`). Suspended cards never come due; a buried card
 * comes due on the day it is unburied.
 */
export function dueForecast(cards: readonly Card[], today: IsoDate, days = 30): DueForecast {
  const counts = new Array<number>(Math.max(1, days)).fill(0);
  let overdue = 0;
  for (const card of cards) {
    if (card.suspended || !isStudiedCard(card)) continue;
    let due = card.due;
    if (card.buriedUntil && card.buriedUntil > due) due = card.buriedUntil;
    const offset = localDaysBetween(today, due);
    if (offset < 0) overdue++;
    const index = Math.max(0, offset);
    if (index < counts.length) counts[index] = (counts[index] ?? 0) + 1;
  }
  const out = counts.map((count, index) => ({ date: addLocalDays(today, index), count }));
  const busiest = out.reduce<ForecastDay | null>((best, day) => (day.count > (best?.count ?? 0) ? day : best), null);
  return {
    days: out,
    overdue,
    dueToday: out[0]?.count ?? 0,
    dueTomorrow: out[1]?.count ?? 0,
    nextSevenDays: out.slice(0, 7).reduce((sum, day) => sum + day.count, 0),
    busiest,
  };
}

export interface CalendarDay {
  date: IsoDate;
  count: number;
  /** 0 for no reviews, then 1-4 by quartile of the active days' counts. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ReviewCalendar {
  /** Columns oldest first, Monday to Sunday; days after today are null. */
  weeks: (CalendarDay | null)[][];
  daysStudied: number;
  daysInRange: number;
  totalReviews: number;
  /** Mean reviews on the days with any. */
  averageOnStudyDays: number;
}

/** Monday of the week holding `day`. */
function mondayOf(day: IsoDate): IsoDate {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // calendar dates: weekday is zone-free
  return addLocalDays(day, -((weekday + 6) % 7));
}

/**
 * Reviews per local day over the last `weeks` weeks, ending this week.
 * Levels are relative to the learner's own active days, so a light reviewer's
 * calendar is not all pale against a fixed scale.
 */
export function reviewCalendar(logs: readonly Pick<ReviewLog, "reviewedAt">[], today: IsoDate, weeks = 26): ReviewCalendar {
  const start = addLocalDays(mondayOf(today), -7 * (Math.max(1, weeks) - 1));
  const perDay = new Map<IsoDate, number>();
  for (const log of logs) {
    const day = localDayOfInstant(log.reviewedAt);
    if (day < start || day > today) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const active = [...perDay.values()].sort((a, b) => a - b);
  const quartile = (q: number) => active[Math.floor(q * (active.length - 1))] ?? 0;
  const cuts = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const busiest = active.at(-1) ?? 0;
  const level = (count: number): CalendarDay["level"] => {
    if (count <= 0) return 0;
    if (count >= busiest) return 4; // the busiest day is always the darkest
    if (count <= cuts[0]!) return 1;
    if (count <= cuts[1]!) return 2;
    if (count <= cuts[2]!) return 3;
    return 4;
  };

  const columns: (CalendarDay | null)[][] = [];
  for (let week = 0; week < Math.max(1, weeks); week++) {
    const column: (CalendarDay | null)[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = addLocalDays(start, week * 7 + weekday);
      if (date > today) {
        column.push(null);
        continue;
      }
      const count = perDay.get(date) ?? 0;
      column.push({ date, count, level: level(count) });
    }
    columns.push(column);
  }

  const totalReviews = active.reduce((sum, count) => sum + count, 0);
  return {
    weeks: columns,
    daysStudied: active.length,
    daysInRange: localDaysBetween(start, today) + 1,
    totalReviews,
    averageOnStudyDays: active.length ? Math.round((totalReviews / active.length) * 10) / 10 : 0,
  };
}
