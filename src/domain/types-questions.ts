// Authored questions, learning metadata and validation lifecycle.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";
import type { AoCode, VerificationStatus, ContentSource, HumanVerificationRecord, LicensedSource, PaperQuestionProvenance } from "./types-curriculum";

// --- questions & marking ---------------------------------------------------

export type QuestionKind = "mcq" | "short" | "structured" | "calculation" | "extended";

/**
 * Part-level learning metadata. A structured question can contain several
 * demands, so putting the demand only on Question.learning loses the evidence
 * needed to audit coverage and to diagnose a single capability. The family,
 * context and reasoning moves are authored facts; they are never inferred from
 * a topic name or from the student's score.
 */
export type ReasoningGraphNodeKind = "evidence" | "operation" | "intermediate" | "constraint" | "conclusion";

export interface ReasoningGraphNode {
  kind: ReasoningGraphNodeKind;
  label: string;
}

export interface ReasoningGraph {
  nodes: ReasoningGraphNode[];
}

export interface SetupFingerprint {
  relationshipTopology: string;
  knownVsUnknown: string;
  hiddenState: string;
  representationType: string;
  operationSequence: string;
  suppliedVsInferred: string;
  constraintType: string;
  requestedOutput: string;
}

export interface TransferLink {
  baselinePartId: Id;
  baselineSetupFingerprint: SetupFingerprint;
  transferSetupFingerprint: SetupFingerprint;
  baselineReasoningGraph: ReasoningGraph;
  transferReasoningGraph: ReasoningGraph;
}

export interface SynopticLink {
  primaryCapabilityId: Id;
  secondaryCapabilityId: Id;
}

export interface LearningPartMetadata {
  familyId: Id;
  contextId: Id;
  demand: LearningDemand;
  /** Distinct cognitive operations required by this part. */
  reasoningMoves: string[];
  /**
   * Authoring quality gate. Scaffold cells may guide authors, but cannot
   * establish deep coverage or trusted learning evidence.
   */
  quality?: "substantive" | "scaffold";
  /**
   * Authoring-only target/result split.  `promptTarget` is the task exposed
   * to a learner; the remaining fields stay with the hidden answer evidence
   * and must never be interpolated into the prompt.
   */
  promptTarget?: string;
  expectedResult?: string;
  derivation?: string[];
  evidenceSources?: string[];
  /**
   * Concrete evidence contract for the mapped capability.  These are
   * authored entities/operations rather than a topic label, so the audit can
   * tell whether a generated item actually instantiates the intended skill.
   */
  capabilityEvidence?: CapabilityEvidenceContract;
  /** Machine-readable description of the learner-visible setup.  This is
   * derived from the rendered prompt and is kept alongside the authored
   * contract so audits can show exactly which structures were supplied. */
  setupFingerprint?: CapabilitySetupFingerprint;
  /**
   * Claim-level provenance for a worked answer.  The audit uses this to keep
   * supplied data, intermediate results and the final result distinct and to
   * reject answers that invent unsupported values.
   */
  provenance?: LearningProvenance;
  /**
   * Ordered semantic reasoning graph: evidence → operation → intermediate
   * state → constraint/check → conclusion. Stable labels, not prose.
   */
  reasoningGraph?: ReasoningGraph;
  /**
   * Structural transfer linkage. Every substantive transfer cell references
   * an explicit baseline task from the same capability plus both setup
   * fingerprints and both reasoning graphs.
   */
  transferLink?: TransferLink;
  /**
   * Explicit synoptic linkage with real mapped capability ids. Both strands
   * need independent structural contracts (see primaryContract /
   * secondaryContract).
   */
  synopticLink?: SynopticLink;
  primaryContract?: CapabilityEvidenceContract;
  secondaryContract?: CapabilityEvidenceContract;
}

export interface CapabilityEvidenceContract {
  capabilityId: Id;
  /** Named entities, representations or quantities that must be present. */
  requiredEntities: string[];
  /** Operations/transformations the learner must perform or explain. */
  requiredOperations: string[];
  /** Optional relations, constraints or laws that make the evidence checkable. */
  requiredRelations?: string[];
  /** Structural contract for the supplied problem, independent of labels or
   * answer-key prose.  A missing required structure is a hard capability
   * evidence failure for substantive content. */
  structuralContract?: CapabilityStructureContract;
  /** Fingerprint of the learner-visible setup used to satisfy the contract. */
  setupFingerprint?: CapabilitySetupFingerprint;
  /** The route evidence attributable to this capability. */
  derivation?: CapabilityDerivationEvidence;
  /**
   * A second capability is required for a synoptic part.  Keeping this as an
   * authored label (rather than inferring it from the topic name) lets the
   * audit verify that both strands are explicit and attributable.
   */
  secondaryCapability?: string;
  /** Optional stable secondary capability id for structural synoptic checks. */
  secondaryCapabilityId?: Id;
  secondaryStructuralContract?: CapabilityStructureContract;
  /** Explicit join used by structural synoptic validation. */
  joiningDependency?: string;
}

/** Observable problem structures used by subject-specific capability
 * contracts.  These deliberately describe inputs/representations rather
 * than topic labels so a prompt cannot pass by naming a skill. */
export type CapabilityStructureKind =
  | "polynomial"
  | "quadratic"
  | "radical-expression"
  | "factor-theorem-instance"
  | "simultaneous-equations"
  | "inequality-domain"
  | "transformation-graph"
  | "exponential-function"
  | "logarithmic-expression"
  | "coordinate-geometry"
  | "function"
  | "derivative-target"
  | "tangent-normal"
  | "rate-of-change"
  | "optimisation-constraint"
  | "integral"
  | "definite-integral"
  | "trigonometric-triangle"
  | "trigonometric-identity"
  | "trigonometric-equation"
  | "probability-events"
  | "probability-tree"
  | "conditional-probability"
  | "vector-components"
  | "table-dataset"
  | "graph-dataset"
  | "membrane-gradient"
  | "membrane-model"
  | "enzyme-assay"
  | "micrograph"
  | "dna-sequence"
  | "controlled-experiment"
  | "biological-molecule"
  | "cell-ultrastructure"
  | "chemical-equation"
  | "stoichiometric-data"
  | "titration-dataset"
  | "equilibrium-system"
  | "mass-spectrum"
  | "electron-configuration"
  | "molecular-structure"
  | "redox-species"
  | "gas-data"
  | "bonding-model"
  | "particle-model"
  | "numeric-data";

export interface CapabilitySetupFingerprint {
  /** Canonical subject family, when known. */
  subject?: "maths" | "biology" | "chemistry" | "physics";
  structures: CapabilityStructureKind[];
  /** Representations actually supplied, e.g. equation, graph or table. */
  representations: string[];
  /** Learner-visible operations/commands, canonicalised. */
  operations: string[];
  /** Equations, ratios, gradients or other explicit relationships. */
  relationships: string[];
  /** Expected response form inferred from the target command. */
  outputTypes: string[];
}

export interface CapabilityStructureContract {
  requiredStructures?: CapabilityStructureKind[];
  /** Alternative structure sets for capabilities whose valid instances have
   * different representations (for example a rate, tangent or optimisation
   * item under one differentiation statement). Each group requires one of
   * its members. */
  requiredStructureGroups?: CapabilityStructureKind[][];
  requiredRepresentations?: string[];
  requiredOperations?: string[];
  /** Alternative operations accepted for the same structure.  This is useful
   * when a statement is assessed through a calculation, explanation or
   * misconception repair while retaining one machine-checkable contract. */
  requiredOperationGroups?: string[][];
  requiredRelationships?: string[];
  expectedOutputTypes?: string[];
  /** Structures that are tempting substitutes but do not exercise this
   * capability by themselves (for example a polynomial for a surd task). */
  invalidSubstituteStructures?: CapabilityStructureKind[];
  /** If true, at least one contract operation must be present in the setup
   * and a second operation must be attributable in the derivation. */
  requireDerivationOperation?: boolean;
}

export interface CapabilityDerivationEvidence {
  setupStructures: CapabilityStructureKind[];
  capabilityOperation: string;
  intermediateResults: string[];
  finalResult: string;
  /** Synoptic routes can expose which worked steps belong to each strand. */
  primaryEvidence?: string[];
  secondaryEvidence?: string[];
  joiningDependency?: string;
}

export interface LearningProvenance {
  /** Values, observations, species or representations supplied by the prompt. */
  sourceEvidence: string[];
  /** The authored operation/law that turns the sources into the answer. */
  operation: string;
  /** Checkable intermediate values or conclusions, in route order. */
  intermediateResults: string[];
  /** The final quantity/conclusion the worked answer establishes. */
  finalResult: string;
}

export interface QuestionPart {
  id: Id;
  label: string;
  prompt: string;
  marks: number;
  /** Mark-scheme points; each is one awardable mark unless `marks` says more. */
  markScheme: string[];
  modelAnswer: string;
  /** Which AOs this part examines. Empty means unclassified. */
  aos?: AoCode[];
  /** Which spec statements this part tests (stable specPoint ids). */
  specPointIds?: Id[];
  /**
   * The distinct spec-statement claims this part examines (paraphrased).
   * One claim routinely earns several mark-scheme points — e.g. a single
   * "apply pV=nRT" claim behind a 3-point calculation — so this list is NOT
   * positional with markScheme. Required whenever specPointIds is present.
   */
  learningClaims?: string[];
  /**
   * Explicit per-mark allocation: claimMap[i] is the index into
   * learningClaims that markScheme[i] rewards. Optional; when absent, every
   * mark point draws on all listed claims. When present it must have exactly
   * markScheme.length entries, each a valid learningClaims index.
   */
  claimMap?: number[];
  /** Explicit, reviewed skill mapping; never inferred from a whole-topic score. */
  capabilityIds?: Id[];
  /** Demand and family for this part when a structured question mixes skills. */
  learning?: LearningPartMetadata;
  /** Optional explicit one-rule-per-mark calculation rubric. */
  calculationRules?: CalculationMarkRule[];
}

export interface CalculationMarkRule {
  kind: "method" | "accuracy" | "follow-through" | "unit" | "precision";
  /** Named working line, e.g. F or a. Aliases are authored, not guessed by OCR. */
  label: string;
  aliases?: string[];
  expected: number;
  method?: { operator: "+" | "-" | "*" | "/"; operands: [number | string, number | string] };
  unitAliases?: string[];
  significantFigures?: number;
}

export type LearningDemand = "recall" | "explanation" | "application" | "misconception" | "calculation" | "transfer" | "synoptic";

export interface LearningQuestionMetadata {
  /** Questions that differ only in numbers or wording share a family. */
  familyId: Id;
  contextId: Id;
  demand: LearningDemand;
  expectedMinutes: number;
  /** Optional authored operations used to detect cosmetic reskins. */
  reasoningMoves?: string[];
  quality?: "substantive" | "scaffold";
  promptTarget?: string;
  expectedResult?: string;
  derivation?: string[];
  evidenceSources?: string[];
  capabilityEvidence?: CapabilityEvidenceContract;
  setupFingerprint?: CapabilitySetupFingerprint;
  provenance?: LearningProvenance;
  reasoningGraph?: ReasoningGraph;
  transferLink?: TransferLink;
  synopticLink?: SynopticLink;
  primaryContract?: CapabilityEvidenceContract;
  secondaryContract?: CapabilityEvidenceContract;
}

export type MistakeRepairStage = "detected" | "diagnosed" | "taught" | "guided-success" | "independent-success" | "transfer" | "delayed-retention" | "resolved";

export interface MistakeRepairEvidence {
  attemptId: Id;
  questionId: Id;
  at: IsoInstant;
  stage: MistakeRepairStage;
}

export interface MistakeRepairState {
  version: 1;
  stage: MistakeRepairStage;
  evidence: MistakeRepairEvidence[];
  /** A full elapsed delay after the last relevant practice/exposure. */
  dueAt?: IsoInstant;
}

export type QuestionValidationStage = "draft" | "in_review" | "validated" | "needs_changes" | "rejected" | "retired";

export type DistractorQualityIssueCode =
  | "blank-option"
  | "duplicate-option"
  | "unattractive-distractor"
  | "overselected-distractor";

export type DistractorQualityOptionStatus = "correct" | "invalid" | "unmeasured" | "unused" | "healthy" | "overselected";

export type DistractorQualityStatus = "not-applicable" | "unmeasured" | "insufficient-data" | "healthy" | "needs-review";

export interface DistractorQualityIssue {
  code: DistractorQualityIssueCode;
  message: string;
  severity: "error" | "warning";
}

export interface DistractorOptionQuality {
  index: number;
  text: string;
  isCorrect: boolean;
  selectionCount: number;
  selectionRate: number | null;
  status: DistractorQualityOptionStatus;
}

export interface DistractorQualityReport {
  questionId: Id;
  applicable: boolean;
  optionCount: number;
  distractorCount: number;
  responseCount: number;
  reliable: boolean;
  status: DistractorQualityStatus;
  ok: boolean;
  issues: DistractorQualityIssue[];
  options: DistractorOptionQuality[];
}

export type QuestionValidationIssueCode =
  | "missing-stem"
  | "missing-parts"
  | "invalid-part"
  | "invalid-total-marks"
  | "invalid-mcq"
  | DistractorQualityIssueCode
  | "missing-topic"
  | "unknown-topic"
  | "missing-aos"
  | "missing-spec-points"
  | "unmapped-spec-point"
  | "missing-provenance"
  | "unverified-provenance"
  | "missing-spec-version"
  | "missing-reviewer"
  | "missing-last-checked"
  | "stale-provenance"
  | "missing-licence"
  | "missing-paper-provenance";

export interface QuestionValidationIssue {
  code: QuestionValidationIssueCode;
  message: string;
  severity: "error" | "warning";
}

export interface QuestionValidationReport {
  questionId: Id;
  checkedAt: IsoInstant;
  issues: QuestionValidationIssue[];
  ok: boolean;
  distractorQuality?: DistractorQualityReport;
}

export interface QuestionValidationHistoryEntry {
  from: QuestionValidationStage;
  to: QuestionValidationStage;
  at: IsoInstant;
  by: Id;
  note?: string;
}

export interface QuestionValidationRecord {
  questionId: Id;
  version: string;
  stage: QuestionValidationStage;
  report: QuestionValidationReport;
  history: QuestionValidationHistoryEntry[];
  reviewerId?: Id;
  submittedAt?: IsoInstant;
  reviewedAt?: IsoInstant;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/**
 * Result of the deterministic quality gates applied when an AI-generated or
 * AI-extracted question was saved (domain/generated-question-quality.ts).
 * Records machine checks only — it is never a human review and confers no
 * trust; verification stays "unverified" until the human review workflow
 * attaches a HumanVerificationRecord.
 */
export interface GeneratedQuestionQualityRecord {
  version: string;
  origin: "generated" | "extracted";
  decision: "accept" | "accept-with-warnings";
  /** Ids of the non-blocking gates that did not pass. */
  failedGates: string[];
  checkedAt: IsoInstant;
}

export interface Question {
  id: Id;
  subjectId: Id;
  topicIds: Id[];
  kind: QuestionKind;
  stem: string;
  /** MCQ only. */
  options?: string[];
  correctIndex?: number;
  parts: QuestionPart[];
  totalMarks: number;
  calculatorAllowed: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  origin: "seed" | "ai" | "past-paper";
  /** Provenance for display and filtering. */
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  /** Verification state against the spec / mark scheme. */
  verification?: VerificationStatus;
  /** Who verified it. */
  reviewer?: string | null;
  /** When this question was last checked. */
  lastChecked?: IsoDate | null;
  /** Spec version this question was checked against. */
  specVersion?: string;
  /** Union of AOs across parts, for quick filtering. */
  aos?: AoCode[];
  /** Which spec statements this question tests (union of parts; stable ids). */
  specPointIds?: Id[];
  /** Persisted question-specific validation lifecycle; moderation remains a separate publishing gate. */
  validation?: QuestionValidationRecord;
  /** Component-level editorial review for flagship question content. */
  humanVerification?: HumanVerificationRecord;
  /** Set when extracted from an uploaded paper. */
  paperId?: Id;
  paperQuestionNumber?: string;
  /** Authenticated provenance required for trusted WJEC past-paper evidence. */
  paperProvenance?: PaperQuestionProvenance;
  createdAt: IsoInstant;
  learning?: LearningQuestionMetadata;
  /** Machine quality-gate result for AI-generated/extracted content; never a review. */
  generationQuality?: GeneratedQuestionQualityRecord;
}
