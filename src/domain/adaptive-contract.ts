import type { CapabilityNode } from "./capability-graph";
import type { HintTier } from "./hints";
import type { ApplicationMasteryRow } from "./application-mastery";
import type { RecallMasteryRow } from "./recall-mastery";
import type { ExamReadiness } from "./exam-readiness";
import type { AdaptiveEvidence } from "./adaptive-scoring";
import type { Attempt, Card, ExamDate, Id, Mistake, Question, ReviewLog, Topic, TopicMastery, InterventionAttemptContext, InterventionOutcomeRecord } from "./types";

export type AdaptiveStepKind =
  | "overdue-retrieval"
  | "misconception-repair"
  | "explanation"
  | "supported-practice"
  | "independent-application"
  | "transfer"
  | "prerequisite-repair"
  | "delayed-retrieval";

/** Execution parameters a step's runner needs, beyond the ids it targets. */
export interface AdaptiveStepParams {
  /** Whether this rung may offer hints. Independent rungs never may. */
  support: "supported" | "independent";
  /** Highest hint tier a supported rung offers before the worked solution. */
  hintBudget: number;
}

/** Plain-language labels the runner/UI reads off a step. */
export const STEP_LABELS: Record<AdaptiveStepKind, string> = {
  "overdue-retrieval": "Retrieval",
  "misconception-repair": "Repair the misconception",
  explanation: "Explain the gap",
  "supported-practice": "Supported question",
  "independent-application": "Independent application",
  transfer: "Unfamiliar transfer",
  "prerequisite-repair": "Fix the foundation first",
  "delayed-retrieval": "Schedule delayed retrieval",
};

/** The individual blocks the adaptive runner exposes to the student. */
export interface AdaptiveSessionStep {
  id: string;
  kind: AdaptiveStepKind;
  minutes: number;
  label: string;
  /** One sentence explaining the purpose of the block. */
  description: string;
  /** Existing tested route that executes this block (fallback link). */
  href: string;
  topicId: Id;
  subjectId: Id;
  cardIds: Id[];
  questionIds: Id[];
  mistakeIds: Id[];
  /** Why this block is in today's plan, in the student's language. */
  why?: string;
  /** How this rung must be run (hints on/off); independent rungs carry 0 budget. */
  params?: AdaptiveStepParams;
  capabilityId?: Id;
  teaching?: boolean;
  /** Evidence context attached to the attempt for effect calibration. */
  intervention?: InterventionAttemptContext;
}

export interface AdaptiveSessionPlan {
  /** Stable for a topic/day so a checkpoint can identify the same plan. */
  key: string;
  subjectId: Id;
  topicId: Id;
  topicTitle: string;
  /** The configured target (normally 20) and the actual sum after fitting. */
  targetMinutes: number;
  totalMinutes: number;
  score: number;
  reason: string;
  evidence: AdaptiveEvidence;
  steps: AdaptiveSessionStep[];
  startHref: string;
  /** Set when readiness evidence already proves this topic — core rungs dropped. */
  stoppedEarly?: { reason: string };
  /** Replan one mapped skill action after every submitted answer. */
  learningPolicy?: "capability-evidence-v1";
}

export interface AdaptiveSessionInput {
  capabilityNodes?: CapabilityNode[];
  topics: Topic[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  exams: ExamDate[];
  subjectIds: Id[];
  /** Recall/application evidence powers the capability-aware sequence. */
  recallMastery?: RecallMasteryRow[];
  applicationMastery?: ApplicationMasteryRow[];
  /** Exam-readiness rows for these subjects; a ready topic may stop early. */
  readiness?: ExamReadiness[];
  /** Defaults to the product's 20-minute promise; direct callers may test 12–25. */
  targetMinutes?: number;
  now?: Date;
  /** Used by the runner when resuming a plan after an activity changed evidence. */
  topicId?: Id;
  /** Observed intervention chains used to replace policy priors. */
  interventionOutcomes?: InterventionOutcomeRecord[];
}

export type AdaptiveStepResult =
  | "passed-independent"
  | "passed-assisted"
  | "missed"
  | "gave-up"
  | "scheduled"
  | "viewed";

/** One executed step's outcome, kept in run order for replay and replanning. */
export interface AdaptiveStepRecord {
  stepId: Id;
  kind: AdaptiveStepKind;
  minutes: number;
  result: AdaptiveStepResult;
  /** Marks earned on this rung's question (0 for non-question rungs). */
  awardedMarks: number;
  maxMarks: number;
  /** Highest hint tier reached, or null when none was used. */
  hintTier: HintTier | null;
  /** The question attempted or the last card shown for this step. */
  itemId?: Id;
  /** Retrieval cards still missed when this step ended. */
  missedItemIds?: Id[];
  /** Mistake resolved by this step's retest, when one was. */
  resolvedMistakeId?: Id;
  elapsedMs: number;
}

/** The distilled verdict of a prerequisite diagnosis (page passes it in). */
export interface AdaptivePrereqVerdict {
  prereqTopicId: Id;
  prereqTopicTitle: string;
  kind: "prereq-first" | "prereq-unmeasured";
}

export interface AdaptiveReplanInput {
  /** The session as chosen on Today (anchor: topic, focus, budget, original rungs). */
  capabilityNodes?: CapabilityNode[];
  plan: AdaptiveSessionPlan;
  /** Executed steps in order — the run's evidence so far. */
  completed: AdaptiveStepRecord[];
  /** The topic's question bank, including any questions just attempted. */
  questions: Question[];
  /** The topic's cards in their persisted state. */
  cards: Card[];
  /** Unresolved mistakes on the topic right now (including just-created ones). */
  mistakes: Mistake[];
  /** All attempts on the topic so far (before the run and during it). */
  attempts: Attempt[];
  /** The prerequisite topic's questions, when a detour is being offered. */
  prereqQuestions?: Question[];
  /** The verdict a prerequisite diagnosis produced, when it points upstream. */
  prereq?: AdaptivePrereqVerdict | null;
  /** Observed intervention chains used to replan after every answer. */
  interventionOutcomes?: InterventionOutcomeRecord[];
  now?: Date;
}

export interface AdaptiveReplan {
  /** The next steps, in order. Never repeats an executed step id. */
  steps: AdaptiveSessionStep[];
  /** True when the tutor is satisfied — no more steps to run. */
  done: boolean;
  /** One line saying why the next step (or the stop) happens. */
  reason: string;
  /** True when the run was capped (attempt/exhaustion) rather than satisfied. */
  stopped: boolean;
}

export const DONE_REASON_BUDGET =
  "Your time budget for this session is used up — the gain is scheduled to be tested after a delay.";
export const DONE_REASON_EVIDENCE =
  "Independent application is demonstrated and transfer held — further similar questions would be unnecessary drilling.";
export const DONE_REASON_CAPPED =
  "This rung has been tried enough times in one session; repeating it now would be drilling, not learning. The open points are queued for repair.";
