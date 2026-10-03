// ---------------------------------------------------------------------------
// The Next Best Action engine. One ranked list, one winner.
//
// Exam Missions, paper recovery, the pre-exam command centre, proof checks,
// due reviews, untouched content and the adaptive topic optimiser all emit
// candidate actions in the same shape. They are compared globally, per
// action, on one interpretable score:
//
//   score = sqrt(expectedMarks × expectedMarksPerMinute × 20)
//           × urgency × phaseFit × weighting × (0.6 + 0.4 × confidence)
//
//   expectedMarks   marks currently at stake × the share a step like this can
//                   recover × the learner's measured effectiveness for the method
//   urgency         1 + 1.5 × how close that subject's exam is
//   phaseFit        how well the action suits the countdown phase (a gentle
//                   multiplier, never a hard category priority)
//   weighting       the topic's relative weight in its exam
//   confidence      how much trusted evidence backs the estimate
//
// Nothing here depends on the order subjects are listed in. Pure domain code:
// no store, no clock beyond `now`, no parallel scoring of its own: stage
// minutes, intervention kinds, proof rules and trust gates are reused.
// ---------------------------------------------------------------------------

import type { AdaptiveSessionPlan } from "./adaptive-contract";
import type { ColdStartPlan } from "./cold-start";
import { estimateEffectiveness, type EffectivenessEstimate, type EffectivenessEvidence } from "./effectiveness";
import { APPLICATION_DAYS, countdownGuidance, FINAL_DAYS, TECHNIQUE_DAYS, type CountdownPhase } from "./exam-countdown";
import { buildExamMissions, buildPaperMission, missionNextAction, type ExamMission, type MissionInput, type MissionStageKind } from "./exam-mission";
import type { InterventionKind } from "./intervention-ranking";
import { missionLearnerState, type LearnerState } from "./learner-state";
import type { MarkRecovery } from "./mark-recovery";
import { buildMissionSession, missionHref } from "./mission-session";
import { ROOT_CAUSE_LABEL } from "./mistake-patterns";
import { timeBoxPlan, type TimeBox, type TimeBoxPlan } from "./pre-exam-plan";
import type { TopicSupply } from "./supply";
import type { Attempt, ExamDate, Id, Mistake, Question } from "./types";

export type ActionType =
  | "proof-check" | "regression-recovery" | "mission" | "paper-repair" | "recurring-error" | "exam-urgent"
  | "weak-topic" | "learn-untouched" | "due-reviews" | "exam-section" | "full-paper" | "adaptive-session" | "evidence-gap" | "quick-check";

export interface ActionExplanation {
  why: string;
  whyNow: string;
  /** Filled in by the ranking: why this beats the next-best alternative. */
  whyBefore: string;
  /** What is at stake, in one plain sentence. */
  stake: string;
  evidence: string[];
  after: string;
  proves: string;
}

export interface RevisionAction {
  id: string;
  type: ActionType;
  title: string;
  subjectId: Id;
  topicIds: Id[];
  specPoints: string[];
  minutes: number;
  /** Marks still open on this, when it is about specific lost marks; null otherwise. */
  marksRecoverable: number | null;
  /** The topic's share of its exam, 0–1; null when it spans several topics. */
  examWeight: number | null;
  daysToExam: number | null;
  urgency: number;
  evidenceStrength: number;
  confidence: number;
  /** Share of the gap a step like this can close, 0–1. */
  expectedLearningGain: number;
  expectedMarks: number;
  expectedMarksPerMinute: number;
  proofStatus: LearnerState | null;
  /** Must happen before other new work on the same topics. */
  requiredFirst: boolean;
  blockedBy?: string;
  effectiveness: EffectivenessEstimate | null;
  explanation: ActionExplanation;
  route: { href: string; label: string };
  mission?: { id: string; stage: MissionStageKind };
  /** Mistakes this action works on, so one loss is never planned twice. */
  mistakeIds: Id[];
  score: number;
  factors: { phaseFit: number; weighting: number; confidenceFactor: number; effectivenessWeight: number };
}

export interface EngineInput {
  now: Date;
  subjectIds: readonly Id[];
  subjectName?: (id: Id) => string;
  topicTitle?: (id: Id) => string;
  mistakes: readonly Mistake[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  recovery: MarkRecovery;
  examDates: readonly ExamDate[];
  adaptive?: AdaptiveSessionPlan | null;
  dueReviews?: ReadonlyArray<{ subjectId: Id; count: number; overdue: number }>;
  untouched?: ReadonlyArray<{ subjectId: Id; topicId: Id; label: string; share: number }>;
  /** The next paper to sit, per subject (from the existing paper selector). */
  papers?: ReadonlyArray<{ subjectId: Id; paperId: Id; title: string }>;
  paperTitles?: Readonly<Record<Id, string>>;
  supplyByTopic?: Readonly<Record<Id, TopicSupply>>;
  effectiveness?: EffectivenessEvidence;
  /** Share of its exam, and weight relative to an average topic (1 = average). */
  topicWeight?: (topicId: Id) => { share: number; relative: number };
  /** Set only while the learner has too little evidence to rank anything; see cold-start.ts. */
  coldStart?: ColdStartPlan | null;
}

export interface DeferredAction { action: RevisionAction; reason: string }

export interface RevisionPlan {
  actions: RevisionAction[];
  top: RevisionAction | null;
  deferred: DeferredAction[];
  /** Topics needing more verified questions before improvement can be proven, biggest stake first. */
  authoringNeeds: Array<{ topicId: Id; subjectId: Id; need: "unseen-verified" | "transfer"; marksAtStake: number }>;
  model: string;
}

export const SCORE_MODEL = "score = √(expected marks × marks per minute × 20) × exam urgency × phase fit × topic weighting × (0.6 + 0.4 × evidence confidence)";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const DAY = 86_400_000;

/** Whole days from `now`'s date to the subject's nearest future exam; null with none. Independent of list order. */
export function daysToNearestExam(exams: readonly ExamDate[], subjectId: Id, now: Date): number | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates = exams.filter((e) => e.subjectId === subjectId).map((e) => Date.parse(`${e.date}T00:00:00Z`)).filter((t) => t >= today);
  return dates.length ? Math.round((Math.min(...dates) - today) / DAY) : null;
}

const urgencyOf = (days: number | null) => (days === null ? 0.15 : days <= 0 ? 1 : clamp(1 - days / 60, 0.05, 1));

/** Gentle multipliers describing what each countdown phase favours. Never a hard category priority. */
const PHASE_FIT: Record<CountdownPhase, Partial<Record<ActionType, number>>> = {
  foundation: { "learn-untouched": 1.25, "due-reviews": 1.1, "weak-topic": 1.1, "adaptive-session": 1.05, "exam-section": 0.5, "full-paper": 0.3, "exam-urgent": 0.2, "paper-repair": 0.9 },
  application: { "exam-section": 1.15, "weak-topic": 1.15, mission: 1.1, "recurring-error": 1.1, "paper-repair": 1.1, "learn-untouched": 0.9, "full-paper": 0.6, "exam-urgent": 0.4 },
  technique: { "full-paper": 1.2, "exam-section": 1.2, "recurring-error": 1.2, "paper-repair": 1.2, "proof-check": 1.1, "regression-recovery": 1.1, "learn-untouched": 0.5, "exam-urgent": 0.8 },
  final: { "exam-urgent": 1.3, "recurring-error": 1.1, "due-reviews": 1.1, "regression-recovery": 1.1, "full-paper": 0.8, "proof-check": 0.7, "learn-untouched": 0.15, "weak-topic": 0.95, "evidence-gap": 0.6 },
};

const STAGE_SHARE: Record<MissionStageKind, number> = { diagnose: 0.2, repair: 0.45, practise: 0.4, apply: 0.5, "delayed-proof": 0.6, complete: 0 };

type Draft = Omit<RevisionAction, "score" | "factors" | "expectedMarksPerMinute" | "urgency">;
type Estimate = (kind: InterventionKind, cause: string | null) => EffectivenessEstimate;

type MissionCollectInput = Pick<EngineInput, "mistakes" | "recovery" | "examDates" | "now" | "paperTitles" | "supplyByTopic" | "topicTitle"> & { repairWeight?: MissionInput["repairWeight"]; includeProven?: boolean };

/** Every mission the learner has, across all subjects and papers. */
export function collectMissions(input: MissionCollectInput): ExamMission[] {
  const subjects = [...new Set(input.mistakes.map((m) => m.subjectId))].sort();
  const out: ExamMission[] = [];
  const paperIds = [...new Set(input.recovery.items.map((i) => i.paperId).filter((p): p is Id => Boolean(p)))].sort();
  for (const subjectId of subjects) {
    const base: MissionInput = {
      mistakes: input.mistakes, recovery: input.recovery, daysToExam: daysToNearestExam(input.examDates, subjectId, input.now), unseenByTopic: {}, subjectId,
      ...(input.supplyByTopic ? { supplyByTopic: input.supplyByTopic } : {}),
      ...(input.topicTitle ? { topicTitle: input.topicTitle } : {}),
      ...(input.paperTitles ? { paperTitles: input.paperTitles } : {}),
      ...(input.repairWeight ? { repairWeight: input.repairWeight } : {}),
    };
    out.push(...buildExamMissions({ ...base, max: Number.MAX_SAFE_INTEGER, includeProven: input.includeProven ?? false }));
    for (const paperId of paperIds) {
      const mission = buildPaperMission(paperId, base);
      if (mission && mission.subjectId === subjectId && (input.includeProven || mission.status !== "proven")) out.push(mission);
    }
  }
  return out;
}

function missionDraft(mission: ExamMission, input: EngineInput, estimate: Estimate, ignoreWait = false): Draft | { skip: string } {
  const blockedStage = mission.current.blockedBy;
  const stage = (blockedStage ? mission.stages.find((s) => s.kind === "practise") : undefined) ?? mission.current;
  if (!ignoreWait && stage.kind === "delayed-proof" && mission.proofDueAt && Date.parse(mission.proofDueAt) > input.now.getTime()) {
    return { skip: `Waiting for the delay to pass: Revise can check this from ${mission.proofDueAt.slice(0, 10)}.` };
  }
  if (stage.kind === "complete") return { skip: "Nothing left to do on this mission." };
  const r = mission.recovery;
  const next = missionNextAction(mission);
  const eff = stage.intervention ? estimate(stage.intervention, mission.cause) : null;
  const weight = eff?.weight ?? 1;
  const regressed = mission.status === "regressed";
  const gap = Boolean(blockedStage) || mission.status === "blocked";
  const type: ActionType = regressed ? "regression-recovery" : gap ? "evidence-gap"
    : stage.kind === "delayed-proof" ? "proof-check" : mission.origin === "paper" ? "paper-repair" : mission.origin === "pattern" ? "recurring-error" : "mission";
  const stakes = stage.kind === "delayed-proof" ? r.awaitingProof + r.provisional : regressed ? r.regressed : r.open + r.provisional;
  const marks = stakes > 0 ? stakes : mission.marksAtStake;
  const shares = mission.topicIds.map((t) => input.topicWeight?.(t) ?? { share: 0, relative: 1 });
  const confidence = clamp((r.evidence === "adequate" ? 0.8 : r.evidence === "thin" ? 0.5 : 0.3) + (mission.unseenAvailable >= 2 ? 0.1 : -0.1), 0.15, 0.95);
  const lost = r.previouslyLost;
  const names = mission.topicIds.map((t) => input.topicTitle?.(t) ?? t);
  const where = names.length ? ` across ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}` : "";
  const cause = mission.cause && mission.cause !== "unclassified" ? ROOT_CAUSE_LABEL[mission.cause] : null;
  const shown = Math.round(marks * 10) / 10;
  const title = regressed ? `Recover ${shown} marks you lost again: ${mission.title}`
    : stage.kind === "delayed-proof" ? `Prove it: ${mission.title}`
    : mission.origin === "paper" ? mission.title
    : `${shown > 0 ? `Recover ${shown} marks: ` : ""}${mission.title}`;
  const share = STAGE_SHARE[stage.kind];
  // The time shown must be the time the session takes, so it comes from the questions it will run.
  const sessionMinutes = buildMissionSession(mission, { questions: input.questions, attempts: input.attempts, mistakes: input.mistakes }, stage.kind).minutes;
  return {
    id: `action:${mission.id}:${stage.kind}`,
    type, title, subjectId: mission.subjectId, topicIds: mission.topicIds, specPoints: [],
    minutes: Math.max(3, Math.ceil(sessionMinutes) || stage.minutes || 8), marksRecoverable: round(marks, 1),
    examWeight: shares.length === 1 ? shares[0]!.share : null,
    daysToExam: daysToNearestExam(input.examDates, mission.subjectId, input.now),
    evidenceStrength: r.evidence === "adequate" ? 0.8 : r.evidence === "thin" ? 0.5 : 0.2,
    confidence, expectedLearningGain: share, expectedMarks: round(marks * share * weight, 2),
    proofStatus: missionLearnerState(mission.status, mission.recovery), requiredFirst: regressed, effectiveness: eff, mistakeIds: mission.mistakeIds,
    explanation: {
      why: `${lost} mark${lost === 1 ? "" : "s"} were lost${where}${cause ? `, mainly through ${cause}` : ""}. ${stage.reason}`,
      whyNow: regressed ? "Marks you had recovered were lost again, so they are the most likely to cost you in the exam."
        : stage.kind === "delayed-proof" ? "Enough time has passed that a check on a different question now counts as proof."
        : mission.status === "not-started" ? "These marks are open and nothing has been done about them yet."
        : "The previous stage is done, so this is the next thing the evidence needs.",
      whyBefore: "", stake: regressed ? `${shown} marks you had recovered are lost again.` : stage.kind === "delayed-proof" ? `${shown} marks only count as recovered once they hold on a new question.` : shown > 0 ? `${shown} mark${shown === 1 ? "" : "s"} you lost are still open.` : "Nothing is at stake yet; this builds the evidence.",
      evidence: [...mission.evidence, ...(mission.limitsSentence ? [mission.limitsSentence] : [])],
      after: next.after,
      proves: mission.completionCondition,
    },
    route: { href: missionHref(mission.id, stage.kind), label: "Start session" },
    mission: { id: mission.id, stage: stage.kind },
  };
}

function adaptiveDraft(plan: AdaptiveSessionPlan, input: EngineInput): Draft {
  const ev = plan.evidence;
  const tw = input.topicWeight?.(plan.topicId) ?? { share: ev.value?.share ?? 0, relative: ev.value?.relativeWeight ?? 1 };
  const atStake = ev.value?.atStake.mid ?? round((1 - clamp(ev.mastery, 0, 1)) * 5, 1);
  const untouched = ev.attempts === 0 && ev.dueCount === 0;
  const type: ActionType = untouched ? "learn-untouched" : ev.mastery < 0.6 && ev.attempts > 0 ? "weak-topic" : "adaptive-session";
  const confidence = clamp(ev.attempts / 8, 0.15, 0.95);
  const share = untouched ? 0.35 : 0.3;
  const topic = plan.topicTitle;
  return {
    id: `action:adaptive:${plan.topicId}`, type,
    title: untouched ? `Learn ${topic}` : type === "weak-topic" ? `Strengthen ${topic}` : `Next session: ${topic}`,
    subjectId: plan.subjectId, topicIds: [plan.topicId], specPoints: [], minutes: Math.max(5, plan.totalMinutes),
    marksRecoverable: ev.marksLost > 0 ? ev.marksLost : null, examWeight: tw.share, daysToExam: ev.daysToExam,
    evidenceStrength: confidence, confidence, expectedLearningGain: share, expectedMarks: round(atStake * share, 2),
    proofStatus: ev.attempts === 0 ? "not-checked" : ev.mastery < 0.6 ? "needs-work" : "improving", requiredFirst: false, effectiveness: null,
    mistakeIds: ev.openMistakeIds,
    explanation: {
      why: plan.reason,
      whyNow: ev.daysToExam !== null ? `Your exam is ${ev.daysToExam} day${ev.daysToExam === 1 ? "" : "s"} away.` : "It is the best-evidenced gap right now.",
      whyBefore: "", stake: ev.marksLost > 0 ? `${ev.marksLost} marks already lost in ${topic}.` : untouched ? `About ${Math.round(tw.share * 100)}% of the exam, not started yet.` : `${topic} is not secure yet.`,
      evidence: [
        ev.marksLost > 0 ? `${ev.marksLost} marks already lost in ${topic}` : "",
        ev.dueCount > 0 ? `${ev.dueCount} card${ev.dueCount === 1 ? "" : "s"} due` : "",
        ev.attempts === 0 ? "no answers recorded yet, so Revise cannot judge this topic" : `${ev.attempts} trusted answer${ev.attempts === 1 ? "" : "s"} on record`,
      ].filter(Boolean),
      after: "Revise replans after each answer and ends with a delayed retrieval check.",
      proves: "Independent success on different questions, then a later check on a new one.",
    },
    route: { href: plan.startHref, label: "Start session" },
  };
}

function quickCheckDraft(plan: ColdStartPlan, input: EngineInput): Draft {
  const name = input.subjectName?.(plan.subjectId) ?? plan.subjectId;
  const days = daysToNearestExam(input.examDates, plan.subjectId, input.now);
  return {
    id: `action:quick-check:${plan.subjectId}`, type: "quick-check", title: `Find where to start in ${name}`,
    subjectId: plan.subjectId, topicIds: [], specPoints: [], minutes: Math.max(3, plan.minutes),
    marksRecoverable: null, examWeight: null, daysToExam: days, evidenceStrength: 0.1, confidence: 0.3,
    expectedLearningGain: 0.3, expectedMarks: 1.5, proofStatus: "not-checked", requiredFirst: false, effectiveness: null, mistakeIds: [],
    explanation: {
      why: `Revise has no answers from you in ${name} yet, so ${plan.questions} short questions will show what to work on first.`,
      whyNow: "Every later recommendation is better with a few real answers behind it.",
      whyBefore: "", stake: "Without a few real answers, Revise is guessing what you need.",
      evidence: [`${plan.questions} reviewed questions across ${plan.topics} topic${plan.topics === 1 ? "" : "s"}`, "no hints, so the answers count as unaided evidence"],
      after: "Your best next step is chosen from what you get wrong, and anything you lose becomes a recovery plan.",
      proves: "Nothing yet. This is a first impression, not a grade.",
    },
    route: { href: `/diagnostic?subject=${encodeURIComponent(plan.subjectId)}`, label: "Start quick check" },
  };
}

function finalise(draft: Draft, input: EngineInput): RevisionAction {
  const urgency = 1 + 1.5 * urgencyOf(draft.daysToExam);
  const phaseFit = PHASE_FIT[countdownGuidance(draft.daysToExam).phase][draft.type] ?? 1;
  const tw = draft.topicIds.length === 1 ? input.topicWeight?.(draft.topicIds[0]!) : undefined;
  const weighting = round(0.8 + 0.2 * clamp(tw?.relative ?? 1, 0, 2), 3);
  const confidenceFactor = round(0.6 + 0.4 * draft.confidence, 3);
  const minutes = Math.max(1, draft.minutes);
  const perMinute = draft.expectedMarks / minutes;
  const score = Math.sqrt(Math.max(0, draft.expectedMarks) * Math.max(0, perMinute) * 20) * urgency * phaseFit * weighting * confidenceFactor;
  return { ...draft, minutes, urgency: round(urgency, 3), expectedMarksPerMinute: round(perMinute, 3), score: round(score, 4), factors: { phaseFit, weighting, confidenceFactor, effectivenessWeight: draft.effectiveness?.weight ?? 1 } };
}

/** Why `a` beats `b`, from the factor that separates them most. */
export function explainVersus(a: RevisionAction, b: RevisionAction): string {
  const ratios: Array<[string, number]> = [
    ["it should win back more marks for the time it takes", a.expectedMarksPerMinute / Math.max(1e-6, b.expectedMarksPerMinute)],
    ["its exam is closer", a.urgency / b.urgency],
    ["it suits this stage of your revision better", a.factors.phaseFit / b.factors.phaseFit],
    ["it is backed by more trusted evidence", a.factors.confidenceFactor / b.factors.confidenceFactor],
    ["it covers a heavier part of the exam", a.factors.weighting / b.factors.weighting],
  ];
  const best = ratios.sort((x, y) => y[1] - x[1])[0]!;
  return best[1] > 1.02 ? `Before “${b.title}” because ${best[0]}.` : `Ahead of “${b.title}” by a narrow margin; the two are close.`;
}

function commandCentreDrafts(input: EngineInput, enrolled: ReadonlySet<Id>, estimate: Estimate): Draft[] {
  const out: Draft[] = [];
  for (const subjectId of [...enrolled].sort()) {
    const days = daysToNearestExam(input.examDates, subjectId, input.now);
    if (days === null || days > APPLICATION_DAYS) continue;
    const name = input.subjectName?.(subjectId) ?? subjectId;
    const open = input.recovery.summarise((i) => i.subjectId === subjectId);
    const stakes = open.open + open.provisional;
    const paper = input.papers?.find((p) => p.subjectId === subjectId);
    if (paper) {
      out.push({
        id: `action:section:${subjectId}`, type: "exam-section", title: `Sit a timed ${name} paper section`, subjectId, topicIds: [], specPoints: [], minutes: 35,
        marksRecoverable: null, examWeight: null, daysToExam: days, evidenceStrength: 0.5, confidence: 0.5, expectedLearningGain: 0.25,
        expectedMarks: round(Math.max(2, stakes * 0.25), 2), proofStatus: null, requiredFirst: false, effectiveness: estimate("paper-section", null), mistakeIds: [],
        explanation: { why: "Timed exam practice shows where marks really go.", whyNow: `Your ${name} exam is ${days} days away.`, whyBefore: "", stake: stakes > 0 ? `${round(stakes, 1)} marks are still open.` : "A real paper shows where marks are really lost.", evidence: [paper.title], after: "Marks lost become a recovery mission automatically.", proves: "A later paper in the same weak areas." },
        route: { href: `/papers?subject=${encodeURIComponent(subjectId)}`, label: "Start session" },
      });
    }
    if (paper && days <= TECHNIQUE_DAYS) {
      out.push({
        id: `action:paper:${subjectId}`, type: "full-paper", title: `Sit a full ${name} paper`, subjectId, topicIds: [], specPoints: [], minutes: 90,
        marksRecoverable: null, examWeight: null, daysToExam: days, evidenceStrength: 0.5, confidence: 0.5, expectedLearningGain: 0.3,
        expectedMarks: round(Math.max(4, stakes * 0.3 + 3), 2), proofStatus: null, requiredFirst: false, effectiveness: estimate("full-paper", null), mistakeIds: [],
        explanation: { why: "A full paper checks timing and stamina as well as knowledge.", whyNow: `Your ${name} exam is ${days} days away.`, whyBefore: "", stake: stakes > 0 ? `${round(stakes, 1)} marks are still open.` : "A real paper shows timing and stamina as well as knowledge.", evidence: [paper.title], after: "An autopsy and recovery mission follow.", proves: "The same weak areas on the next paper." },
        route: { href: `/papers?subject=${encodeURIComponent(subjectId)}`, label: "Start session" },
      });
    }
    if (days <= TECHNIQUE_DAYS / 2) {
      const plan = timeBoxPlan(20, { daysToExam: days, hasRecurringError: false, delayedProofDue: false, hasOpenLoss: stakes > 0, paperAvailable: Boolean(paper), untouchedHighValue: false, dueCards: 0 });
      out.push({
        id: `action:urgent:${subjectId}`, type: "exam-urgent", title: `${name}: ${plan.label.toLowerCase()}`, subjectId, topicIds: [], specPoints: [], minutes: 20,
        marksRecoverable: stakes > 0 ? round(stakes, 1) : null, examWeight: null, daysToExam: days, evidenceStrength: 0.5, confidence: 0.55, expectedLearningGain: 0.25,
        expectedMarks: round(Math.max(1.5, stakes * 0.2), 2), proofStatus: null, requiredFirst: false, effectiveness: null, mistakeIds: [],
        explanation: {
          why: plan.reason, whyNow: `Your ${name} exam is ${days} day${days === 1 ? "" : "s"} away.`, whyBefore: "", stake: stakes > 0 ? `${round(stakes, 1)} marks are still open.` : "The exam is close, so every minute should go to what can still change.",
          evidence: plan.steps.map((s) => `${s.minutes} min: ${s.label}`),
          after: days <= FINAL_DAYS ? "Nothing new is started this close to the exam." : "Revise keeps ranking what is left.",
          proves: days <= FINAL_DAYS ? "Not claimed: there is no time left for a delayed check." : "A later check on a different question.",
        },
        route: { href: stakes > 0 ? `/practice?recover=1&subject=${encodeURIComponent(subjectId)}` : `/practice?subject=${encodeURIComponent(subjectId)}`, label: "Start session" },
      });
    }
  }
  return out;
}

export function rankRevisionActions(input: EngineInput): RevisionPlan {
  const enrolled = new Set(input.subjectIds);
  const scoped: EngineInput = { ...input, mistakes: input.mistakes.filter((m) => enrolled.has(m.subjectId)) };
  const estimate: Estimate = (kind, cause) => estimateEffectiveness(input.effectiveness ?? {}, { kind, cause });
  const drafts: Draft[] = [];
  const deferred: DeferredAction[] = [];
  const missions = collectMissions({ ...scoped, includeProven: false }).filter((m) => enrolled.has(m.subjectId));

  for (const mission of missions) {
    const d = missionDraft(mission, scoped, estimate);
    if ("skip" in d) {
      const parked = missionDraft(mission, scoped, estimate, true);
      if (!("skip" in parked)) deferred.push({ action: { ...finalise(parked, scoped), blockedBy: d.skip }, reason: d.skip });
    } else drafts.push(d);
  }
  if (input.adaptive && enrolled.has(input.adaptive.subjectId)) {
    const d = adaptiveDraft(input.adaptive, scoped);
    if (d.type === "learn-untouched" && d.daysToExam !== null && d.daysToExam <= FINAL_DAYS && (d.examWeight ?? 0) < 0.15) {
      const reason = "Too close to the exam to start a large new area unless it is worth a lot.";
      deferred.push({ action: { ...finalise(d, scoped), blockedBy: reason }, reason });
    } else drafts.push(d);
  }

  // Cards the adaptive session already retrieves are not a second decision.
  const adaptiveCards = input.adaptive?.evidence.dueCardIds.length ?? 0;
  const dueRows = (input.dueReviews ?? []).map((r) => (input.adaptive && r.subjectId === input.adaptive.subjectId
    ? { ...r, count: Math.max(0, r.count - adaptiveCards), overdue: Math.max(0, r.overdue - adaptiveCards) } : r));
  for (const row of dueRows.filter((r) => enrolled.has(r.subjectId) && r.count > 0).sort((a, b) => a.subjectId.localeCompare(b.subjectId))) {
    const days = daysToNearestExam(input.examDates, row.subjectId, input.now);
    const name = input.subjectName?.(row.subjectId) ?? row.subjectId;
    drafts.push({
      id: `action:due:${row.subjectId}`, type: "due-reviews", title: `Complete your ${name} reviews`, subjectId: row.subjectId, topicIds: [], specPoints: [],
      minutes: clamp(Math.round(row.count * 0.4), 3, 15), marksRecoverable: null, examWeight: null, daysToExam: days, evidenceStrength: 0.7, confidence: 0.7, expectedLearningGain: 0.2,
      expectedMarks: round(Math.min(row.count, 40) * 0.02 + Math.min(row.overdue, 40) * 0.03, 2), proofStatus: null, requiredFirst: false, effectiveness: null, mistakeIds: [],
      explanation: {
        why: `${row.count} card${row.count === 1 ? " is" : "s are"} due and spaced repetition only works when cards are done on time.`,
        whyNow: row.overdue > 0 ? `${row.overdue} are already overdue.` : "They are due today.", whyBefore: "", stake: `${row.count} card${row.count === 1 ? "" : "s"} due; the later they are done, the more you forget.`, evidence: [`${row.count} due`],
        after: "Each card is rescheduled by how well you remember it; what you miss comes back sooner.", proves: "Recall holds at the scheduled interval.",
      },
      route: { href: `/review?subject=${encodeURIComponent(row.subjectId)}`, label: "Start session" },
    });
  }

  // The adaptive optimiser already scores every topic, untouched ones included; separate untouched candidates only fill in when it has no plan.
  for (const t of (input.adaptive ? [] : [...(input.untouched ?? [])]).filter((u) => enrolled.has(u.subjectId)).sort((a, b) => b.share - a.share || a.topicId.localeCompare(b.topicId))) {
    const days = daysToNearestExam(input.examDates, t.subjectId, input.now);
    const share = input.topicWeight?.(t.topicId)?.share ?? t.share;
    const draft: Draft = {
      id: `action:learn:${t.topicId}`, type: "learn-untouched", title: `Learn ${t.label}`, subjectId: t.subjectId, topicIds: [t.topicId], specPoints: [], minutes: 20,
      marksRecoverable: null, examWeight: share, daysToExam: days, evidenceStrength: 0.2, confidence: 0.3, expectedLearningGain: 0.3, expectedMarks: round(share * 100 * 0.3, 2),
      proofStatus: "not-checked", requiredFirst: false, effectiveness: null, mistakeIds: [],
      explanation: {
        why: `${t.label} carries about ${Math.round(share * 100)}% of the exam and you have not started it.`,
        whyNow: days !== null ? `Your exam is ${days} day${days === 1 ? "" : "s"} away.` : "Coverage comes before depth.", whyBefore: "", stake: `About ${Math.round(share * 100)}% of the exam, not started yet.`,
        evidence: ["no answers recorded", "unknown, not weak"], after: "Revise will check it with questions and schedule a delayed retrieval.",
        proves: "Independent success on different questions, then a later check.",
      },
      route: { href: `/adaptive-session?topic=${encodeURIComponent(t.topicId)}&start=1`, label: "Start session" },
    };
    if (days !== null && days <= FINAL_DAYS && share < 0.15) {
      const reason = "Too close to the exam to start a large new area unless it is worth a lot.";
      deferred.push({ action: { ...finalise(draft, scoped), blockedBy: reason }, reason });
    } else drafts.push(draft);
  }
  drafts.push(...commandCentreDrafts(scoped, enrolled, estimate));
  if (input.coldStart && enrolled.has(input.coldStart.subjectId)) drafts.push(quickCheckDraft(input.coldStart, scoped));

  let actions = drafts.map((d) => finalise(d, scoped));

  // Regression gates new work on the same topics; everything else competes freely.
  const gates = new Map<Id, RevisionAction>();
  for (const a of actions) if (a.type === "regression-recovery") for (const t of a.topicIds) if (!gates.has(t)) gates.set(t, a);
  actions = actions.filter((a) => {
    const gate = a.topicIds.map((t) => gates.get(t)).find(Boolean);
    if (!gate || !["learn-untouched", "weak-topic", "adaptive-session"].includes(a.type)) return true;
    const reason = `Recover the marks you lost again first: ${gate.title}`;
    deferred.push({ action: { ...a, blockedBy: reason }, reason });
    return false;
  });

  actions.sort((a, b) => b.score - a.score || a.minutes - b.minutes || a.id.localeCompare(b.id));
  // With no marks-based evidence anywhere, the quick check is the only step that creates any, so it leads.
  const evidenceBased: ActionType[] = ["proof-check", "regression-recovery", "mission", "paper-repair", "recurring-error", "evidence-gap"];
  const check = actions.find((a) => a.type === "quick-check");
  if (check && !actions.some((a) => evidenceBased.includes(a.type))) actions = [check, ...actions.filter((a) => a !== check)];

  // One loss is planned once: park actions mostly covered by a better one.
  const covered = new Set<Id>();
  const kept: RevisionAction[] = [];
  for (const a of actions) {
    const overlap = a.mistakeIds.length ? a.mistakeIds.filter((id) => covered.has(id)).length / a.mistakeIds.length : 0;
    if (overlap >= 0.5) {
      const by = kept.find((k) => k.mistakeIds.some((id) => a.mistakeIds.includes(id)));
      const reason = `Covered by “${by?.title ?? "a higher-value action"}”.`;
      deferred.push({ action: { ...a, blockedBy: reason }, reason });
      continue;
    }
    a.mistakeIds.forEach((id) => covered.add(id));
    kept.push(a);
  }
  const first = kept[0];
  kept.forEach((a, i) => {
    if (i === 0) a.explanation.whyBefore = kept[1] ? explainVersus(a, kept[1]) : "It is the only action available right now.";
    else a.explanation.whyBefore = `Behind “${first!.title}”: ${explainVersus(first!, a).replace(/^Before “[^”]*” because /, "").replace(/\.$/, "")}.`;
  });
  for (const a of kept) if (a.type === "regression-recovery") a.requiredFirst = true;

  const supply = input.supplyByTopic ?? {};
  const needs = new Map<string, RevisionPlan["authoringNeeds"][number]>();
  for (const mission of missions) {
    for (const topicId of mission.topicIds) {
      const s = supply[topicId];
      if (!s) continue;
      const need = s.provable < 2 ? "unseen-verified" : s.transfer === 0 ? "transfer" : null;
      if (need) needs.set(`${topicId}:${need}`, { topicId, subjectId: mission.subjectId, need, marksAtStake: input.recovery.byTopic(topicId).open });
    }
  }
  deferred.sort((a, b) => b.action.score - a.action.score || a.action.id.localeCompare(b.action.id));
  return {
    actions: kept, top: first ?? null, deferred, model: SCORE_MODEL,
    authoringNeeds: [...needs.values()].sort((a, b) => b.marksAtStake - a.marksAtStake || a.topicId.localeCompare(b.topicId)),
  };
}

/** The best action that fits the time available, alongside the strategy for that time box. */
export function bestForTime(plan: RevisionPlan, minutes: TimeBox, strategy: TimeBoxPlan): { action: RevisionAction | null; strategy: TimeBoxPlan } {
  return { action: plan.actions.find((a) => a.minutes <= minutes + 2) ?? null, strategy };
}
