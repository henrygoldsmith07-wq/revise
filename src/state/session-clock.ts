// Session fatigue clock — module-scoped, never render input.
//
// The recommender needs time-on-task to apply fatigue penalties. The clock
// starts on the first graded action and resets after 30 idle minutes. It lives
// outside React (like syncInFlight/hydrationEpoch in store.tsx) because it is
// coordination state for background derivation, not UI state.
//
// Writes: touchSessionClock() from review/record paths.
// Derived: currentActiveMinutes() read during recommend().

let sessionStartedAt: number | null = null;

export const SESSION_IDLE_RESET_MS = 30 * 60_000;

/** Record a graded action as session activity. */
export function touchSessionClock(now = Date.now()): void {
  if (sessionStartedAt == null || now - sessionStartedAt > SESSION_IDLE_RESET_MS) sessionStartedAt = now;
}

/** Minutes of continuous study in the current session (0 when none/idle-ended). */
export function currentActiveMinutes(now = Date.now()): number {
  if (sessionStartedAt == null) return 0;
  const elapsed = (now - sessionStartedAt) / 60_000;
  return elapsed > SESSION_IDLE_RESET_MS / 60_000 ? 0 : elapsed;
}
