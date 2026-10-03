// ---------------------------------------------------------------------------
// Exam Missions — a short ordered sequence built around one concrete exam
// outcome ("Eliminate unit errors", "Repair the 2025 Unit 1 paper").
//
// Missions are derived, never stored: scope comes from open mistakes and their
// root-cause patterns; status and stage come from the marks-recovered ledger.
// Finishing tasks never completes a mission — only evidence does. The stage
// minutes reuse INTERVENTION_MINUTES; no scoring or recommender lives here.
// ---------------------------------------------------------------------------

import { getTopic } from "./curriculum";
import { FINAL_DAYS } from "./exam-countdown";
import { INTERVENTION_MINUTES, type InterventionKind } from "./intervention-ranking";
import { type MarkRecovery, type RecoveryTotals } from "./mark-recovery";
import { buildMistakePatterns, ROOT_CAUSE_LABEL, rootCauseOf, type MistakePattern, type RootCause } from "./mistake-patterns";
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import { evidenceLimits, limitsSentence, proofBlocked, MIN_PROVABLE_QUESTIONS, type EvidenceLimitNote, type TopicSupply } from "./supply";
import type { Id, Mistake } from "./types";

export type MissionStageKind = "diagnose" | "repair" | "practise" | "apply" | "delayed-proof" | "complete";
export type MissionStatus = "not-started" | "active" | "awaiting-proof" | "proven" | "regressed" | "blocked";
export type MissionOrigin = "pattern" | "topic" | "paper";

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  "not-started": "Not started",
  active: "Active",
  "awaiting-proof": "Awaiting proof",
  proven: "Proven",
  regressed: "Regressed",
  blocked: "Needs more questions",
};

export interface MissionStage {
  kind: MissionStageKind;
  title: string;
  /** Why this stage exists for this mission, from the evidence. */
  reason: string;
  minutes: number;
  /** Days from now it should happen: 0 today, 1 tomorrow, … */
  dayOffset: number;
  intervention: InterventionKind | null;
  done: boolean;
  /** Cannot run: no unseen questions to prove it on, or exam too close. */
  blockedBy?: string;
}

export interface ExamMission {
  id: string;
  title: string;
  origin: MissionOrigin;
  subjectId: Id;
  topicIds: Id[];
  cause: RootCause | null;
  paperId?: Id;
  mistakeIds: Id[];
  status: MissionStatus;
  stages: MissionStage[];
  current: MissionStage;
  /** Plain lines: marks lost, causes, strength, what is missing. */
  evidence: string[];
  recovery: RecoveryTotals;
  /** Unseen verified questions available to prove it on. */
  unseenAvailable: number;
  proofPossible: boolean;
  /** Why proof is limited, in plain language; empty when nothing limits it. */
  evidenceLimits: EvidenceLimitNote[];
  /** One honest sentence when proof is blocked, else null. */
  limitsSentence: string | null;
  /** When the delayed check can first count, if a success has happened. */
  proofDueAt?: string;
  completionCondition: string;
  /** Marks at stake: still open plus awaiting proof. */
  marksAtStake: number;
}

export interface MissionInput {
  mistakes: readonly Mistake[];
  recovery: MarkRecovery;
  patterns?: readonly MistakePattern[];
  daysToExam: number | null;
  /** Unseen verified questions per topic. Missing topics count as zero. Ignored when `supplyByTopic` is given. */
  unseenByTopic: Readonly<Record<Id, number>>;
  /** Richer supply (verified vs practice-only, transfer). Preferred over `unseenByTopic`. */
  supplyByTopic?: Readonly<Record<Id, TopicSupply>>;
  /** Paper titles for paper-origin missions. */
  paperTitles?: Readonly<Record<Id, string>>;
  topicTitle?: (topicId: Id) => string;
  subjectId?: Id;
  max?: number;
  /** Outcome-based ranking weight per repair type (see effectiveness.ts); 1 is neutral. */
  repairWeight?: (kind: InterventionKind) => number;
}

export const DEFAULT_MAX_MISSIONS = 3;
/** Fewer unseen questions than this cannot support a retest plus a delayed check. */
export const MIN_UNSEEN_FOR_PROOF = MIN_PROVABLE_QUESTIONS;
const DELAYED_PROOF_DAY = 5;

const defaultTitle = (id: Id) => getTopic(id)?.title ?? id;

function titleFor(origin: MissionOrigin, cause: RootCause | null, topics: string[], paperTitle?: string): string {
  if (origin === "paper") return `Repair mistakes from ${paperTitle ?? "this paper"}`;
  const where = topics.length === 1 ? ` in ${topics[0]}` : "";
  if (origin === "pattern" && cause === "unit-error") return `Eliminate unit-conversion errors${where}`;
  if (origin === "pattern" && cause === "poor-evaluation") return `Fix weak evaluation answers${where}`;
  if (origin === "pattern" && cause) return `Fix ${ROOT_CAUSE_LABEL[cause]}${where}`;
  return `Recover ${topics[0] ?? "these"} marks`;
}

function repairKind(cause: RootCause | null, patterns: readonly MistakePattern[]): InterventionKind {
  const match = cause ? patterns.find((p) => p.cause === cause) : undefined;
  return match?.intervention ?? "mistake-recovery";
}

interface Scope {
  origin: MissionOrigin;
  key: string;
  cause: RootCause | null;
  paperId?: Id;
  mistakes: Mistake[];
}

export function buildMission(scope: Scope, input: MissionInput): ExamMission {
  const topicTitle = input.topicTitle ?? defaultTitle;
  const patterns = input.patterns ?? [];
  const topicIds = [...new Set(scope.mistakes.map((m) => m.topicId))].sort();
  const mistakeIds = scope.mistakes.map((m) => m.id).sort();
  const recovery = input.recovery.forMistakes(mistakeIds);
  const supply: TopicSupply = topicIds.reduce<TopicSupply>((acc, t) => {
    const row = input.supplyByTopic?.[t] ?? { provable: input.unseenByTopic[t] ?? 0, practiceOnly: 0, transfer: input.unseenByTopic[t] ?? 0 };
    return { provable: acc.provable + row.provable, practiceOnly: acc.practiceOnly + row.practiceOnly, transfer: acc.transfer + row.transfer };
  }, { provable: 0, practiceOnly: 0, transfer: 0 });
  const unseenAvailable = supply.provable;
  const days = input.daysToExam;
  const proofFits = days === null || days > MIN_PROOF_DELAY_DAYS;
  const limits = evidenceLimits({ supply, daysToExam: days, minProofDays: MIN_PROOF_DELAY_DAYS, trustedAttempts: recovery.evidence === "none" ? 0 : recovery.evidence === "thin" ? 2 : 3, delayedChecked: recovery.proven > 0 });
  const proofPossible = !proofBlocked(limits);

  const causes = scope.mistakes.map((m) => rootCauseOf(m));
  const unclassified = causes.filter((c) => c === "unclassified").length / Math.max(1, causes.length);
  const recurring = patterns.some((p) => p.recurring && p.mistakeIds.some((id) => mistakeIds.includes(id)));
  const questions = new Set(scope.mistakes.map((m) => m.questionId ?? m.id)).size;
  const recallLost = scope.mistakes.filter((m) => m.category === "recall").reduce((s, m) => s + m.marksLost, 0);
  const lost = recovery.previouslyLost;

  const evidence = [
    `${lost} mark${lost === 1 ? "" : "s"} lost across ${questions} question${questions === 1 ? "" : "s"}`,
    ...(scope.cause && scope.cause !== "unclassified" ? [`${recurring ? "recurring " : ""}${ROOT_CAUSE_LABEL[scope.cause]}`] : []),
    ...(lost >= 4 && recallLost / lost <= 0.2 && recovery.evidence === "adequate" ? ["recall does not look like the problem"] : []),
    ...(recovery.evidence !== "adequate" ? ["evidence is still thin"] : []),
    ...(!proofPossible ? [unseenAvailable < MIN_UNSEEN_FOR_PROOF ? (supply.practiceOnly > 0 && supply.provable === 0 ? "only unverified unseen questions remain, which cannot prove improvement" : "too few unseen questions to prove improvement") : "too close to the exam for a delayed check"] : []),
    ...(recovery.proven === 0 && recovery.provisional === 0 ? ["no proof yet"] : []),
  ];

  const touched = recovery.targeted > 0;
  const succeeded = recovery.provisional + recovery.proven > 0;
  const independentlyDone = recovery.awaitingProof + recovery.proven > 0;
  const finished = recovery.open === 0 && recovery.provisional === 0 && recovery.awaitingProof === 0 && recovery.proven > 0;
  const kind = repairKind(scope.cause, patterns);
  const final = days !== null && days <= FINAL_DAYS;

  const stages: MissionStage[] = [];
  const add = (stage: Omit<MissionStage, "done"> & { done?: boolean }) => stages.push({ done: false, ...stage });
  if (unclassified >= 0.5 && !final) {
    add({ kind: "diagnose", title: "Diagnose the cause", reason: `Why ${Math.round(unclassified * 100)}% of these losses happened is not classified yet.`, minutes: 6, dayOffset: 0, intervention: null, done: false });
  }
  add({ kind: "repair", title: `Repair: ${ROOT_CAUSE_LABEL[scope.cause ?? "unclassified"]}`, reason: "Fix the specific cause before more practice, so practice is not just repeating the error.", minutes: INTERVENTION_MINUTES[kind], dayOffset: 0, intervention: kind, done: touched });
  add({ kind: "practise", title: "Practise with support", reason: "Show the repair works on a question with the same demands.", minutes: INTERVENTION_MINUTES["supported-question"], dayOffset: 0, intervention: "supported-question", done: succeeded });
  add({ kind: "apply", title: "Apply to unfamiliar questions", reason: "Success on a different question is what separates learning from memorising.", minutes: INTERVENTION_MINUTES["independent-set"], dayOffset: 1, intervention: "independent-set", done: independentlyDone,
    ...(unseenAvailable < MIN_UNSEEN_FOR_PROOF ? { blockedBy: "Fewer than two unseen questions are available on these topics." } : {}) });
  if (proofFits) {
    add({ kind: "delayed-proof", title: "Delayed check", reason: `Revise checks again at least ${MIN_PROOF_DELAY_DAYS} days later, on another new question.`, minutes: INTERVENTION_MINUTES["delayed-proof-retest"], dayOffset: Math.min(DELAYED_PROOF_DAY, Math.max(MIN_PROOF_DELAY_DAYS, (days ?? DELAYED_PROOF_DAY) - 1)), intervention: "delayed-proof-retest", done: finished,
      ...(unseenAvailable < MIN_UNSEEN_FOR_PROOF ? { blockedBy: "No independent unseen question is left to prove this on." } : {}) });
  }
  add({ kind: "complete", title: "Complete", reason: "Only evidence closes a mission.", minutes: 0, dayOffset: stages.at(-1)?.dayOffset ?? 0, intervention: null, done: finished });

  const current = stages.find((s) => !s.done) ?? stages[stages.length - 1];

  let status: MissionStatus;
  if (recovery.regressed > 0) status = "regressed";
  else if (finished) status = "proven";
  else if (recovery.open === 0 && recovery.provisional > 0) status = "awaiting-proof";
  else if (!touched && !succeeded && recovery.open > 0 && lost === recovery.open) status = "not-started";
  else status = "active";
  if (status !== "proven" && status !== "regressed" && !proofPossible && (current.kind === "apply" || current.kind === "delayed-proof" || status === "awaiting-proof")) status = "blocked";
  if (status === "regressed") {
    const repair = stages.find((s) => s.kind === "repair")!;
    repair.done = false;
  }

  const topics = topicIds.map(topicTitle);
  const completionCondition = proofFits
    ? `Independent success on a different question family at least ${MIN_PROOF_DELAY_DAYS} days after the first success.`
    : "The exam is too close for a delayed check, so this mission can improve marks but cannot be proven.";

  const proofDueAt = input.recovery.items.filter((i) => mistakeIds.includes(i.mistakeId) && i.proofDueAt).map((i) => i.proofDueAt!).sort()[0];
  return {
    id: `mission:${scope.origin}:${scope.key}`,
    title: titleFor(scope.origin, scope.cause, topics, scope.paperId ? input.paperTitles?.[scope.paperId] : undefined),
    origin: scope.origin,
    subjectId: scope.mistakes[0]?.subjectId ?? input.subjectId ?? "",
    topicIds,
    cause: scope.cause,
    ...(scope.paperId ? { paperId: scope.paperId } : {}),
    mistakeIds,
    status,
    stages,
    current: stages.find((s) => !s.done) ?? current,
    evidence,
    recovery,
    unseenAvailable,
    proofPossible,
    evidenceLimits: limits,
    limitsSentence: limitsSentence(limits),
    ...(proofDueAt ? { proofDueAt } : {}),
    completionCondition,
    marksAtStake: Math.round((recovery.open + recovery.awaitingProof + recovery.provisional) * 10) / 10,
  };
}

/** Missions in priority order: most marks at stake first, recurring causes ahead of one-off topics. */
/** A mistake belongs in a mission until it is proven, so a resolved retest still leaves the delayed check owed. */
function missionMembers(input: MissionInput, subjectId?: Id): Mistake[] {
  const state = new Map(input.recovery.items.map((i) => [i.mistakeId, i.state] as const));
  return input.mistakes.filter((m) => m.marksLost > 0 && (!subjectId || m.subjectId === subjectId) &&
    !(m.resolved && (state.get(m.id) ?? "open") === "open"));
}

function dominantCause(members: readonly Mistake[]): RootCause | null {
  const causes = new Map<RootCause, number>();
  for (const m of members) causes.set(rootCauseOf(m), (causes.get(rootCauseOf(m)) ?? 0) + m.marksLost);
  return [...causes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/**
 * Missions across every subject, ranked together. Scopes are built per subject
 * (a recurring cause in Maths and in Physics are two missions) and the result
 * never depends on the order subjects or mistakes arrive in.
 */
export function buildExamMissions(input: MissionInput & { includeProven?: boolean }): ExamMission[] {
  const all = missionMembers(input, input.subjectId);
  const subjects = [...new Set(all.map((m) => m.subjectId))].sort();
  const missions: ExamMission[] = [];
  for (const subjectId of subjects) {
    const live = all.filter((m) => m.subjectId === subjectId);
    const patterns = buildMistakePatterns({ mistakes: live, attempts: [], questions: [] });
    const withPatterns = { ...input, patterns };
    const taken = new Set<Id>();
    const scopes: Scope[] = [];
    for (const p of patterns) {
      if (p.cause === "unclassified" || !p.recurring) continue;
      const members = live.filter((m) => p.mistakeIds.includes(m.id));
      if (members.length < 2) continue;
      scopes.push({ origin: "pattern", key: `${p.cause}:${subjectId}`, cause: p.cause, mistakes: members });
      members.forEach((m) => taken.add(m.id));
    }
    const byTopic = new Map<Id, Mistake[]>();
    for (const m of live) if (!taken.has(m.id)) byTopic.set(m.topicId, [...(byTopic.get(m.topicId) ?? []), m]);
    for (const [topicId, members] of byTopic) scopes.push({ origin: "topic", key: topicId, cause: dominantCause(members), mistakes: members });
    for (const scope of scopes) missions.push(buildMission(scope, withPatterns));
  }
  const weight = (m: ExamMission) => input.repairWeight?.(m.stages.find((s) => s.kind === "repair")?.intervention ?? "mistake-recovery") ?? 1;
  const rank = (m: ExamMission) => (m.status === "regressed" ? 1000 : 0) + (m.marksAtStake + (m.origin === "pattern" ? 2 : 0)) * weight(m);
  return missions
    .filter((m) => input.includeProven || m.status !== "proven")
    .sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))
    .slice(0, input.max ?? DEFAULT_MAX_MISSIONS);
}

/** A mission that begins from one paper's autopsy: every open loss on that paper. */
export function buildPaperMission(paperId: Id, input: MissionInput): ExamMission | null {
  const paperMistakeIds = new Set(input.recovery.items.filter((i) => i.paperId === paperId).map((i) => i.mistakeId));
  const members = missionMembers(input).filter((m) => paperMistakeIds.has(m.id));
  if (!members.length) return null;
  const cause = dominantCause(members);
  return buildMission({ origin: "paper", key: paperId, cause, paperId, mistakes: members }, { ...input, patterns: input.patterns ?? buildMistakePatterns({ mistakes: members, attempts: [], questions: [] }) });
}

export interface MissionNextAction {
  missionId: Id | string;
  title: string;
  minutes: number;
  /** Why this, in one sentence. */
  why: string;
  /** What Revise does afterwards. */
  after: string;
  /** What will prove it worked. */
  proof: string;
  stage: MissionStageKind;
  blocked: boolean;
  /** Mission session route: the practice page rebuilds this stage's questions from the mission id. */
  href: string;
}

export function missionNextAction(mission: ExamMission): MissionNextAction {
  const stage = mission.current;
  const next = mission.stages.find((s) => !s.done && s !== stage && s.kind !== "complete");
  const marks = mission.recovery.previouslyLost;
  const when = (offset: number) => (offset <= 0 ? "later today" : offset === 1 ? "tomorrow" : `in ${offset} days`);
  return {
    missionId: mission.id,
    title: mission.status === "not-started" ? `Start: ${mission.title}` : `Continue: ${mission.title}`,
    minutes: stage.minutes,
    why: `${stage.reason} ${marks} mark${marks === 1 ? "" : "s"} are attached to this.`,
    after: next ? `Next, ${next.title.toLowerCase()} ${when(next.dayOffset)}.` : mission.status === "proven" ? "Proven. Nothing more needed here." : "Revise will check again when new evidence arrives.",
    proof: mission.completionCondition,
    stage: stage.kind,
    blocked: Boolean(stage.blockedBy) || mission.status === "blocked",
    href: `/practice?mission=${encodeURIComponent(mission.id)}&stage=${encodeURIComponent(stage.kind)}`,
  };
}
