// Bridges the adaptive plan's evidence to the intervention ranker, so the
// session Today shows carries a ranked intervention and a plain-language why.
// Display/explanation only: it does not change which steps run.

import { capabilityState, type CapabilityProfile } from "./capability-mastery";
import { classifyDepth } from "./flagship";
import { evidenceGaps, type GapExtras } from "./evidence-gaps";
import { currentFatigue } from "./fatigue";
import { examPhase, explainIntervention, INTERVENTION_LABEL, rankInterventions, type InterventionContext, type InterventionKind } from "./intervention-ranking";
import { independentAttempt, questionFamilies, trustworthyAttempt } from "./learning-evidence";
import { buildMistakePatterns } from "./mistake-patterns";
import { trustedAssessmentContent } from "./physics-content-review";
import type { AdaptiveTopicCandidate } from "./adaptive-scoring";
import type { Attempt, Id, Mistake, Question, Topic } from "./types";

export interface PlanIntervention {
  kind: InterventionKind;
  minutes: number;
  headline: string;
  lines: string[];
  /** The most useful missing measurement, as a bounded action; null when evidence is broad. */
  gap: { text: string; label: string; minutes: number } | null;
}

const score = (profile: CapabilityProfile, key: "recall" | "application" | "transfer"): number | null =>
  capabilityState(profile[key]) === "unknown" ? null : profile[key].score;

export function interventionContextFor(input: {
  topic: Topic;
  selected: AdaptiveTopicCandidate;
  profile: CapabilityProfile;
  questions: readonly Question[];
  /** Full attempt history for the topic, trusted or not: familiarity does not depend on marking. */
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  share?: number;
  paperName?: string;
  /** Every attempt across topics, for study-block length. Defaults to the topic attempts. */
  allAttempts?: readonly Attempt[];
  reviewLogs?: ReadonlyArray<{ reviewedAt: string; elapsedMs: number }>;
  now?: Date;
}): InterventionContext {
  const { topic, selected, profile } = input;
  const seenIds = new Set(input.attempts.map((attempt) => attempt.questionId));
  const byId = new Map(input.questions.map((question) => [question.id, question] as const));
  const seenFamilies = new Set<string>();
  for (const id of seenIds) {
    const question = byId.get(id);
    if (question) for (const family of questionFamilies(question)) seenFamilies.add(family);
  }
  const unseen = { recall: 0, application: 0, transfer: 0 };
  for (const question of input.questions) {
    if (!trustedAssessmentContent(question) || seenIds.has(question.id)) continue;
    if (questionFamilies(question).some((family) => seenFamilies.has(family))) continue;
    const depth = classifyDepth(question);
    if (depth === "recall") unseen.recall += 1;
    else if (depth === "transfer") unseen.transfer += 1;
    else if (depth === "application" || depth === "synoptic") unseen.application += 1;
  }
  const pastPaperUnseen = input.questions.filter((question) =>
    question.origin === "past-paper" && trustedAssessmentContent(question) && !seenIds.has(question.id)).length;
  const events = [
    ...(input.allAttempts ?? input.attempts).map((attempt) => ({ at: attempt.createdAt, elapsedMs: attempt.elapsedMs })),
    ...(input.reviewLogs ?? []).map((log) => ({ at: log.reviewedAt, elapsedMs: log.elapsedMs })),
  ];
  const open = input.mistakes.filter((mistake) => !mistake.resolved && mistake.marksLost > 0);
  const patterns = buildMistakePatterns({ mistakes: open, attempts: input.attempts, questions: input.questions });
  const evidence = selected.evidence;
  return {
    topicId: topic.id,
    subjectId: topic.subjectId,
    topicTitle: topic.title,
    ...(input.paperName ? { paperName: input.paperName } : {}),
    qualificationShare: input.share ?? 0,
    daysToExam: evidence.daysToExam,
    mastery: evidence.attempts > 0 ? evidence.mastery : null,
    recall: score(profile, "recall"),
    application: score(profile, "application"),
    transferProven: capabilityState(profile.transfer) === "secure",
    evidenceAttempts: evidence.attempts,
    openMistakeMarks: open.reduce((sum, mistake) => sum + mistake.marksLost, 0),
    recurringMistakes: patterns.filter((row) => row.recurring).length,
    repeatedMisconception: patterns.some((row) => row.recurring && row.cause === "misunderstood-concept"),
    repeatedTechniqueError: patterns.some((row) => row.recurring && row.intervention === "technique-intervention"),
    dueCards: evidence.dueCount,
    forgettingRisk: evidence.factors.forgetting,
    unseen,
    prerequisiteWeak: null,
    delayedProofDue: evidence.proof?.proofDue ?? false,
    fatigue: currentFatigue(events, input.now ?? new Date()),
    paperMaterial: pastPaperUnseen >= 3,
  };
}

/** Counts behind the evidence-gap messages; all derived from the learner's own history. */
export function gapExtrasFor(input: {
  questions: readonly Question[];
  attempts: readonly Attempt[];
  daysToExam: number | null;
  now?: Date;
}): GapExtras {
  const now = (input.now ?? new Date()).getTime();
  const independent = input.attempts.filter(independentAttempt);
  const last = independent.reduce((max, attempt) => Math.max(max, Date.parse(attempt.createdAt)), 0);
  return {
    daysSinceEvidence: last > 0 ? Math.max(0, Math.floor((now - last) / 86_400_000)) : null,
    distinctIndependent: new Set(independent.map((attempt) => attempt.questionId)).size,
    independentAttempts: independent.length,
    timedPaperAttempts: input.attempts.filter((attempt) => attempt.mode === "paper").length,
    trustedQuestions: input.questions.filter(trustedAssessmentContent).length,
    lowConfidenceMarks: input.attempts.filter((attempt) => attempt.markedBy === "ai" && !trustworthyAttempt(attempt)).length,
    daysToExam: input.daysToExam,
  };
}

/** `sessionMinutes` is the planned session length, so the headline never contradicts the length shown on Today. */
export function chooseIntervention(ctx: InterventionContext, maxMinutes?: number, extras?: GapExtras, sessionMinutes?: number): PlanIntervention | null {
  const pick = rankInterventions([ctx], { maxMinutes })[0];
  const gap = extras ? evidenceGaps(ctx, extras)[0] : undefined;
  if (!pick) return null;
  const minutes = sessionMinutes !== undefined ? Math.max(1, Math.ceil(sessionMinutes)) : pick.minutes;
  const explained = explainIntervention(ctx, { kind: pick.kind, minutes });
  return {
    kind: pick.kind, minutes, headline: explained.headline, lines: explained.lines,
    gap: gap ? { text: gap.text, label: gap.action.label, minutes: gap.action.minutes } : null,
  };
}

export { examPhase, INTERVENTION_LABEL };
export type { Id };
