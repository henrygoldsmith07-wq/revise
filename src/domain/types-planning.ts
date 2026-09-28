// Papers, plans, settings, mastery and recommendations.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";

export interface PaperSimulation {
  paperSpecId: Id;
  subjectId: Id;
  questionIds: Id[];
  totalMarks: number;
  timeMinutes: number;
  /** Scaled predicted total using current topic mastery + calibration. */
  predictedMarks: number;
  predictedGrade: string;
  /** Marks that are statistically recoverable (lost on weak but recently practised topics). */
  recoverableMarks: number;
  /** Per-topic marks expected vs actual (from calibration). */
  marksByTopic: Array<{ topicId: Id; expected: number; available: number }>;
  /** Untrusted questions excluded from the simulation; never silently predicted. */
  untrustedCount?: number;
}

export interface Calibration {
  subjectId: Id;
  /** Actual vs predicted regression: predicted marks -> actual. */
  bias: number;
  slope: number;
  /** How reliable the regression is. */
  sampleSize: number;
  /** Mean absolute error on known paper simulations. */
  mae: number;
}

// --- past papers -----------------------------------------------------------

export interface Paper {
  id: Id;
  userId: Id;
  subjectId: Id;
  title: string;
  year?: number;
  series?: string;
  /** Source manifest fields retained at paper level for audit/export. */
  sittingId?: Id;
  sourceUrl?: string;
  sourceDigest?: string;
  provenanceStatus?: "pending" | "verified" | "rejected";
  provenanceVerifiedBy?: Id;
  provenanceVerifiedAt?: IsoInstant;
  paperSpecId?: Id;
  /** Extracted plain text, kept so questions can be re-extracted later. */
  sourceText?: string;
  markSchemeText?: string;
  totalMarks: number;
  questionIds: Id[];
  status: "uploaded" | "extracted" | "practised";
  createdAt: IsoInstant;
}

// --- planning --------------------------------------------------------------

export type ActivityKind = "learn" | "flashcards" | "recall" | "practice" | "paper" | "mistakes";

export interface PlannedSession {
  id: Id;
  userId: Id;
  date: IsoDate;
  /** Minutes from midnight; the timetable renders these as blocks. */
  startMinute: number;
  minutes: number;
  subjectId: Id;
  topicId?: Id;
  activity: ActivityKind;
  reason: string;
  status: "pending" | "done" | "skipped" | "missed";
  completedAt?: IsoInstant;
}

export interface ExamDate {
  id: Id;
  userId: Id;
  subjectId: Id;
  paperSpecId?: Id;
  date: IsoDate;
  label: string;
}

export interface Availability {
  /** 0 = Sunday … 6 = Saturday. Minutes of study available that weekday. */
  weekday: number;
  minutes: number;
}

export interface UserSettings {
  userId: Id;
  displayName: string;
  subjectIds: Id[];
  availability: Availability[];
  sessionLengthMinutes: number;
  targetGrades: Record<Id, string>;
  theme: "light" | "dark" | "system";
  accessibility: {
    largeText: boolean;
    dyslexiaFont: boolean;
    highContrast: boolean;
    reduceMotion: boolean;
  };
  aiEnabled: boolean;
  /** Whether Pulse may read this account's study history. Off by default. */
  pulseEnabled: boolean;
  /**
   * Lab routes (benchmarks, teacher, corpora, case study) stay off the student
   * nav until this is switched on in Settings.
   */
  labMode: boolean;
  /** Subject the student last studied in lessons, so /lesson lands where they left off. */
  lastLessonSubject?: string;
  /**
   * When the AI provider is unreachable, allow the on-device WebLLM model to
   * grade formative answers (downloads ~2GB of weights once; opt-in).
   */
  localAiMarking?: boolean;
  /**
   * Encrypt everything that leaves for the sync backend with an on-device
   * AES-GCM key. The server stores opaque blobs only; a database breach
   * yields ciphertext, not student answers. See data/e2ee.ts.
   */
  e2eeEnabled?: boolean;
  /**
   * One-time countdown markers: the phase bucket ("early" | "technique" |
   * "final") each subject was in the last time it was evaluated, keyed by
   * subject id. Lets a subject entering the timed-paper fortnight be
   * announced exactly once per transition — and re-announced if its exam is
   * pushed back out of the window and it later re-enters.
   */
  examNotices?: Record<string, string>;
  /** When on, a subject entering the timed-paper fortnight also fires a browser notification. */
  examNotifications?: boolean;
  updatedAt: IsoInstant;
}

// --- progress --------------------------------------------------------------

export interface TopicMastery {
  topicId: Id;
  subjectId: Id;
  /** 0–1. Blends recall stability, question accuracy and recency. */
  mastery: number;
  /**
   * 0–1 posterior blending a handcrafted product default with this student's
   * evidence — what a cold-start topic shows as "Predicted mastery". Converges
   * onto `mastery` as evidence accumulates (see `priorRemaining`).
   */
  predictedMastery?: number;
  /** 0–1 share of `predictedMastery` still carried by the prior (1 = pure prior). */
  priorRemaining?: number;
  /** 0–1 predicted probability of recall right now (forgetting curve). */
  retention: number;
  confidence: number;
  cardsTotal: number;
  cardsDue: number;
  attempts: number;
  accuracy: number;
  lastStudiedAt: IsoInstant | null;
  /** True when this topic is costing the most marks per minute of revision. */
  weak: boolean;
}

export interface RecommendationFactors {
  /** Total marks the activity is expected to recover (or protect). */
  examGain: number;
  /** 1.0 far from exam, ~2.0 on exam day. */
  urgency: number;
  /** 0–1, higher when mastery is lower. */
  weakness: number;
  /** 0–1, higher when retention has decayed or days since retrieval are many. */
  forgetting: number;
  /** 0.7–1.4, higher when evidence is thin. */
  uncertainty: number;
  /** Present only when fatigue/circadian penalties demoted this option (<1). */
  fatigue?: number;
  /** Present only when technique steering applied (promote >1, demote <1). */
  techniqueSteer?: number;
  /** 0–1, low when application (non-retrieval) evidence is weak relative to recall. Present only when an application gap exists. */
  applicationGap?: number;
  /** 0–1 retrieval strength (FSRS-derived). Present only when mastery evidence is separated. */
  recallMastery?: number;
}

export interface RecommendationExplanation {
  /** Marks expected to be recovered by this activity (total, not per hour). */
  recoverableMarks: number;
  /** Marks per hour for the same topic, when known. */
  marksPerHour: number | null;
  /** Last exam accuracy for the topic, 0–100, or null when no evidence. */
  lastEvidencePercent: number | null;
  /** Days since the last successful retrieval, or null when never studied. */
  daysSinceRetrieval: number | null;
  /** Days to the next paper for the subject, or null when no date set. */
  daysToExam: number | null;
  /** Human label for the paper, e.g. "Paper 1". */
  paperLabel: string | null;
  /** The five factors that produced the score. */
  factors: RecommendationFactors;
  /** Evidence-cited narrative: "Do X because Y", built only from computed numbers. Null when no numbers exist to cite. */
  narrative?: string | null;
  /** How many cards/mistakes contributed, when relevant. */
  count?: number;
  overdueCount?: number;
}

export interface Recommendation {
  activity: ActivityKind;
  subjectId: Id;
  topicId?: Id;
  minutes: number;
  /** One sentence, shown to the student. Never jargon. */
  reason: string;
  /** Higher runs first. */
  score: number;
  plannedSessionId?: Id;
  /** Set when technique steering converted this rec into a timed run (the quick-session length). */
  techniqueQuickMinutes?: 5 | 10;
  /** Knowledge share of lost marks for the subject when technique steering applied. */
  techniqueKnowledgeShare?: number;
  /** Structured breakdown for the "why this?" disclosure. */
  explanation?: RecommendationExplanation;
  /** Alias for tests that want the factors without unwrapping explanation. */
  factors?: RecommendationFactors;
  /** Auditable shared-policy result. Score is relative, never predicted marks. */
  policy?: {
    evidenceLevel: "limited" | "developing" | "strong";
    reason: string;
    observedMarksPerHour: number | null;
    factors: {
      weakness: number; forgettingRisk: number; retrievalPressure: number;
      mistakePressure: number; examUrgency: number; examWeighting: number;
      learningBenefit: number; retentionBenefit: number; diagnosticValue: number;
      transferNeed: number; evidenceConfidence: number; estimatedMinutes: number;
    };
  };
}
