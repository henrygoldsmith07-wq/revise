// Marking evidence, scores and escalation.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";

export type MarkEvidenceStatus = "credited" | "missed" | "unreported";
export type MarkEvidenceStrength = "strong" | "partial" | "none";

/** Deterministic explanation of the answer evidence behind one mark decision. */
export interface MarkEvidence {
  /** Exact mark-scheme point being explained. */
  point: string;
  status: MarkEvidenceStatus;
  /** Short excerpt from the submitted answer, or null when nothing matches. */
  evidence: string | null;
  evidenceStrength: MarkEvidenceStrength;
  /** 0–1 score from the same matching primitives used by offline marking. */
  confidence: number;
  explanation: string;
}

export interface MarkedPart {
  partId: Id;
  awarded: number;
  max: number;
  /** Which mark-scheme points the answer hit. */
  creditedPoints: string[];
  missedPoints: string[];
  comment: string;
  /** Per-point, answer-grounded rationale. Optional for older persisted attempts. */
  evidence?: MarkEvidence[];
}

/** Who the final mark ultimately rests on. */
export type MarkAuthority =
  /** The deterministic marker (MCQ key, rubric) produced the mark. */
  | "deterministic"
  /** A model suggested the mark and every deterministic check agreed. */
  | "ai-checked"
  /** A model suggested the mark and at least one check disagreed: provisional. */
  | "ai-provisional";

export type MarkConfidenceLevel = "high" | "medium" | "low";

/**
 * How far to trust a mark, recorded with the attempt so a reloaded result
 * keeps its provisional label. Produced by domain/marking-confidence.ts.
 */
export interface MarkAssessmentRecord {
  version: string;
  level: MarkConfidenceLevel;
  /** True whenever the mark must not be presented as an examiner's decision. */
  provisional: boolean;
  authority: MarkAuthority;
  /** Ids of the deterministic checks that did not pass. */
  failedChecks: string[];
  /** The model's self-reported confidence, kept separate from the system's. */
  modelConfidence: number | null;
}

export type MarkEscalationReason = "low-confidence" | "missing-confidence";
export type MarkEscalationPriority = "standard" | "urgent";

export interface MarkEscalation {
  status: "pending" | "resolved";
  reason: MarkEscalationReason;
  priority: MarkEscalationPriority;
  target: "human-review";
  /** 0–1 confidence returned by the marker; null means it was not supplied. */
  confidence: number | null;
  threshold: number;
  requestedAt: IsoInstant;
  resolvedAt?: IsoInstant;
  resolvedBy?: "human" | "rubric" | "ai";
}

export type FarTransferRetestStatus = "scheduled" | "due" | "completed";
export type FarTransferOutcomeBand = "secure" | "partial" | "not-secure";

export interface FarTransferOutcome {
  awarded: number;
  max: number;
  percentage: number;
  passed: boolean;
  band: FarTransferOutcomeBand;
  completedAt: IsoInstant;
}

/** Link stored on attempts so a delayed retest survives reload and sync. */
export interface FarTransferAttemptLink {
  retestId: Id;
  role: "source" | "retest";
  sourceAttemptId: Id;
  sourceQuestionId: Id;
  candidateQuestionId: Id;
  scheduledFor: IsoDate;
  delayDays: number;
  outcome?: FarTransferOutcome;
}

/** Human marking attestation for a paper response.
 *
 * Paper provenance and paper marking are separate trust dimensions: an
 * authenticated WJEC PDF does not make an automatically marked response a
 * gold outcome. The reviewer/date fields make that distinction explicit in
 * persisted attempts; adjudicated rows additionally record that two markers
 * were involved.
 */
export type PaperMarkingReviewStatus = "unreviewed" | "human-reviewed" | "adjudicated";

export interface PaperMarkingReview {
  status: PaperMarkingReviewStatus;
  reviewerId?: Id;
  reviewerRole?: "examiner" | "teacher" | "subject-expert";
  reviewerQualification?: string;
  reviewedAt?: IsoInstant;
  /** Number of qualified human markers whose marks contributed to this row. */
  markerCount?: number;
  /** Exact answer/marking fingerprint; mandatory for review-gated WJEC paper evidence. */
  markingFingerprint?: string;
}
