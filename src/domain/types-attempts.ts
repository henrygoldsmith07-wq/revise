// Learner attempts, working analysis and intervention records.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoInstant } from "./types-base";
import type { MarkedPart, MarkAssessmentRecord, MarkEscalation, FarTransferAttemptLink, PaperMarkingReview } from "./types-marking";

/** Which Exam Mission, stage and weakness an attempt was made for, so its effect can be measured later. */
export interface MissionAttemptContext {
  missionId: string;
  stage: "diagnose" | "repair" | "practise" | "apply" | "transfer" | "delayed-proof";
  /** The repair/practice method used, e.g. "technique-intervention". */
  intervention: string | null;
  /** Root cause the mission targets, e.g. "unit-error". */
  targetCause: string | null;
  sourceMistakeIds: Id[];
}

export interface Attempt {
  id: Id;
  userId: Id;
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  /** Keyed by part id; MCQ attempts use the single part id. */
  answers: Record<Id, string>;
  marked: MarkedPart[];
  awarded: number;
  max: number;
  /** Examiner-style prose, ready to show verbatim. */
  feedback: string;
  markedBy: "ai" | "rubric" | "self";
  /** Marker confidence, distinct from the student's self-reported review confidence. */
  markConfidence?: number;
  /** Durable request for a second marker when an AI mark is not reliable enough. */
  markEscalation?: MarkEscalation;
  /** Confidence and provisional status of the mark (AI interpretation → deterministic checks → confidence). */
  markAssessment?: MarkAssessmentRecord;
  /**
   * Which marking pipeline link produced this mark, with the versions needed
   * to compare it against human marks later. Optional for older attempts.
   * The tier names the link (answer key, cache, on-device model, cloud
   * model, deterministic fallback); provider names the model or cache tier
   * that graded; policyVersion pins the marking policy; schemeHash pins the
   * exact mark scheme it was graded against, so an edited scheme or policy
   * can never silently reuse this mark as evidence.
   */
  markProvenance?: {
    tier: "key" | "cache" | "local" | "ai" | "fallback";
    provider?: string;
    policyVersion: string;
    schemeHash: string;
  };
  /** A high-scoring source answer or its completed delayed transfer check. */
  farTransfer?: FarTransferAttemptLink;
  confidence?: 1 | 2 | 3 | 4 | 5;
  /** Highest hint tier used before submitting, from the adaptive hint ladder. */
  hintTier?: "cue" | "prompt" | "scaffold" | "worked-solution";
  /** The repair explanation/credited point was visible before submission. */
  repairTeachingSeen?: boolean;
  /** True when the submitted response substantially matches the authored answer. */
  copiedAnswer?: boolean;
  /** First-error and mark-component evidence for calculation working. */
  workingAnalysis?: AttemptWorkingEvidence[];
  /** The adaptive intervention that produced this immediate observation. */
  intervention?: InterventionAttemptContext;
  /** Set when the attempt was made inside an Exam Mission session. */
  mission?: MissionAttemptContext;
  elapsedMs: number;
  mode: "practice" | "paper" | "recall";
  /** Optional provenance for attempts completed inside a paper sitting. */
  paperId?: Id;
  paperSpecId?: Id;
  paperRunId?: Id;
  /** Explicit human-marking gate for authenticated paper evidence. */
  paperMarking?: PaperMarkingReview;
  /** Links a targeted practice attempt back to the open mistake it is testing. */
  retestMistakeId?: Id;
  createdAt: IsoInstant;
}

export type WorkingErrorKind =
  | "none"
  | "rounding-error"
  | "conversion-error"
  | "unit-error"
  | "arithmetic-slip"
  | "incorrect-rearrangement"
  | "substitution-error"
  | "method-error"
  | "contradictory-working";

export type WorkingAnalysisConsistency = "model-match" | "alternative-valid" | "inconsistent" | "uncertain";
export type WorkingAnalysisConfidence = "high" | "medium" | "low";
export type WorkingAnalysisReason =
  | "content-mismatch"
  | "missing-expected-step"
  | "unrecognised-step"
  | "contradictory-working"
  | "working-runs-out"
  | "diagnosed-working-error";

export interface AttemptWorkingEvidence {
  partId: Id;
  firstIncorrectStep: number | null;
  firstErrorKind: WorkingErrorKind;
  consistentWithModel: boolean;
  /** Optional for persisted records written before confidence-aware analysis. */
  consistency?: WorkingAnalysisConsistency;
  confidence?: WorkingAnalysisConfidence;
  firstIncorrectReason?: WorkingAnalysisReason | null;
  firstIncorrectExpected?: string | null;
  diagnosisNote?: string;
  methodMarksAwarded: number;
  accuracyMarksAwarded: number;
  followThroughMarksAwarded: number;
  /** True when a later mark follows the student's earlier value (ECF). */
  errorCarriedForward?: boolean;
  unitMarksAwarded: number;
  precisionMarksAwarded: number;
}

export type InterventionKind = "diagnose" | "guided" | "independent" | "transfer" | "retention";
export type InterventionPriorState = "unknown" | "weak" | "developing" | "secure";
export type InterventionSupport = "none" | "cue" | "prompt" | "scaffold" | "worked-solution";
export type InterventionActivity = "question" | "retrieval" | "teaching";
export type InterventionObservationResult = "passed" | "missed" | "viewed" | "scheduled";

/** Context carried on an attempt so intervention effects can be followed. */
export interface InterventionAttemptContext {
  id: Id;
  /** Stable repair/intervention chain id used to join later transfer checks. */
  chainId?: Id;
  kind: InterventionKind;
  capabilityId: Id;
  topicId: Id;
  priorState: InterventionPriorState;
  priorAccuracy?: number;
  plannedMinutes: number;
  support: InterventionSupport;
  /** Question attempts, card retrievals and teaching gates share one event path. */
  activity?: InterventionActivity;
}

export interface InterventionOutcomeRecord {
  id: Id;
  /** Joins immediate, transfer and delayed observations for one repair chain. */
  chainId?: Id;
  /** Non-question activities are retained for intervention audits but never
   * counted as mark-based durable evidence. */
  activity?: InterventionActivity;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  capabilityId: Id;
  kind: InterventionKind;
  priorState: InterventionPriorState;
  /** Measured pre-intervention independent accuracy; absence prevents gain calibration. */
  priorAccuracy?: number;
  evidenceVersion?: 2;
  immediateQuestionId?: Id;
  immediateFamilyId?: Id;
  timeMeasured?: boolean;
  plannedMinutes: number;
  actualMinutes: number;
  support: InterventionSupport;
  immediate: { awarded: number; max: number; independent: boolean; attemptId: Id; at: IsoInstant; result?: InterventionObservationResult; /** True only when the Physics question itself is trusted content. */ trusted?: boolean };
  transfer?: { awarded: number; max: number; independent: boolean; questionId: Id; attemptId: Id; at: IsoInstant; familyId?: Id; trusted?: boolean };
  delayedRetention?: { awarded: number; max: number; independent: boolean; questionId: Id; attemptId: Id; at: IsoInstant; familyId?: Id; trusted?: boolean };
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}
