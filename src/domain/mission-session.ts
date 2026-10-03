// ---------------------------------------------------------------------------
// Mission sessions: the questions an Exam Mission stage actually runs, chosen
// for the mission's target weakness across every topic it touches, with the
// support level and the attribution every attempt carries (mission, stage,
// intervention, target cause, source mistakes) so its effect can be measured.
//
// Pure: no store, no clock beyond the optional `now`. Proof-bearing stages
// (apply, transfer, delayed proof) only use verified, unseen questions and
// say so when the supply is not there.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import type { ExamMission, MissionStageKind } from "./exam-mission";
import { isTransferQuestion, partLearningMetadata, questionFamilies, unseenQuestion } from "./learning-evidence";
import type { RootCause } from "./mistake-patterns";
import type { MissionCheckpointState, RevisionCheckpointInput } from "./revision-checkpoint";
import type { Attempt, Id, MissionAttemptContext, Mistake, Question } from "./types";

export type MissionStepKind = MissionAttemptContext["stage"];

export interface MissionSessionStep {
  id: string;
  kind: MissionStepKind;
  title: string;
  why: string;
  questionIds: Id[];
  /** undefined = full hint ladder; 0 = unaided, so the answer counts as independent evidence. */
  hintBudget: number | undefined;
  minutes: number;
  /** Every question in the step is human-verified. */
  verified: boolean;
  context: MissionAttemptContext;
}

export interface MissionSession {
  missionId: string;
  title: string;
  stage: MissionStageKind;
  steps: MissionSessionStep[];
  questionIds: Id[];
  minutes: number;
  /** Why this session is built the way it is. */
  intro: string[];
  /** Set when the stage cannot produce proof, and why. */
  limit: string | null;
  hintBudgetFor: Record<Id, number | undefined>;
  contextFor: Record<Id, MissionAttemptContext>;
}

export interface MissionSessionInput {
  questions: readonly Question[];
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
}

const COMMAND = /^\s*(evaluate|assess|discuss|justify|compare|suggest|explain)\b/i;

function demandOf(q: Question): string | undefined {
  return q.learning?.demand ?? q.parts.map((p) => partLearningMetadata(q, p)?.demand).find(Boolean);
}

/** How well a question exercises the weakness the mission targets (0 = neutral). */
export function causeFit(q: Question, cause: RootCause | null): number {
  const demand = demandOf(q);
  switch (cause) {
    case "unit-error": case "arithmetic-slip": case "incomplete-working":
      return q.kind === "calculation" || demand === "calculation" ? 2 : 0;
    case "poor-evaluation": case "insufficient-explanation":
      return q.kind === "extended" || demand === "explanation" ? 2 : q.parts.some((p) => COMMAND.test(p.prompt)) ? 1 : 0;
    case "command-word-error": return q.parts.some((p) => COMMAND.test(p.prompt)) ? 2 : 0;
    case "poor-application": case "wrong-method": return demand === "application" || demand === "calculation" ? 2 : 0;
    case "missing-knowledge": return demand === "recall" || q.kind === "short" || q.kind === "mcq" ? 2 : 0;
    case "misunderstood-concept": return demand === "misconception" || demand === "explanation" ? 2 : 0;
    default: return 0;
  }
}

const minutesFor = (q: Question) => Math.max(0.5, q.learning?.expectedMinutes ?? q.totalMarks * 0.75);
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Pick { max: number; verifiedOnly: boolean; transferOnly?: boolean }

export function buildMissionSession(mission: ExamMission, input: MissionSessionInput, stageOverride?: MissionStageKind): MissionSession {
  const stage = stageOverride ?? mission.current.kind;
  const byId = new Map(input.questions.map((q) => [q.id, q] as const));
  const sources = input.mistakes.filter((m) => mission.mistakeIds.includes(m.id) && m.questionId && byId.has(m.questionId))
    .sort((a, b) => b.marksLost - a.marksLost || a.id.localeCompare(b.id));
  const sourceFamilies = new Set(sources.flatMap((m) => questionFamilies(byId.get(m.questionId!)!)));
  const sourceIds = new Set(sources.map((m) => m.questionId!));
  const usedFamilies = new Set<string>(sourceFamilies);
  const used = new Set<Id>();
  const interventionOf = (kind: MissionStageKind) => mission.stages.find((s) => s.kind === kind)?.intervention ?? null;
  const ctx = (kind: MissionStepKind): MissionAttemptContext => ({
    missionId: mission.id, stage: kind, intervention: kind === "transfer" ? "transfer-set" : kind === "apply" ? "independent-set" : interventionOf(kind === "delayed-proof" ? "delayed-proof" : kind as MissionStageKind),
    targetCause: mission.cause, sourceMistakeIds: [...mission.mistakeIds],
  });

  const topics = mission.topicIds;
  const pool = input.questions.filter((q) => !sourceIds.has(q.id) && q.topicIds.some((t) => topics.includes(t)) && unseenQuestion(q, input.attempts, input.questions));
  const unseenPick = ({ max, verifiedOnly, transferOnly }: Pick): Question[] => {
    const cand = pool
      .filter((q) => !used.has(q.id) && (!verifiedOnly || trustedAssessmentContent(q)) && (!transferOnly || isTransferQuestion(q)))
      .sort((a, b) => causeFit(b, mission.cause) - causeFit(a, mission.cause) || Number(trustedAssessmentContent(b)) - Number(trustedAssessmentContent(a)) || a.id.localeCompare(b.id));
    const out: Question[] = [];
    const topicCount = new Map<Id, number>();
    while (out.length < max) {
      // Spread across the mission's topics: take the least-used topic's best remaining question.
      const next = cand
        .filter((q) => !out.includes(q) && !questionFamilies(q).some((f) => usedFamilies.has(f)))
        .sort((a, b) => Math.min(...a.topicIds.map((t) => topicCount.get(t) ?? 0)) - Math.min(...b.topicIds.map((t) => topicCount.get(t) ?? 0)))[0];
      if (!next) break;
      out.push(next);
      next.topicIds.forEach((t) => topicCount.set(t, (topicCount.get(t) ?? 0) + 1));
      questionFamilies(next).forEach((f) => usedFamilies.add(f));
      used.add(next.id);
    }
    return out;
  };
  const resits = (max: number): Question[] => {
    const seenTopics = new Set<Id>();
    const out: Question[] = [];
    for (const m of [...sources].sort((a, b) => Number(seenTopics.has(a.topicId)) - Number(seenTopics.has(b.topicId)))) {
      if (out.length >= max) break;
      const q = byId.get(m.questionId!)!;
      if (out.includes(q)) continue;
      out.push(q); seenTopics.add(m.topicId);
    }
    return out;
  };

  const steps: MissionSessionStep[] = [];
  const add = (kind: MissionStepKind, title: string, why: string, qs: Question[], hintBudget: number | undefined) => {
    if (!qs.length) return;
    steps.push({
      id: `${mission.id}:${kind}`, kind, title, why, questionIds: qs.map((q) => q.id), hintBudget,
      minutes: round1(qs.reduce((s, q) => s + minutesFor(q), 0)), verified: qs.every(trustedAssessmentContent), context: ctx(kind),
    });
  };

  let limit: string | null = null;
  const proofStage = stage === "apply" || stage === "delayed-proof";
  if (stage === "diagnose") {
    add("diagnose", "Find the exact error", "Re-sit the questions where marks were lost, across topics, with working shown, so the error can be classified precisely.", resits(2), undefined);
  } else if (stage === "repair") {
    add("repair", "Repair it", "Re-sit the highest-loss questions with help available, so the fix is applied to the exact place it went wrong.", resits(3), undefined);
  } else if (stage === "practise") {
    add("practise", "Supported practice", "New questions that exercise the same weakness, with limited help.", unseenPick({ max: 3, verifiedOnly: false }), undefined);
  } else if (stage === "apply") {
    add("apply", "Independent application", "Different question families, no hints, so success counts as independent evidence.", unseenPick({ max: 2, verifiedOnly: true }), 0);
    add("transfer", "Unfamiliar context", "The same skill in a context you have not seen.", unseenPick({ max: 1, verifiedOnly: true, transferOnly: true }), 0);
  } else if (stage === "delayed-proof") {
    add("delayed-proof", "Delayed check", "A separate question, later, answered independently. This is what proves the marks are back.", unseenPick({ max: 2, verifiedOnly: true }), 0);
  }
  if (proofStage && !steps.length) {
    limit = mission.limitsSentence ?? "There are no unseen verified questions left for this stage, so Revise cannot prove improvement here yet.";
  } else if (proofStage && stage === "apply" && !steps.some((s) => s.kind === "transfer")) {
    limit = "No unseen verified unfamiliar-context question exists for this mission, so transfer cannot be tested yet.";
  }
  const questionIds = steps.flatMap((s) => s.questionIds);
  const hintBudgetFor: Record<Id, number | undefined> = {};
  const contextFor: Record<Id, MissionAttemptContext> = {};
  for (const step of steps) for (const id of step.questionIds) { hintBudgetFor[id] = step.hintBudget; contextFor[id] = step.context; }
  return {
    missionId: mission.id, title: mission.title, stage, steps, questionIds,
    minutes: round1(steps.reduce((s, x) => s + x.minutes, 0)),
    intro: [
      mission.evidence[0] ?? "",
      mission.cause ? `Every question targets ${mission.cause.replace(/-/g, " ")}, across ${topics.length} topic${topics.length === 1 ? "" : "s"}.` : "",
      mission.completionCondition,
    ].filter(Boolean),
    limit, hintBudgetFor, contextFor,
  };
}

export function stageForRoute(value: string | null): MissionStageKind | undefined {
  return ["diagnose", "repair", "practise", "apply", "delayed-proof"].includes(value ?? "") ? (value as MissionStageKind) : undefined;
}

export function missionHref(missionId: string, stage: MissionStageKind): string {
  return `/practice?mission=${encodeURIComponent(missionId)}&stage=${encodeURIComponent(stage)}`;
}

/** Position a resumed mission step continues from: the first question without an answer from this run. */
export function missionResumePosition(questionIds: readonly Id[], attempts: readonly Attempt[], startedAt: string): number {
  const answered = new Set(attempts.filter((a) => a.createdAt >= startedAt).map((a) => a.questionId));
  const next = questionIds.findIndex((id) => !answered.has(id));
  return next === -1 ? questionIds.length : next;
}

export function missionCheckpoint(session: MissionSession, route: { stage: string | null }, startedAt: string, position: number): RevisionCheckpointInput {
  const stage = route.stage ?? "";
  return {
    activity: "practice",
    title: session.title,
    href: `/practice?mission=${encodeURIComponent(session.missionId)}${stage ? `&stage=${encodeURIComponent(stage)}` : ""}`,
    position,
    total: session.questionIds.length,
    queueIds: session.questionIds,
    mission: {
      missionId: session.missionId, stage, startedAt, questionIds: [...session.questionIds],
      hintBudgetFor: Object.fromEntries(session.questionIds.map((id) => [id, session.hintBudgetFor[id] ?? null])),
      contextFor: Object.fromEntries(session.questionIds.flatMap((id) => (session.contextFor[id] ? [[id, session.contextFor[id]!]] : []))),
    },
  };
}

/**
 * The saved step, when it is for this mission and stage and every question still exists.
 * Otherwise null, so the caller builds a fresh session instead of guessing.
 */
export function restoreMissionSession(session: MissionSession, saved: MissionCheckpointState | undefined, route: { missionId: string; stage: string | null }, questionExists: (id: Id) => boolean): MissionSession | null {
  if (!saved || saved.missionId !== route.missionId || saved.stage !== (route.stage ?? "")) return null;
  if (!saved.questionIds.length || !saved.questionIds.every(questionExists)) return null;
  return {
    ...session,
    questionIds: [...saved.questionIds],
    hintBudgetFor: Object.fromEntries(saved.questionIds.map((id) => [id, saved.hintBudgetFor[id] ?? undefined])),
    contextFor: { ...saved.contextFor },
  };
}
