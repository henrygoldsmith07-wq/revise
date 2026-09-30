import type { RecallMasteryRow } from "./recall-mastery";
import type { ApplicationMasteryRow } from "./application-mastery";

import { type KnowledgeAnsweringReport } from "./exam-technique";

import type { ActivityKind, Card, ExamDate, Id, IsoDate, Mistake, PlannedSession, Topic, TopicMastery, Attempt, Question } from "./types";
import type { PaperOutcomeRecord } from "./paper-outcome";

export interface OutcomePair {
  subjectId: Id;
  topicId?: Id;
  /** Predicted marks for the outcome window (from simulatePaper or predicted percent scaled). */
  predicted: number;
  /** Actual marks later earned on a timed paper covering the same material. */
  actual: number;
  date: IsoDate;
  /** Which recommendation drove the study that produced this outcome, when known. */
  driverActivity?: ActivityKind;
}

export interface RecommendInput {
  topics: Topic[];
  mastery: TopicMastery[];
  cards: Card[];
  mistakes: Mistake[];
  /** Optional bank/history lookups used to exclude untrusted Physics losses. */
  questions?: Question[];
  attempts?: Attempt[];
  exams: ExamDate[];
  plan: PlannedSession[];
  sessionLengthMinutes: number;
  subjectIds: Id[];
  now?: Date;
  marksPerHour?: Map<Id, number>;
  /** Base recovery fraction for recoverable marks when marksPerHour is absent. */
  recoverableFraction?: number;
  /** Real outcome pairs for recommendation-quality benchmarking (synthetic now, real later). */
  outcomeHistory?: OutcomePair[];
  /** Per-topic adaptive difficulty offset in [-1, 1] learned from rolling accuracy. */
  adaptiveDifficultyOffset?: Map<Id, number>;
  /** Historical per-topic marks-gained-per-hour derived from actual outcomes (overrides marksPerHour when both present). */
  historicalGain?: Map<Id, number>;
  /** Knowledge-vs-answering report per subject; steers what kind of work the ranking prefers. */
  techniqueSplit?: Map<Id, KnowledgeAnsweringReport>;
  /** Per-topic reports (each topic's own losses aggregated); preferred over the subject report for topic-level recs. */
  techniqueByTopic?: Map<Id, KnowledgeAnsweringReport>;
  /** Sat-paper (predicted, actual) outcome records; feeds the paper gain factor back from reality. */
  paperOutcomes?: PaperOutcomeRecord[];
  /** Cross-topic total recommendations already issued — drives ε/exploration decay (default 0). */
  totalRecommendationsIssued?: number;
  /** Minutes the student has already studied this session — drives fatigue penalties (default 0). */
  activeMinutes?: number;
  /** When true, surface an extra exploration candidate among tied topics (default false in deterministic rank). */
  enableExploration?: boolean;
  /** RNG for exploration jitter — inject for deterministic tests (default Math.random). */
  rng?: () => number;
  /** Recall-only evidence (FSRS strength) per topic; separates "knows it" from "can use it". */
  recallMastery?: RecallMasteryRow[];
  /** Application evidence (marked exam answers, recall excluded) per topic. */
  applicationMastery?: ApplicationMasteryRow[];
}
