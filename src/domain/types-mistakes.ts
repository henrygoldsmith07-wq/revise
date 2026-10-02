// Captured mistakes and repair state.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { ErrorCategory } from "./error-taxonomy";
import type { Id, IsoInstant } from "./types-base";
import type { AoCode } from "./types-curriculum";
import type { MistakeRepairState } from "./types-questions";
import type { WorkingErrorKind } from "./types-attempts";
import type { CommandWord, MisconceptionTag } from "./types-taxonomy";

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
  /** Physics working diagnosis, when a calculation response was analysable. */
  firstIncorrectStep?: number;
  workingErrorKind?: WorkingErrorKind;
  /** Why the mark was lost, from the error diagnosis; only stored when the diagnosis was confident. */
  errorCategory?: ErrorCategory;
  errorConfidence?: number;
  cardId?: Id;
  resolved: boolean;
  createdAt: IsoInstant;
  resolvedAt?: IsoInstant;
  /** Number of targeted retests attempted since the mistake was captured. */
  retestCount?: number;
  /** Most recent targeted retest, whether or not it earned the point. */
  lastRetestAttemptId?: Id;
  lastRetestedAt?: IsoInstant;
  capabilityIds?: Id[];
  repair?: MistakeRepairState;
}
