// One deterministic comparison for study actions. Inputs are bounded signals,
// not claimed causal effects. Observed marks/hour is reported only when enough
// paired outcomes exist; a policy prior never becomes a student-facing forecast.

export type NextActionKind =
  | "adaptive-session" | "review-due" | "repair-mistake" | "relearn"
  | "practice-topic" | "practice-capability" | "transfer"
  | "timed-questions" | "past-paper" | "diagnose" | "delayed-retrieval";

export interface NextActionCandidate {
  id: string;
  kind: NextActionKind;
  subjectId: string;
  topicId?: string;
  minutes: number;
  /** All signals are in [0, 1]. A missing signal means no evidence, not zero ability. */
  signals: {
    weakness?: number;
    forgettingRisk?: number;
    retrievalPressure?: number;
    mistakePressure?: number;
    examUrgency?: number;
    examWeighting?: number;
    learningBenefit?: number;
    retentionBenefit?: number;
    diagnosticValue?: number;
    transferNeed?: number;
    evidenceConfidence?: number;
  };
  /** Paired delayed/paper outcome evidence, never an estimate from mastery. */
  observedMarksPerHour?: number;
  outcomeSamples?: number;
}

export interface NextActionValue {
  candidate: NextActionCandidate;
  /** Relative policy value; this is not a mark or a probability. */
  score: number;
  evidenceLevel: "limited" | "developing" | "strong";
  observedMarksPerHour: number | null;
  factors: Required<NextActionCandidate["signals"]> & { estimatedMinutes: number };
  reason: string;
}

const cap = (value: number | undefined): number =>
  value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value));

export function valueNextAction(candidate: NextActionCandidate): NextActionValue {
  const s = candidate.signals;
  const confidence = cap(s.evidenceConfidence);
  const factors = {
    weakness: cap(s.weakness), forgettingRisk: cap(s.forgettingRisk),
    retrievalPressure: cap(s.retrievalPressure), mistakePressure: cap(s.mistakePressure),
    examUrgency: cap(s.examUrgency), examWeighting: cap(s.examWeighting),
    learningBenefit: cap(s.learningBenefit), retentionBenefit: cap(s.retentionBenefit),
    diagnosticValue: cap(s.diagnosticValue), transferNeed: cap(s.transferNeed),
    evidenceConfidence: confidence,
    estimatedMinutes: Math.max(1, Number.isFinite(candidate.minutes) ? candidate.minutes : 20),
  };
  // Shrink a measured weakness towards a neutral prior when evidence is thin.
  // Diagnostic value grows in the same situation; unknown is never a failure.
  const weakness = confidence * factors.weakness + (1 - confidence) * 0.35;
  const diagnostic = factors.diagnosticValue * (1 - 0.65 * confidence);
  const opportunity =
    0.23 * weakness + 0.17 * factors.retrievalPressure +
    0.16 * factors.mistakePressure + 0.11 * factors.forgettingRisk +
    0.13 * factors.learningBenefit + 0.10 * factors.retentionBenefit +
    0.07 * diagnostic + 0.03 * factors.transferNeed;
  const urgency = 1 + 0.45 * factors.examUrgency * (0.5 + 0.5 * factors.examWeighting);
  const time = Math.max(0.75, Math.min(1.25, Math.sqrt(20 / factors.estimatedMinutes)));
  const observed = candidate.outcomeSamples != null && candidate.outcomeSamples >= 8 &&
    candidate.observedMarksPerHour != null && Number.isFinite(candidate.observedMarksPerHour) &&
    candidate.observedMarksPerHour >= 0 ? candidate.observedMarksPerHour : null;
  // Real delayed outcomes can refine the policy, but cannot overwhelm a
  // sparse sample or erase the immediate retention/diagnostic need.
  const outcomeAdjustment = observed == null ? 1 :
    0.9 + 0.2 * cap(observed / 12) * Math.min(1, (candidate.outcomeSamples ?? 0) / 24);
  const score = Math.round(opportunity * urgency * time * outcomeAdjustment * 10_000) / 10_000;
  const evidenceLevel = confidence < 0.35 ? "limited" : confidence < 0.75 ? "developing" : "strong";
  const reason = evidenceLevel === "limited"
    ? "Evidence is still limited; this step will help find the next gap."
    : factors.mistakePressure >= 0.5 ? "Based on your recent answers, repairing this gap has value."
    : factors.retrievalPressure >= 0.5 ? "A due retrieval will help protect what you learned."
    : factors.transferNeed >= 0.5 ? "Try this in a new context to check the skill holds."
    : "Based on your recent answers, this is a useful next step.";
  return { candidate, score, evidenceLevel, observedMarksPerHour: observed, factors, reason };
}

export function rankNextActions(candidates: readonly NextActionCandidate[]): NextActionValue[] {
  return candidates.map(valueNextAction).sort((a, b) =>
    b.score - a.score || a.factors.estimatedMinutes - b.factors.estimatedMinutes ||
    a.candidate.id.localeCompare(b.candidate.id));
}