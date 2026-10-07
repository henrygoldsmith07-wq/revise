// ---------------------------------------------------------------------------
// Plain-English evidence lines for Focus Mode.
//
// The specialist panels compute Wilson intervals, weighted trial counts and
// calibration slopes. Those stay available in Teacher mode; by default a
// student sees one sentence: how sure Revise is, and what would make it surer.
// Pure wording over numbers the panels already have.
// ---------------------------------------------------------------------------

export type PlainConfidence = "Low" | "Medium" | "High";

/** Weighted trials at which mastery-uncertainty stops asking for more evidence (mirrors mastery-uncertainty.ts). */
export const EVIDENCE_TARGET_TRIALS = 8;

export interface PlainEvidenceLine {
  level: PlainConfidence;
  /** Questions still needed before the estimate settles; 0 when enough. */
  moreNeeded: number;
  line: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "Confidence: Medium — do 2 more questions on this to be sure."
 * Confidence is the inverse of the interval's width; the next step counts the
 * questions left before the evidence threshold, rounded up.
 */
export function plainEvidenceLine(input: {
  uncertainty: "low" | "medium" | "high";
  evidence: number;
  target?: number;
  /** What one more piece of evidence is, e.g. "question" or "past paper". */
  unit?: string;
}): PlainEvidenceLine {
  const target = input.target ?? EVIDENCE_TARGET_TRIALS;
  const unit = input.unit ?? "question";
  const level: PlainConfidence = input.uncertainty === "low" ? "High" : input.uncertainty === "medium" ? "Medium" : "Low";
  const moreNeeded = Math.max(0, Math.ceil(target - Math.max(0, input.evidence)));
  const next =
    moreNeeded > 0
      ? `do ${plural(moreNeeded, `more ${unit}`)} on this to be sure`
      : level === "High"
        ? "there is enough evidence to trust this"
        : "keep practising — your answers are still mixed";
  return { level, moreNeeded, line: `Confidence: ${level} — ${next}.` };
}

/** A sample size in words: "3 answers so far (needs 8 to be reliable)". */
export function plainSampleLine(count: number, reliableAt: number, unit = "answer"): string {
  if (count >= reliableAt) return `${plural(count, unit)} — enough to rely on`;
  return `${plural(count, unit)} so far — needs ${reliableAt} to be reliable`;
}
