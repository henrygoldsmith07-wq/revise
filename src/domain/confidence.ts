// ---------------------------------------------------------------------------
// Confidence handling for marking, mastery, misconceptions, recommendations,
// predicted retention. States: high / moderate / low / insufficient evidence.
// Avoids fake precision — intervals and sample thresholds drive the label.
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "moderate" | "low" | "insufficient-evidence";

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  score: number | null; // 0..1 when measurable, null when insufficient
  reason: string;
  evidence: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Marking confidence: based on point coverage strength and agreement
export function markingConfidence(input: {
  evidenceStrengths: Array<"strong" | "partial" | "none">;
  markerAgreement?: number | null; // 0..1 exact agreement
  sampleSize?: number;
}): ConfidenceAssessment {
  const { evidenceStrengths, markerAgreement, sampleSize } = input;
  const n = evidenceStrengths.length;
  if (n === 0) return { level: "insufficient-evidence", score: null, reason: "No mark points to assess", evidence: 0 };
  const strong = evidenceStrengths.filter((s) => s === "strong").length;
  const partial = evidenceStrengths.filter((s) => s === "partial").length;
  // Weighted: strong=1, partial=0.5, none=0
  let score = (strong * 1 + partial * 0.5) / n;
  if (markerAgreement != null) score = score * 0.7 + markerAgreement * 0.3;
  score = clamp01(score);
  let level: ConfidenceLevel;
  if (sampleSize != null && sampleSize < 2) level = "insufficient-evidence";
  else if (score >= 0.75) level = "high";
  else if (score >= 0.5) level = "moderate";
  else if (score >= 0.25) level = "low";
  else level = "low";
  const reason =
    level === "high" ? "Strong evidence across mark points"
    : level === "moderate" ? "Mixed evidence — review partial points"
    : level === "low" ? "Weak evidence — human review recommended"
    : "Insufficient evidence to judge marking confidence";
  return { level, score: Math.round(score * 100) / 100, reason, evidence: n };
}

// Mastery confidence: based on evidence count and interval width
export function masteryConfidence(input: {
  trials: number; // cards + 2*attempts
  intervalWidth: number; // 0..1
}): ConfidenceAssessment {
  const { trials, intervalWidth } = input;
  if (trials < 3) return { level: "insufficient-evidence", score: null, reason: "Not enough attempts or cards yet", evidence: trials };
  const widthScore = 1 - Math.min(1, intervalWidth);
  const evidenceScore = Math.min(1, trials / 12);
  const score = widthScore * 0.6 + evidenceScore * 0.4;
  let level: ConfidenceLevel;
  if (trials < 8) level = "low";
  else if (score >= 0.7 && intervalWidth < 0.25) level = "high";
  else if (score >= 0.45) level = "moderate";
  else level = "low";
  const reason =
    level === "high" ? `Mastery estimate is stable (${trials} trials, narrow interval)`
    : level === "moderate" ? `Moderate confidence — interval width ${Math.round(intervalWidth * 100)}%`
    : level === "low" ? `Low confidence — widen interval or add ${Math.max(0, 8 - trials)} more trials`
    : "Insufficient evidence";
  return { level, score: Math.round(score * 100) / 100, reason, evidence: trials };
}

// Misconception confidence: based on recurrence and evidence
export function misconceptionConfidence(input: {
  occurrences: number;
  linkedToLibrary?: boolean;
}): ConfidenceAssessment {
  const { occurrences, linkedToLibrary } = input;
  if (occurrences === 0) return { level: "insufficient-evidence", score: null, reason: "No occurrences observed", evidence: 0 };
  if (occurrences === 1 && !linkedToLibrary) return { level: "low", score: 0.3, reason: "Single occurrence — early signal only", evidence: 1 };
  if (occurrences >= 3) return { level: "high", score: 0.85, reason: `Recurred ${occurrences} times`, evidence: occurrences };
  return { level: "moderate", score: 0.55, reason: `${occurrences} occurrence(s)`, evidence: occurrences };
}

// Recommendation confidence: based on evidence behind the weak topic
export function recommendationConfidence(input: {
  attempts: number;
  cardsTotal: number;
  retention?: number | null;
}): ConfidenceAssessment {
  const trials = input.cardsTotal + input.attempts * 2;
  if (trials < 2) return { level: "insufficient-evidence", score: null, reason: "No evidence for this topic yet", evidence: trials };
  if (trials < 6) return { level: "low", score: 0.35, reason: "Thin evidence — recommendation is exploratory", evidence: trials };
  if (trials >= 10 && input.retention != null) return { level: "high", score: 0.8, reason: "Well-evidenced weakness", evidence: trials };
  return { level: "moderate", score: 0.6, reason: "Moderate evidence", evidence: trials };
}

// Predicted retention confidence: based on review count and recency
export function retentionPredictionConfidence(input: {
  reviews: number;
  daysSinceLastReview?: number | null;
}): ConfidenceAssessment {
  const { reviews } = input;
  if (reviews < 5) return { level: "insufficient-evidence", score: null, reason: `Only ${reviews} reviews — need more`, evidence: reviews };
  if (reviews >= 20) return { level: "high", score: 0.85, reason: `${reviews} reviews — stable retention estimate`, evidence: reviews };
  if (reviews >= 10) return { level: "moderate", score: 0.6, reason: `${reviews} reviews`, evidence: reviews };
  return { level: "low", score: 0.35, reason: `Only ${reviews} reviews`, evidence: reviews };
}
