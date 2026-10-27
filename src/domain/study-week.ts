import type { IsoDate, RecallGrade, StreakState } from "./types";
import { addLocalDays, localDayOfInstant, localDaysBetween } from "./local-date";

// ---------------------------------------------------------------------------
// The visible rhythm of studying: which days this week had any recorded
// answer, the streak as it stands today, and the run of correct answers inside
// one session. Every value is derived from stored evidence (attempt and review
// instants), never from a counter that could drift from it.
// ---------------------------------------------------------------------------

export interface StudyDay {
  date: IsoDate;
  /** Single-letter weekday, Monday first. */
  letter: string;
  studied: boolean;
  isToday: boolean;
  future: boolean;
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Monday of the local week containing `day`. */
export function weekStart(day: IsoDate): IsoDate {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addLocalDays(day, -((weekday + 6) % 7));
}

/** Monday-to-Sunday for the week containing `today`, marking each day with any recorded answer. */
export function studyWeek(instants: readonly string[], today: IsoDate): StudyDay[] {
  const start = weekStart(today);
  const end = addLocalDays(start, 6);
  const studied = new Set<IsoDate>();
  for (const instant of instants) {
    const day = localDayOfInstant(instant);
    if (day >= start && day <= end) studied.add(day);
  }
  return LETTERS.map((letter, index) => {
    const date = addLocalDays(start, index);
    return { date, letter, studied: studied.has(date), isToday: date === today, future: date > today };
  });
}

/**
 * The streak as it stands today. The stored `current` is only rolled forward
 * on activity, so after a lapse it still holds the old run; past the one-day
 * grace that `touchStreak` allows, the honest answer is zero.
 */
export function liveStreak(streak: Pick<StreakState, "current" | "lastActiveDate">, today: IsoDate): number {
  if (!streak.lastActiveDate) return 0;
  const gap = localDaysBetween(streak.lastActiveDate, today);
  return gap <= 2 ? streak.current : 0;
}

/** A question counts towards a run only when every mark was earned. */
export function attemptExtendsRun(attempt: { awarded: number; max: number }): boolean {
  return attempt.max > 0 && attempt.awarded >= attempt.max;
}

/** A card counts towards a run when it was recalled ("good" or "easy"). */
export function gradeExtendsRun(grade: RecallGrade): boolean {
  return grade === "good" || grade === "easy";
}

/** Shown only from three in a row: one or two is ordinary, not a run. */
export const RUN_THRESHOLD = 3;

export function nextRun(run: number, extends_: boolean): number {
  return extends_ ? run + 1 : 0;
}

/** The run at the end of a sequence of hits and misses, newest last. */
export function trailingRun(hits: readonly boolean[]): number {
  let run = 0;
  for (const hit of hits) run = nextRun(run, hit);
  return run;
}
