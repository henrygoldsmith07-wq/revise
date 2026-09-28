// Curriculum and provenance: boards, specs, topics, verification.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";
import type { MisconceptionTag } from "./types-taxonomy";

// --- curriculum ------------------------------------------------------------

export interface ExamBoard {
  id: Id;
  name: string;
  country: string;
}

export interface Qualification {
  id: Id;
  boardId: Id;
  name: string;
  /** e.g. "A Level", "GCSE", "IB Diploma" — free text so new systems fit. */
  level: string;
  /** Ordered best → worst, e.g. ["A*","A","B",...]. Drives grade prediction. */
  grades: string[];
}

export interface PaperSpec {
  id: Id;
  name: string;
  /** Share of the total qualification mark, 0–1. Weights grade prediction. */
  weight: number;
  durationMinutes: number;
  calculatorAllowed: boolean;
}

export interface Subject {
  id: Id;
  qualificationId: Id;
  name: string;
  /** Board's own specification code, shown in the UI for trust. */
  specCode?: string;
  papers: PaperSpec[];
  /** Percentage thresholds per grade, best grade first. Approximate by nature. */
  gradeBoundaries: { grade: string; percent: number }[];
  /** Which spec document this subject's content tracks, and when it was last checked. */
  spec?: SubjectSpec;
  /**
   * Flagship subjects are authored against that board's spec. Reference subjects
   * reuse a flagship outline for navigation and must not be labelled "checked".
   */
  contentTier?: "flagship" | "reference";
  /** Shown in the UI when contentTier is "reference". */
  contentDisclaimer?: string;
}

export interface Unit {
  id: Id;
  subjectId: Id;
  title: string;
  order: number;
}

export type AoCode = "AO1" | "AO2" | "AO3";
export type VerificationStatus = "unverified" | "checked" | "verified";
export type ContentSource = "authored" | "licensed" | "generated" | "past-paper" | "import" | "adapted" | "unreviewed";

/** Separate checks stop a single "verified" stamp hiding a weak component. */
export interface HumanVerificationRecord {
  status: "pending" | "approved" | "changes-requested";
  reviewerId?: Id;
  /** Role of the qualified WJEC reviewer who made the decision. */
  reviewerRole?: "examiner" | "teacher" | "subject-expert";
  /** Free-text qualification evidence, e.g. "WJEC A-level Physics examiner". */
  reviewerQualification?: string;
  reviewedAt?: IsoInstant;
  /** Fingerprint of the exact question, scheme, solution and mappings reviewed. */
  contentFingerprint?: string;
  checks: {
    question: boolean;
    marking: boolean;
    workedSolution: boolean;
    capabilityMapping: boolean;
    specificationMapping?: boolean;
    examRealism?: boolean;
  };
  notes?: string;
}

/** Cite a licensed source when provenance is "licensed". Paraphrased claims stay compliant without verbatim text. */
export interface LicensedSource {
  /** Human citation, e.g. "Edexcel GCE Mathematics spec 9MA0, §2.1 (2024)" */
  citation: string;
  licence?: string;
  url?: string;
  accessedAt?: IsoDate;
}

/**
 * Provenance for an extracted exam question. A paper id alone is not enough:
 * the source must be traceable to an immutable board document and explicitly
 * checked before it can contribute trusted paper evidence.
 */
export interface PaperQuestionProvenance {
  board: string;
  specification: string;
  specificationVersion?: string;
  paperId: Id;
  /** Immutable sitting identity; different series must never be merged. */
  sittingId?: Id;
  year?: number;
  series?: string;
  questionNumber: string;
  sourceUrl: string;
  /** Digest/manifest id for the source file or licensed archive snapshot. */
  sourceDigest: string;
  status: "pending" | "verified" | "rejected";
  verifiedBy?: Id;
  verifiedAt?: IsoInstant;
  notes?: string;
}

export interface SpecPoint {
  /** Stable internal ID, e.g. "wjec-alevel-physics.kinematics-dynamics.sp-1". Never changes when text is clarified. */
  id: Id;
  /** Exact spec reference as printed by the board, e.g. "Unit 1.1(a)" or "Pure 1.2.4". */
  ref: string;
  /** Paraphrased learning claim — what must be known — never verbatim spec text unless licensed. */
  text: string;
  /** Which assessment objectives this statement is examined under. */
  aos: AoCode[];
  /** Provenance for this individual statement (falls back to topic source when absent). */
  source?: ContentSource;
  /** When source is licensed, the citation that makes it auditable. */
  licensedSource?: LicensedSource | null;
  /** Verification state for this statement: draft→reviewed→verified (stored as unverified→checked→verified). */
  verification?: VerificationStatus;
  /** Who or what verified it — reviewer name, "authored", or licence citation. */
  reviewer?: string | null;
  /** When this statement was last checked. */
  lastChecked?: IsoDate | null;
  /** Spec version this statement was checked against. */
  specVersion?: string;
}

export interface SubjectSpec {
  /** Version label tied to the spec document, e.g. "2024-1.0". */
  version: string;
  /** Publication / last amendment date of the spec document. */
  releaseDate: IsoDate;
  /** When the content for this subject was last checked against the spec. */
  lastChecked: IsoDate;
  /** Public URL or citation for the spec, when known. */
  url?: string;
}

export interface Topic {
  id: Id;
  subjectId: Id;
  unitId: Id;
  title: string;
  order: number;
  /** Spec reference as printed by the board, when known. */
  specRef?: string;
  /** Version of the spec this topic was checked against. */
  specVersion?: string;
  /** 1 (foundational) – 5 (stretch). Seeds the planner before any data exists. */
  intrinsicDifficulty: 1 | 2 | 3 | 4 | 5;
  /** Short prose used by the learn step and as AI grounding. */
  summary: string;
  /** The handful of things an examiner actually rewards. */
  keyPoints: string[];
  /** Errors this topic is notorious for; drives targeted feedback. */
  commonErrors: string[];
  /** Fine-grained spec statements this topic covers. Absent on old content until migrated. */
  specPoints?: SpecPoint[];
  /** AO coverage for this topic (union of its spec points / cards). */
  aos?: AoCode[];
  /** Provenance: who wrote this content and under what licence. */
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  /** How thoroughly this topic has been checked against the spec. */
  verification?: VerificationStatus;
  /** Who verified it. */
  reviewer?: string | null;
  /** When verification was last performed. */
  lastChecked?: IsoDate | null;
}

/**
 * One entry in the misconception library: a common wrong belief, why it is
 * wrong, the symptom an examiner sees, and what to write instead. Authored
 * content, linked to the topics where the mistake costs marks.
 */
export interface Misconception {
  id: Id;
  subjectId: Id;
  topicIds: Id[];
  /** The wrong belief, phrased the way a student holds it. */
  statement: string;
  /** Why it is wrong and the correct conception, in examiner voice. */
  explanation: string;
  /** A concrete wrong-answer symptom — what an examiner sees every year. */
  example: string;
  /** What to write instead. */
  correction: string;
  /** Fine-grained tag shared with Mistake.misconception, for analytics. */
  tag?: MisconceptionTag;
  /** Assessment objective this misconception most often costs. */
  ao?: AoCode;
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  verification?: VerificationStatus;
  reviewer?: string | null;
  lastChecked?: IsoDate | null;
}
