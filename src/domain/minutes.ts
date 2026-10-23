// ---------------------------------------------------------------------------
// One rule for how a minute estimate is shown. Today, the mission card, the
// command centre, the schedule and the session pages used to round the same
// estimate differently (Math.round, Math.ceil, or not at all), so one step
// could read "9 min" on one screen and "12 min" or "8.5 min" on another.
// Estimates are always rounded UP to a whole minute and never show as 0.
// ---------------------------------------------------------------------------

/** Whole minutes to show for an estimate: rounded up, at least 1 for any real work, 0 stays 0. */
export function displayMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(1, Math.ceil(minutes - 1e-9));
}

/** "about 9 min" for any estimate; the single phrase every screen uses. */
export function aboutMinutesLabel(minutes: number): string {
  const m = displayMinutes(minutes);
  return m > 0 ? `about ${m} min` : "no time needed";
}

/** Total of several estimates, rounded once (not each part), so a list and its total agree. */
export function totalDisplayMinutes(parts: readonly number[]): number {
  return displayMinutes(parts.reduce((sum, m) => sum + (Number.isFinite(m) ? m : 0), 0));
}
