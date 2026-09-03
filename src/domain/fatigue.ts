import type { ActivityKind } from "./types";

// ---------------------------------------------------------------------------
// Fatigue & circadian context for the recommender.
//
// Marks-per-hour is measured on a fresh mind; a student two hours into an
// evening session does not convert time into marks at that rate, and complex
// application questions are the first thing to fall apart when tired. The
// recommender therefore multiplies each candidate's score by a fatigue factor
// that (a) falls with time-on-task, (b) falls late at night, and (c) punishes
// high-cognitive-load activities harder than low-load recall work — so at
// 22:30 after a long session, flashcard reviews outrank new exam practice.
//
// Pure functions only: the store supplies the clock and the session timer, so
// tests can pin behaviour at any hour without faking the system time.
// ---------------------------------------------------------------------------

/** Activities ranked by cognitive load (higher load = more fatigue-sensitive). */
export const ACTIVITY_LOAD: Record<ActivityKind, number> = {
  recall: 0.4,
  flashcards: 0.5,
  learn: 0.8,
  mistakes: 0.9,
  practice: 1.0,
  paper: 1.0,
};

export interface FatigueContext {
  /** How many minutes the student has been active in this session so far. */
  activeMinutes: number;
  /** Local hour of day, 0–23 (recommend() passes `now.getHours()`). */
  hourOfDay: number;
}

export interface FatiguePenalty {
  /** Multiplier in [FATIGUE_FLOOR, 1] to apply to the recommendation score. */
  factor: number;
  /** Per-activity multipliers for the explanation UI. */
  detail: { activity: ActivityKind; factor: number }[];
}

/** Multiplier floor so fatigue can demote but never erase an option. */
export const FATIGUE_FLOOR = 0.5;
/** Minutes of sustained study before fatigue begins to bite. */
export const FATIGUE_RAMP_MINUTES = 45;
/** Minutes after which fatigue is fully applied for the heaviest load. */
export const FATIGUE_FULL_MINUTES = 150;
/** Local hour at which the circadian penalty starts ramping (10 PM). */
export const CIRCADIAN_START_HOUR = 22;
/** Local hour at which the late-night penalty peaks. */
export const CIRCADIAN_PEAK_HOUR = 24;
/** Late-night penalty ramps through the small hours too. */
export const CIRCADIAN_WRAP_HOUR = 5;

/** 0 (fresh) → 1 (fully fatigued) from time-on-task alone. */
export function sessionFatigue(activeMinutes: number): number {
  if (activeMinutes <= FATIGUE_RAMP_MINUTES) return 0;
  return Math.min(1, (activeMinutes - FATIGUE_RAMP_MINUTES) / (FATIGUE_FULL_MINUTES - FATIGUE_RAMP_MINUTES));
}

/** 0 (daytime) → 1 (deepest night) from the clock alone. */
export function circadianFatigue(hourOfDay: number): number {
  const hour = ((hourOfDay % 24) + 24) % 24;
  if (hour >= CIRCADIAN_START_HOUR) {
    // 22:00→24:00 ramps 0→1.
    return (hour - CIRCADIAN_START_HOUR) / (CIRCADIAN_PEAK_HOUR - CIRCADIAN_START_HOUR);
  }
  if (hour < CIRCADIAN_WRAP_HOUR) {
    // 00:00 holds the peak, easing back to 0 by 05:00.
    return 1 - hour / CIRCADIAN_WRAP_HOUR;
  }
  return 0;
}

/**
 * Combined fatigue multiplier for one activity under one context.
 * Time-on-task and late-hour compound, then the load scales the damage:
 * heavy activities (practice/paper) drop most, recall/flashcards least.
 * Never below FATIGUE_FLOOR and exactly 1 when fresh + daytime.
 */
export function fatigueFactor(activity: ActivityKind, context: FatigueContext): number {
  const load = ACTIVITY_LOAD[activity];
  const combined = Math.min(1, sessionFatigue(context.activeMinutes) + circadianFatigue(context.hourOfDay));
  if (combined <= 0) return 1;
  const penalised = 1 - combined * 0.5 * load;
  return Math.max(FATIGUE_FLOOR, penalised);
}

/**
 * Score multiplier per activity for a whole recommendation list: returns the
 * worst-case factor (the activity's own) so callers can demote consistently,
 * plus the detail rows for the explanation UI.
 */
export function fatiguePenalty(context: FatigueContext): FatiguePenalty {
  const activities: ActivityKind[] = ["learn", "flashcards", "recall", "practice", "paper", "mistakes"];
  const detail = activities.map((activity) => ({ activity, factor: round3(fatigueFactor(activity, context)) }));
  // The list-level factor is the heaviest-load one — practice — because that
  // is the tier the recommender would otherwise always put first.
  return { factor: round3(fatigueFactor("practice", context)), detail };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
