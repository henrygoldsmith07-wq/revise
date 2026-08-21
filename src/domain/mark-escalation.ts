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

  if (input.markedBy !== "ai") {
    return {
      escalate: false,
      status: "not-required",
      reason: null,
      priority: "none",
      target: null,
      confidence,
      threshold,
      message: "Rubric marking is deterministic and does not need a second-marker escalation.",
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
      message: "The AI mark did not return a confidence score — request human review before treating it as final.",
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
    message: `AI mark confidence is ${percentage(confidence)}, below the ${percentage(threshold)} threshold — request human review before treating it as final.`,
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
