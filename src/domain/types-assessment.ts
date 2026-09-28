// Assessment analytics: insight, technique split, discrimination.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id } from "./types-base";
import type { CommandWord, MisconceptionTag } from "./types-taxonomy";

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
