// ---------------------------------------------------------------------------
// Learner-facing states. The engine keeps its detailed lifecycle; the student
// sees six plain words and can open a one-sentence reason on demand.
// This is a projection of the proof lifecycle, not a second mastery system.
// ---------------------------------------------------------------------------

import { independentAttempt, isTransferQuestion, questionFamily } from "./learning-evidence";
import type { RecoveryState } from "./mark-recovery";
import type { LifecycleStage, TopicLifecycle } from "./proof-lifecycle";
import type { Attempt, Id, Question } from "./types";

export type LearnerState = "not-checked" | "needs-work" | "improving" | "awaiting-proof" | "proven" | "regressed";

export const LEARNER_STATE_LABEL: Record<LearnerState, string> = {
  "not-checked": "Not checked",
  "needs-work": "Needs work",
  improving: "Improving",
  "awaiting-proof": "Awaiting proof",
  proven: "Proven",
  regressed: "Regressed",
};

const FROM_STAGE: Record<LifecycleStage, LearnerState> = {
  "not-started": "not-checked",
  weak: "needs-work",
  "no-clear-improvement": "needs-work",
  practising: "improving",
  "looks-learned": "awaiting-proof",
  "awaiting-proof": "awaiting-proof",
  fading: "awaiting-proof",
  proven: "proven",
  holding: "proven",
  slipped: "regressed",
};

export interface TopicEvidenceSummary {
  /** Independent, trusted answers on distinct question families. */
  differentQuestions: number;
  newApplication: boolean;
  /** Days between the earliest and latest of those answers. */
  spanDays: number;
}

export function topicEvidenceSummary(topicId: Id, attempts: readonly Attempt[], questions: readonly Question[]): TopicEvidenceSummary {
  const byId = new Map(questions.map((q) => [q.id, q] as const));
  const used = attempts.filter((a) => a.topicIds.includes(topicId) && independentAttempt(a) && a.awarded / a.max >= 0.5 && byId.has(a.questionId));
  const families = new Set(used.map((a) => questionFamily(byId.get(a.questionId)!)));
  const times = used.map((a) => Date.parse(a.createdAt)).sort((a, b) => a - b);
  return {
    differentQuestions: families.size,
    newApplication: used.some((a) => isTransferQuestion(byId.get(a.questionId)!)),
    spanDays: times.length > 1 ? Math.floor((times.at(-1)! - times[0]) / 86_400_000) : 0,
  };
}

export interface LearnerStateView {
  state: LearnerState;
  label: string;
  /** Plain-English reason, shown on interaction only. */
  detail: string;
}

export function learnerState(lifecycle: TopicLifecycle, evidence?: TopicEvidenceSummary): LearnerStateView {
  const state = FROM_STAGE[lifecycle.stage];
  let detail = lifecycle.line;
  if (state === "proven" && evidence && evidence.differentQuestions > 0) {
    const n = evidence.differentQuestions;
    detail = `Based on ${n} different question${n === 1 ? "" : "s"}, answered independently${evidence.newApplication ? ", including a new application question" : ""}${evidence.spanDays > 0 ? `, spread over ${evidence.spanDays} day${evidence.spanDays === 1 ? "" : "s"}` : ""}.`;
  } else if (state === "awaiting-proof") {
    detail = lifecycle.dueNow
      ? "A check on a different question is due now."
      : "You improved, but Revise needs to check this again later on a different question.";
  } else if (state === "regressed") {
    detail = "You did better before, but new questions after a delay scored lower. Time for a short repair.";
  } else if (state === "not-checked") {
    detail = "Revise has no independent evidence on this yet. It is unknown, not weak.";
  }
  return { state, label: LEARNER_STATE_LABEL[state], detail };
}

/** The same six words for a mission's status. "Blocked" is not a state of the learner: it is Needs work with a stated limit. */
export function missionLearnerState(status: "not-started" | "active" | "awaiting-proof" | "proven" | "regressed" | "blocked"): LearnerState {
  return ({ "not-started": "needs-work", active: "improving", "awaiting-proof": "awaiting-proof", proven: "proven", regressed: "regressed", blocked: "needs-work" } as const)[status];
}

/** The same six words for one lost mark's recovery state. */
export function recoveryLearnerState(state: RecoveryState): LearnerState {
  return ({ open: "needs-work", targeted: "needs-work", provisional: "improving", "awaiting-proof": "awaiting-proof", proven: "proven", regressed: "regressed" } as const)[state];
}

export const LEARNER_STATE_TONE: Record<LearnerState, "neutral" | "success" | "review" | "danger" | "accent"> = {
  "not-checked": "neutral", "needs-work": "danger", improving: "accent", "awaiting-proof": "review", proven: "success", regressed: "danger",
};
