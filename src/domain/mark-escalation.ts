import type {
  Attempt,
  MarkEscalation,
  MarkEscalationPriority,
  MarkEscalationReason,
  IsoInstant,
} from "./types";

export const LOW_CONFIDENCE_MARK_THRESHOLD = 0.6;
export const URGENT_MARK_CONFIDENCE_THRESHOLD = 0.3;

export interface LowConfidenceMarkInput {
  markedBy: Attempt["markedBy"];
  confidence?: number | null;
  threshold?: number;
}

export interface LowConfidenceMarkDecision {
  escalate: boolean;
  status: "pending" | "not-required";
  reason: MarkEscalationReason | null;
  priority: MarkEscalationPriority | "none";
  target: MarkEscalation["target"] | null;
  confidence: number | null;
  threshold: number;
  message: string;
}

export interface MarkEscalationReport {
  totalAttempts: number;
  aiAttempts: number;
  escalatedAttempts: number;
  pendingAttempts: number;
  resolvedAttempts: number;
  urgentAttempts: number;
  escalationRate: number | null;
}

function normaliseConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function thresholdOrDefault(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : LOW_CONFIDENCE_MARK_THRESHOLD;
}

function percentage(value: number | null): string {
  return value === null ? "unknown" : `${Math.round(value * 100)}%`;
}

export function assessLowConfidenceMark(input: LowConfidenceMarkInput): LowConfidenceMarkDecision {
  const confidence = normaliseConfidence(input.confidence);
  const threshold = thresholdOrDefault(input.threshold);

  // Rubric marks are deterministic, but evidence-derived confidence can still
  // be low (partial-strength credits, missed points showing partial evidence) —
  // those go to the same review queue. No confidence at all stays not-required.
  if (input.markedBy !== "ai" && input.confidence == null) {
    return {
      escalate: false,
      status: "not-required",
      reason: null,
      priority: "none",
      target: null,
      confidence,
      threshold,
      message: "Rubric marking with full-strength evidence does not need a second-marker escalation.",
    };
  }

  if (confidence === null) {
    return {
      escalate: true,
      status: "pending",
      reason: "missing-confidence",
      priority: "urgent",
      target: "human-review",
      confidence: null,
      threshold,
      // Nothing in the product sends a mark to a person, so the wording never
      // says a review was requested: only that the mark is left out.
      message: "The AI marker did not say how sure it was of this mark, so it is provisional and left out of your progress.",
    };
  }

  if (confidence >= threshold) {
    return {
      escalate: false,
      status: "not-required",
      reason: null,
      priority: "none",
      target: null,
      confidence,
      threshold,
      message: `AI mark confidence is ${percentage(confidence)}, meeting the ${percentage(threshold)} review threshold.`,
    };
  }

  const priority: MarkEscalationPriority = confidence < URGENT_MARK_CONFIDENCE_THRESHOLD ? "urgent" : "standard";
  return {
    escalate: true,
    status: "pending",
    reason: "low-confidence",
    priority,
    target: "human-review",
    confidence,
    threshold,
    // Nothing in the product sends a mark to a person, AI or device: the
    // record is kept so the answer is left out of progress, and the wording
    // says only that. (It used to say "request human review" for an AI mark.)
    message: input.markedBy === "ai"
      ? `The AI marker was only ${percentage(confidence)} sure of this mark, below the ${percentage(threshold)} it needs, so the mark is provisional and left out of your progress.`
      : `The match between this answer and the mark scheme was too weak to be sure of the mark (${percentage(confidence)}, below the ${percentage(threshold)} needed), so it is left out of your progress either way.`,
  };
}

export function createMarkEscalationRecord(
  decision: LowConfidenceMarkDecision,
  requestedAt: IsoInstant,
): MarkEscalation | undefined {
  if (!decision.escalate || !decision.reason || !decision.target || decision.priority === "none") return undefined;
  return {
    status: "pending",
    reason: decision.reason,
    priority: decision.priority,
    target: decision.target,
    confidence: decision.confidence,
    threshold: decision.threshold,
    requestedAt,
  };
}

export function markEscalationReport(
  attempts: readonly Pick<Attempt, "markedBy" | "markConfidence" | "markEscalation">[],
): MarkEscalationReport {
  const aiAttempts = attempts.filter((attempt) => attempt.markedBy === "ai").length;
  const escalated = attempts.filter((attempt) => Boolean(attempt.markEscalation));
  const pendingAttempts = escalated.filter((attempt) => attempt.markEscalation?.status === "pending").length;
  const resolvedAttempts = escalated.filter((attempt) => attempt.markEscalation?.status === "resolved").length;
  const urgentAttempts = escalated.filter((attempt) => attempt.markEscalation?.priority === "urgent").length;

  return {
    totalAttempts: attempts.length,
    aiAttempts,
    escalatedAttempts: escalated.length,
    pendingAttempts,
    resolvedAttempts,
    urgentAttempts,
    escalationRate: aiAttempts ? escalated.length / aiAttempts : null,
  };
}
