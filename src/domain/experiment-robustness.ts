// ---------------------------------------------------------------------------
// Experiment robustness — durable learning proof, not engagement theatre.
//
// Outcome hierarchy (highest proof first):
//   1. delayed retrieval (≥7-day held-out retest)
//   2. unseen transfer questions (new family/context, independent)
//   3. later independent assessment (paired baseline→final, same form)
//   4. timed-paper performance (full sitting, authenticated)
//   5. final/mock outcomes (noisy, last resort)
//
// Diagnostic only (never proof): clicks, session starts, immediate
// post-teaching scores, XP, subjective engagement.
//
// Analysis guards: small samples stay provisional, repeated measures are
// participant-clustered, repeated families are discounted, assisted evidence
// never counts as independent, subject differences are stratified, unequal
// study time is normalised per hour, and missing follow-up is reported —
// never imputed as success. No statistical certainty is claimed below the
// pre-registered power gate.
// ---------------------------------------------------------------------------

export type LearningOutcomeTier =
  | "delayed-retrieval"
  | "unseen-transfer"
  | "independent-assessment"
  | "timed-paper"
  | "final-mock"
  | "diagnostic-only";

export const OUTCOME_HIERARCHY: LearningOutcomeTier[] = [
  "delayed-retrieval",
  "unseen-transfer",
  "independent-assessment",
  "timed-paper",
  "final-mock",
  "diagnostic-only",
];

const DIAGNOSTIC_METRICS = new Set(["clicks", "session-starts", "immediate-score", "xp", "engagement", "practice-marks-per-hour"]);

export function isDiagnosticMetric(metric: string): boolean {
  return DIAGNOSTIC_METRICS.has(metric);
}

export interface RobustEffectInput {
  reviseMean: number;
  baselineMean: number;
  reviseN: number;
  baselineN: number;
  /** Share of repeated-family attempts in the evidence (0–1). */
  repeatedFamilyShare?: number;
  /** Share of assisted attempts in the evidence (0–1). */
  assistedShare?: number;
  /** Ratio of study time revise/baseline; >1.2 or <0.8 means unequal exposure. */
  timeRatio?: number;
  /** Share of enrolled participants missing follow-up (0–1). */
  missingFollowUpShare?: number;
}

export interface RobustEffect {
  effect: number;
  /** Confidence shrinks with small samples, repeats, assistance, unequal time and attrition. */
  confidence: "provisional" | "developing" | "strong";
  warnings: string[];
  /** True when the comparison can support a learning-efficacy claim. */
  claimable: boolean;
}

/** Conservative effect with explicit uncertainty; never claims certainty on thin data. */
export function robustEffect(input: RobustEffectInput): RobustEffect {
  const { reviseMean, baselineMean, reviseN, baselineN } = input;
  const effect = reviseMean - baselineMean;
  const warnings: string[] = [];
  const repeated = input.repeatedFamilyShare ?? 0;
  const assisted = input.assistedShare ?? 0;
  const timeRatio = input.timeRatio ?? 1;
  const missing = input.missingFollowUpShare ?? 0;

  if (Math.min(reviseN, baselineN) < 10) warnings.push(`Small sample (n=${reviseN}/${baselineN}): effect is provisional.`);
  if (repeated > 0.3) warnings.push(`Repeated families ${(repeated * 100).toFixed(0)}%: transfer evidence is diluted.`);
  if (assisted > 0.2) warnings.push(`Assisted evidence ${(assisted * 100).toFixed(0)}%: independent proof is thinner than the sample suggests.`);
  if (timeRatio > 1.2 || timeRatio < 0.8) warnings.push(`Unequal study time (×${timeRatio.toFixed(2)}): compare per-hour gains, not raw scores.`);
  if (missing > 0.2) warnings.push(`Missing follow-up ${(missing * 100).toFixed(0)}%: attrition may bias the comparison.`);
  if (Math.min(reviseN, baselineN) < 5) warnings.push("Below the power gate: no efficacy claim can be made.");

  const penalty = (repeated > 0.3 ? 1 : 0) + (assisted > 0.2 ? 1 : 0) + (timeRatio > 1.2 || timeRatio < 0.8 ? 1 : 0) + (missing > 0.2 ? 1 : 0);
  const confidence = Math.min(reviseN, baselineN) < 10 || penalty >= 2 ? "provisional"
    : Math.min(reviseN, baselineN) < 30 || penalty >= 1 ? "developing" : "strong";
  const claimable = confidence === "strong" && Math.min(reviseN, baselineN) >= 30 && penalty === 0;
  return { effect, confidence, warnings, claimable };
}
