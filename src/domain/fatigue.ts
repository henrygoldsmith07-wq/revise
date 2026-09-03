// ---------------------------------------------------------------------------
// Session-level fatigue lock.
//
// The planner's diminishing-returns curve (see effectiveMinutes) prices the
// first 25 minutes of continuous work at 100% and everything after at 75% and
// falling. Past that point a student still *answers*, but the answers stop
// being honest: grades given from a tired brain teach FSRS lies. This module
// turns that curve into the one thing a session UI needs — a lock and the
// sentence to show when it bites.
// ---------------------------------------------------------------------------

import { effectiveMinutes } from "./planner";

/** Continuous minutes before grades stop being trustworthy. */
export const FATIGUE_LOCK_MINUTES = 25;

export const FATIGUE_MESSAGE = "Memory quality drops if you continue.";

/**
 * Share of a fresh minute's memory value still on offer at this point in the
 * session: 1.0 while fresh, ~0.75 once the lock has engaged, falling after.
 */
export function memoryQuality(minutesIntoSession: number): number {
  if (minutesIntoSession <= 0) return 1;
  return effectiveMinutes(minutesIntoSession) / minutesIntoSession;
}

/** The lock: null while the session is fresh, then the stop message. */
export function fatigueLock(minutesIntoSession: number): { locked: boolean; message: string } | null {
  if (minutesIntoSession <= FATIGUE_LOCK_MINUTES) return null;
  return { locked: true, message: FATIGUE_MESSAGE };
}
