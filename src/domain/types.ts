// ---------------------------------------------------------------------------
// The domain model. Everything here is board-, qualification- and
// subject-agnostic: WJEC A-level is seeded data, not a hard-coded assumption.
// A future board is added by dropping a new curriculum module into
// src/domain/curriculum — no type in this file changes.
// ---------------------------------------------------------------------------

export type Id = string;
/** Date-only, `YYYY-MM-DD`. Used everywhere a wall-clock day is meant. */
export type IsoDate = string;
/** Full ISO-8601 instant. Used everywhere an ordering-sensitive moment is meant. */
export type IsoInstant = string;

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
}

export interface Unit {
  id: Id;
  subjectId: Id;
  title: string;
  order: number;
}

export type AoCode = "AO1" | "AO2" | "AO3";
export type VerificationStatus = "unverified" | "checked" | "verified";
export type ContentSource = "authored" | "licensed" | "generated" | "past-paper" | "import";

/** Cite a licensed source when provenance is "licensed". Paraphrased claims stay compliant without verbatim text. */
export interface LicensedSource {
  /** Human citation, e.g. "Edexcel GCE Mathematics spec 9MA0, §2.1 (2024)" */
  citation: string;
  licence?: string;
  url?: string;
  accessedAt?: IsoDate;
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

// --- spaced repetition -----------------------------------------------------

export type CardKind = "basic" | "cloze" | "image" | "equation" | "mistake" | "audio";
export type RecallGrade = "again" | "hard" | "good" | "easy";

export interface Card {
  id: Id;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  kind: CardKind;
  front: string;
  back: string;
  /** Cloze cards keep the un-blanked sentence so it can be re-rendered. */
  clozeSource?: string;
  /** Data URL or remote URL. Data URLs keep images working offline. */
  imageUrl?: string;
  /** Data URL for a recorded or uploaded clip. */
  audioUrl?: string;
  /** Free-form note shown under the answer; never tested. */
  note?: string;
  /** Lower-case, deduplicated. The browser filters on these. */
  tags: string[];
  /** Set when the card was minted from a specific mistake. */
  sourceMistakeId?: Id;
  origin: "seed" | "manual" | "ai" | "document" | "mistake" | "import";
  /** Which spec statements this card directly supports (stable specPoint ids). */
  specPointIds?: Id[];
  /** Provenance for audit: where the card's claim comes from. */
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  verification?: VerificationStatus;
  reviewer?: string | null;
  lastChecked?: IsoDate | null;
  specVersion?: string;
  /** Suspended cards never appear until explicitly unsuspended. */
  suspended?: boolean;
  /** Buried cards reappear on this date. Bury is a one-day snooze. */
  buriedUntil?: IsoDate;
  // FSRS state
  due: IsoDate;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReviewedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ReviewLog {
  id: Id;
  userId: Id;
  cardId: Id;
  topicId: Id;
  grade: RecallGrade;
  /** Self-reported before the answer is revealed; feeds weak-topic detection. */
  confidence?: 1 | 2 | 3 | 4 | 5;
  elapsedMs: number;
  reviewedAt: IsoInstant;
}

// --- questions & marking ---------------------------------------------------

export type QuestionKind = "mcq" | "short" | "structured" | "calculation" | "extended";

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
  /** Which learning claims earn the marks for this part (paraphrased, 1:1 with markScheme when present). */
  learningClaims?: string[];
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
  | "missing-licence";

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
  /** Set when extracted from an uploaded paper. */
  paperId?: Id;
  paperQuestionNumber?: string;
  createdAt: IsoInstant;
}

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
  /** A high-scoring source answer or its completed delayed transfer check. */
  farTransfer?: FarTransferAttemptLink;
  confidence?: 1 | 2 | 3 | 4 | 5;
  elapsedMs: number;
  mode: "practice" | "paper" | "recall";
  /** Optional provenance for attempts completed inside a paper sitting. */
  paperId?: Id;
  paperSpecId?: Id;
  paperRunId?: Id;
  /** Links a targeted practice attempt back to the open mistake it is testing. */
  retestMistakeId?: Id;
  createdAt: IsoInstant;
}

export type CommandWord =
  | "state"
  | "describe"
  | "explain"
  | "calculate"
  | "show that"
  | "suggest"
  | "compare"
  | "evaluate"
  | "discuss"
  | "justify"
  | "deduce"
  | "predict"
  | "outline"
  | "other";

export type MisconceptionTag =
  | "units"
  | "significant-figures"
  | "rearrangement"
  | "substitution-slips"
  | "graph-reading"
  | "method-skipped"
  | "misread-command"
  | "terminology"
  | "conceptual"
  | "other";

export interface PointAttempt {
  point: string;
  awarded: boolean;
  /** Which command word governed this point. */
  command?: CommandWord;
}

export interface Mistake {
  id: Id;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  questionId?: Id;
  attemptId?: Id;
  partId?: Id;
  /** Exact mark-scheme point that was lost. */
  point?: string;
  /** Command word that governed where the mark was lost. */
  command?: CommandWord;
  /** Fine-grained misconception tag. */
  misconception?: MisconceptionTag;
  /** Id of the specific misconception-library entry this mistake matched, when one did. */
  misconceptionEntryId?: Id;
  /** AO this mistake belongs to. */
  ao?: AoCode;
  /** Difficulty of the question/part where the mark was lost. */
  difficultyAtLoss?: number;
  /** Marks lost on this mistake. */
  marksLost: number;
  /** Seconds spent on the part at the time of loss, when recorded. */
  secondsSpent?: number;
  /** Whether the attempt was rushed for that part's time budget. */
  timing?: "ok" | "rushed" | "slow" | "unknown";
  /** What went wrong, in the student's language. */
  description: string;
  /** Classification used to spot repeat patterns across topics. */
  category: "recall" | "method" | "arithmetic" | "interpretation" | "communication" | "unclassified";
  cardId?: Id;
  resolved: boolean;
  createdAt: IsoInstant;
  resolvedAt?: IsoInstant;
  /** Number of targeted retests attempted since the mistake was captured. */
  retestCount?: number;
  /** Most recent targeted retest, whether or not it earned the point. */
  lastRetestAttemptId?: Id;
  lastRetestedAt?: IsoInstant;
}

export interface AssessmentInsight {
  /** Marks lost broken down by command word. */
  byCommand: Record<CommandWord, number>;
  /** Marks lost broken down by misconception. */
  byMisconception: Record<MisconceptionTag, number>;
  /** Marks lost per topic (total dropped, recoverable estimate). */
  marksLostByTopic: Array<{ topicId: Id; subjectId: Id; lost: number; recoverable: number }>;
  /** Marks lost per AO. */
  marksLostByAo: Record<string, number>;
  /** Repeated weak subtopics (topics where mistakes cluster and recur). */
  repeatedWeakSubtopics: Id[];
  /** Expected marks gained if 1 hour is spent on each listed topic. */
  expectedMarksPerHour: Array<{ topicId: Id; value: number }>;
  /** Estimated split between lost marks caused by knowledge and exam technique. */
  techniqueVsKnowledge: TechniqueVsKnowledge;
  /** Item-analysis measurements for questions with enough cohort evidence. */
  questionDiscrimination?: QuestionDiscriminationMeasurement[];
}

export interface TechniqueVsKnowledge {
  /** Marks lost on knowledge gaps (recall/method/conceptual + AO1). */
  knowledgeLost: number;
  /** Marks lost on exam technique (timing/communication/interpretation + command-word slips). */
  techniqueLost: number;
  knowledgeShare: number;
  techniqueShare: number;
  totalLost: number;
  /** Stronger evidence when n ≥ 8 mistakes. */
  reliable: boolean;
  narrative: string;
  /** Top driver tags, for the UI. */
  drivers: string[];
}

export type QuestionDiscriminationBand =
  | "insufficient-data"
  | "no-variance"
  | "reverse"
  | "weak"
  | "acceptable"
  | "strong";

export interface QuestionDiscriminationMeasurement {
  questionId: Id;
  subjectId: Id;
  /** Valid, deduplicated attempts for the target question. */
  sampleSize: number;
  /** Attempts with both a valid item score and an ability score. */
  usableSampleSize: number;
  /** Mean awarded/max for the target question. */
  facility: number | null;
  /** Item-total correlation against ability, excluding the target question when derived. */
  discrimination: number | null;
  /** Standard error on Fisher's z scale. */
  standardError: number | null;
  confidenceInterval: { lower: number; upper: number } | null;
  band: QuestionDiscriminationBand;
  reliable: boolean;
  abilitySource: "provided" | "leave-one-question-out" | "none";
}

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
  updatedAt: IsoInstant;
}

// --- progress --------------------------------------------------------------

export interface TopicMastery {
  topicId: Id;
  subjectId: Id;
  /** 0–1. Blends recall stability, question accuracy and recency. */
  mastery: number;
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
  /** Structured breakdown for the "why this?" disclosure. */
  explanation?: RecommendationExplanation;
  /** Alias for tests that want the factors without unwrapping explanation. */
  factors?: RecommendationFactors;
}

export interface StreakState {
  userId: Id;
  current: number;
  longest: number;
  lastActiveDate: IsoDate | null;
  xp: number;
  /** Ids of unlocked achievements. */
  achievements: Id[];
}

export interface Achievement {
  id: Id;
  name: string;
  description: string;
  /** Evaluated against the aggregate stats; pure so it is trivially testable. */
  test: (stats: GamificationStats) => boolean;
}

export interface GamificationStats {
  reviews: number;
  attempts: number;
  marksEarned: number;
  papers: number;
  streak: number;
  masteredTopics: number;
  perfectSessions: number;
}

// --- custom study ----------------------------------------------------------

/** What goes into a hand-built session, as chosen in the custom-study dialog. */
export interface CustomStudySpec {
  /** Browser query string; empty means "everything in scope". */
  query: string;
  subjectIds?: Id[];
  topicIds?: Id[];
  tags?: string[];
  /** Which pool to draw from before the query narrows it further. */
  pool: "due" | "new" | "lapsed" | "suspended" | "all";
  limit: number;
  order: "due" | "random" | "difficulty" | "lapses" | "added";
  /** Custom sessions can preview ahead of schedule without rescheduling. */
  ahead?: boolean;
}

// --- deck import/export ----------------------------------------------------

export interface DeckExportCard {
  front: string;
  back: string;
  kind: CardKind;
  tags: string[];
  note?: string;
  imageUrl?: string;
  audioUrl?: string;
  clozeSource?: string;
  topicId?: Id;
  subjectId?: Id;
  /** Present in a full export, absent in a shared deck. */
  scheduling?: {
    due: IsoDate;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    lastReviewedAt: IsoInstant | null;
  };
}

export interface DeckExport {
  /** Bumped when the shape changes; importers refuse what they cannot read. */
  formatVersion: 1;
  name: string;
  description?: string;
  exportedAt: IsoInstant;
  /** Set when the deck came from this app rather than a third party. */
  source?: string;
  subjectId?: Id;
  cards: DeckExportCard[];
}

// --- sync ------------------------------------------------------------------

export type SyncEntity =
  | "cards"
  | "reviewLogs"
  | "attempts"
  | "mistakes"
  | "questions"
  | "papers"
  | "plannedSessions"
  | "examDates"
  | "settings"
  | "streak";

export interface OutboxItem {
  id: Id;
  entity: SyncEntity;
  op: "upsert" | "delete";
  payload: unknown;
  queuedAt: IsoInstant;
  attempts: number;
  lastError?: string;
}
