// Student-facing wording for numbers that come from uncertain heuristics.
// Counts and marks that are simply recorded stay exact; confidence values,
// estimated rates and forecasts are shown as words or deliberately coarse values.

export type ConfidenceWord = "low" | "moderate" | "high";

/** Cut points for a 0–1 confidence: below `low` is low, below `high` is moderate. */
export interface ConfidenceScale { low: number; high: number }
/** Marker confidence: 0.6 is already the escalation threshold used for marks. */
export const MARK_CONFIDENCE: ConfidenceScale = { low: 0.6, high: 0.8 };
/** Evidence confidence, matching the tone cut points the readiness cards already use. */
export const EVIDENCE_CONFIDENCE: ConfidenceScale = { low: 0.35, high: 0.65 };

export function confidenceWord(value: number | null | undefined, scale: ConfidenceScale = MARK_CONFIDENCE): ConfidenceWord | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value < scale.low ? "low" : value < scale.high ? "moderate" : "high";
}

/** A 0–1 rate as a coarse percentage: nearest 5, never implying more precision. */
export function nearestFive(rate: number): number {
  const percent = Math.max(0, Math.min(100, rate * 100));
  return Math.round(percent / 5) * 5;
}

export function roughPercent(rate: number): string {
  return `about ${nearestFive(rate)}%`;
}
