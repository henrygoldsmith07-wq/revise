import { computeDecayFactor, default_w } from "ts-fsrs";

// --- desired retention ------------------------------------------------------
//
// FSRS schedules each review for the day predicted recall falls to a target,
// the "desired retention". Anki exposes it as the main FSRS setting: a higher
// target means you remember more and review more, a lower one the opposite.
// Revise used a fixed 90%. The learner can now choose it (UserSettings.
// desiredRetention), and every grade records the target it was scheduled with
// (CardGradeEvent.retention), so a sync replay rebuilds the same due date on
// every device instead of falling back to 90%.
//
// The target only moves the interval. Stability and difficulty depend on the
// grade and on predicted recall at the moment of review, never on the target,
// so mastery, readiness and the forgetting curve are unchanged by it.

export const DEFAULT_DESIRED_RETENTION = 0.9;
/** What Settings offers. Anki suggests staying between about 80% and 95%. */
export const DESIRED_RETENTION_OPTIONS = [0.8, 0.85, 0.9, 0.95] as const;
/** Bounds for a stored or suggested value. Above ~97% the review load grows without limit. */
export const MIN_DESIRED_RETENTION = 0.7;
export const MAX_DESIRED_RETENTION = 0.97;

/** The learner's target, falling back to 90% for a missing or out-of-range value. Rounded to whole percent. */
export function desiredRetention(setting: number | undefined | null): number {
  if (typeof setting !== "number" || !Number.isFinite(setting)) return DEFAULT_DESIRED_RETENTION;
  if (setting < MIN_DESIRED_RETENTION || setting > MAX_DESIRED_RETENTION) return DEFAULT_DESIRED_RETENTION;
  return Math.round(setting * 100) / 100;
}

const CURVE = computeDecayFactor(default_w);

/** Days until recall falls to `retention` for a card of the given stability, on the FSRS-6 default curve. */
function daysToRetention(retention: number, stabilityDays: number): number {
  return (stabilityDays / CURVE.factor) * (Math.pow(retention, 1 / CURVE.decay) - 1);
}

/**
 * How much longer (or shorter) intervals run at `retention` than at 90%, for
 * the same card: 0.8 gives about 3.3x, 0.95 about 0.4x. Interval length, not a
 * workload forecast: the number of reviews also depends on how often you
 * forget, which the target changes too.
 */
export function intervalScale(retention: number): number {
  return daysToRetention(desiredRetention(retention), 1) / daysToRetention(DEFAULT_DESIRED_RETENTION, 1);
}

/** "80%" for 0.8. */
export function retentionLabel(retention: number): string {
  return `${Math.round(retention * 100)}%`;
}

/** One line for Settings: what this target does to intervals. */
export function retentionEffect(retention: number): string {
  const value = desiredRetention(retention);
  if (value === DEFAULT_DESIRED_RETENTION) return "The standard FSRS target.";
  const scale = intervalScale(value);
  return scale > 1
    ? `Gaps between reviews about ${scale.toFixed(1)}× longer than at 90%: fewer reviews, more forgotten.`
    : `Gaps between reviews about ${(1 / scale).toFixed(1)}× shorter than at 90%: more reviews, less forgotten.`;
}
