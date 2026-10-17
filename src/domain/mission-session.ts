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

import { learnerEvidenceTrusted } from "./content-trust";
import type { ExamMission, MissionStageKind } from "./exam-mission";
import { isTransferQuestion, partLearningMetadata, questionFamilies, unseenQuestion } from "./learning-evidence";
import type { RootCause } from "./mistake-patterns";
import type { MissionCheckpointState, RevisionCheckpointInput } from "./revision-checkpoint";
import type { Attempt, Id, MissionAttemptContext, Mistake, Question } from "./types";

export type MissionStepKind = MissionAttemptContext["stage"];

export interface ProofCandidateOptions {
  /** Hard cap on how many questions to return. */
  max: number;
  /** Only questions a human has reviewed can count as evidence of improvement. */
  verifiedOnly: boolean;
  /** Restrict to unfamiliar-context questions, so transfer can be tested. */
  transferOnly?: boolean;
  /** Questions already used elsewhere in this run (e.g. re-sit source questions). */
  excludeQuestionIds?: Iterable<Id>;
  /** Families already sat in this run, so a near-identical question cannot stand in for a new one. */
  excludeFamilies?: Iterable<string>;
  /** Bias for ordering, e.g. how well a question matches a target root cause. */
  fit?: (question: Question) => number;
}

/**
 * The questions that may act as independent evidence on a topic: genuinely
 * unseen (new family, not a shallow reskin of something already sat), reviewed
 * when the stage claims proof, spread across the topic's siblings so one set
 * cannot quietly become the only evidence for everything.
 *
 * Mission proof stages and the standalone proof check both call this, so
 * eligibility cannot drift between them.
 */
export function selectProofCandidates(
  questions: readonly Question[],
  attempts: readonly Attempt[],
  topicIds: readonly Id[],
  options: ProofCandidateOptions,
): Question[] {
  const excluded = new Set(options.excludeQuestionIds ?? []);
  const pool = questions.filter((q) => !excluded.has(q.id) && q.topicIds.some((t) => topicIds.includes(t)) && unseenQuestion(q, attempts, questions));
  const fit = options.fit ?? (() => 0);
  // `learnerEvidenceTrusted`, not `trustedAssessmentContent`: the latter is
  // deliberately permissive for subjects with no review gate, so it would treat
  // an unreviewed reference-tier question as human-reviewed proof supply. Every
  // question here is shown to the learner as "counts as evidence", so the
  // flagship-and-reviewed predicate is the only honest one.
  const cand = pool
    .filter((q) => (!options.verifiedOnly || learnerEvidenceTrusted(q)) && (!options.transferOnly || isTransferQuestion(q)))
    .sort((a, b) => fit(b) - fit(a) || Number(learnerEvidenceTrusted(b)) - Number(learnerEvidenceTrusted(a)) || a.id.localeCompare(b.id));
  const out: Question[] = [];
  const usedFamilies = new Set<string>(options.excludeFamilies ?? []);
  const used = new Set<Id>();
  const topicCount = new Map<Id, number>();
  while (out.length < options.max) {
    // Take the least-used topic's best remaining question.
    const next = cand
      .filter((q) => !used.has(q.id) && !questionFamilies(q).some((f) => usedFamilies.has(f)))
      .sort((a, b) => Math.min(...a.topicIds.map((t) => topicCount.get(t) ?? 0)) - Math.min(...b.topicIds.map((t) => topicCount.get(t) ?? 0)))[0];
    if (!next) break;
    out.push(next);
    next.topicIds.forEach((t) => topicCount.set(t, (topicCount.get(t) ?? 0) + 1));
    questionFamilies(next).forEach((f) => usedFamilies.add(f));
    used.add(next.id);
  }
  return out;
}

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
const DATA_WORDS = /\b(?:graph|plot(?:s|ted)?|gradient|data|results|readings|measure(?:s|d|ments)?)\b/i;

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
    case "data-interpretation": return DATA_WORDS.test(`${q.stem} ${q.parts.map((p) => p.prompt).join(" ")}`) ? 2 : 0;
    default: return 0;
  }
}

/** Only a non-empty set of teacher-reviewed flagship questions may be described as evidence or proof. */
const proofEligible = (qs: readonly Question[]): boolean => qs.length > 0 && qs.every(learnerEvidenceTrusted);

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
  const interventionOf = (kind: MissionStageKind) => mission.stages.find((s) => s.kind === kind)?.intervention ?? null;
  const ctx = (kind: MissionStepKind): MissionAttemptContext => ({
    missionId: mission.id, stage: kind, intervention: kind === "transfer" ? "transfer-set" : kind === "apply" ? "independent-set" : interventionOf(kind === "delayed-proof" ? "delayed-proof" : kind as MissionStageKind),
    targetCause: mission.cause, sourceMistakeIds: [...mission.mistakeIds],
  });

  const topics = mission.topicIds;
  // A mission draws several rungs from one pool, so keep them apart.
  const used = new Set<Id>(sourceIds);
  const usedFamilies = new Set<string>(sourceFamilies);
  const unseenPick = ({ max, verifiedOnly, transferOnly }: Pick): Question[] => {
    const picked = selectProofCandidates(input.questions, input.attempts, topics, {
      max,
      verifiedOnly,
      transferOnly,
      excludeQuestionIds: used,
      excludeFamilies: usedFamilies,
      fit: (q) => causeFit(q, mission.cause),
    });
    for (const q of picked) {
      used.add(q.id);
      questionFamilies(q).forEach((f) => usedFamilies.add(f));
    }
    return picked;
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

  // Repair works on the skill, not the memory of one question: re-sitting the
  // question answered minutes ago mostly tests recall of its mark scheme. For
  // each lost mark (highest first) take an unseen question from a different
  // family that shares the lost part's spec point or capability; only when
  // the bank has none does the original come back.
  const repairSet = (max: number): { questions: Question[]; resat: number } => {
    const out: Question[] = [];
    let resat = 0;
    for (const m of sources) {
      if (out.length >= max) break;
      const source = byId.get(m.questionId!)!;
      const lostPart = source.parts.find((p) => p.id === m.partId);
      const skills = new Set<string>([
        ...(m.capabilityIds ?? []),
        ...(lostPart ? [lostPart] : source.parts).flatMap((p) => [...(p.specPointIds ?? []), ...(p.capabilityIds ?? [])]),
      ]);
      const overlap = (q: Question) => q.parts.reduce((n, p) => n + [...(p.specPointIds ?? []), ...(p.capabilityIds ?? [])].filter((id) => skills.has(id)).length, 0);
      const [sibling] = selectProofCandidates(input.questions, input.attempts, [m.topicId], {
        max: 1,
        verifiedOnly: false,
        excludeQuestionIds: used,
        excludeFamilies: usedFamilies,
        fit: (q) => overlap(q) * 10 + causeFit(q, mission.cause),
      });
      if (sibling && (skills.size === 0 || overlap(sibling) > 0)) {
        out.push(sibling);
        used.add(sibling.id);
        questionFamilies(sibling).forEach((f) => usedFamilies.add(f));
      } else if (!out.includes(source)) {
        out.push(source);
        resat++;
      }
    }
    return { questions: out, resat };
  };

  const steps: MissionSessionStep[] = [];
  const add = (kind: MissionStepKind, title: string, why: string, qs: Question[], hintBudget: number | undefined) => {
    if (!qs.length) return;
    steps.push({
      id: `${mission.id}:${kind}`, kind, title, why, questionIds: qs.map((q) => q.id), hintBudget,
      minutes: round1(qs.reduce((s, q) => s + minutesFor(q), 0)), verified: qs.every(learnerEvidenceTrusted), context: ctx(kind),
    });
  };

  let limit: string | null = null;
  const proofStage = stage === "apply" || stage === "delayed-proof";
  if (stage === "diagnose") {
    add("diagnose", "Find the exact error", "Re-sit the questions where marks were lost, across topics, with working shown, so the error can be classified precisely.", resits(2), undefined);
  } else if (stage === "repair") {
    const repair = repairSet(3);
    const why = repair.resat === 0
      ? "A different question on each skill you lost marks on, with help available, so the fix is practised rather than remembered from a few minutes ago."
      : repair.resat === repair.questions.length
        ? "Re-sit the questions where marks were lost, with help available: Revise has no other question on these skills yet."
        : "A different question on each skill you lost marks on, with help available. Where Revise has no other question on that skill yet, you re-sit the original.";
    add("repair", "Repair it", why, repair.questions, undefined);
  } else if (stage === "practise") {
    add("practise", "Supported practice", "New questions that exercise the same weakness, with limited help.", unseenPick({ max: 3, verifiedOnly: false }), undefined);
  } else if (stage === "apply" && mission.proofBarrier) {
    // The lost marks can never count as proof, so reviewed-only selection would only empty the step.
    // Any unseen question works for an unaided practice check; it is labelled practice, not proof.
    add("apply", "Unaided practice", "Different question families, no hints, so you can see whether the fix works on its own. Practice, not proof.", unseenPick({ max: 2, verifiedOnly: false }), 0);
  } else if (stage === "apply") {
    // The evidence claim is made only when every question in the step is
    // teacher-reviewed flagship content (learnerEvidenceTrusted). Reviewed-only
    // selection already guarantees that today; the wording checks it again so
    // a future change to the selection cannot leave the claim behind.
    const applied = unseenPick({ max: 2, verifiedOnly: true });
    add("apply", "Independent application", proofEligible(applied)
      ? "Different question families, no hints, so success counts as independent evidence."
      : "Different question families, no hints. Practice, not proof: these questions are not teacher-reviewed yet.", applied, 0);
    add("transfer", "Unfamiliar context", "The same skill in a context you have not seen.", unseenPick({ max: 1, verifiedOnly: true, transferOnly: true }), 0);
  } else if (stage === "delayed-proof" && mission.proofBarrier) {
    // No proof check can run on a loss that cannot count; the limit below says why.
  } else if (stage === "delayed-proof") {
    const delayed = unseenPick({ max: 2, verifiedOnly: true });
    add("delayed-proof", "Delayed check", proofEligible(delayed)
      ? "A separate question, later, answered independently. This is what proves the marks are back."
      : "A separate question, later, answered independently. Practice, not proof: these questions are not teacher-reviewed yet.", delayed, 0);
  }
  if (proofStage && mission.proofBarrier) {
    // With steps, the intro's completion condition already says why this is practice.
    limit = steps.length ? null : mission.limitsSentence ?? mission.completionCondition;
  } else if (proofStage && !steps.length) {
    limit = mission.limitsSentence ?? "Revise does not have enough reviewed new questions to prove improvement here yet.";
  } else if (proofStage && stage === "apply" && !steps.some((s) => s.kind === "transfer")) {
    limit = "Revise does not have a reviewed unfamiliar-context question for this yet, so transfer cannot be tested.";
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

/** Answers from a saved mission step's own run: the ones a resume keeps and counts its position from. */
export function missionRunAttempts(saved: MissionCheckpointState, attempts: readonly Attempt[]): Attempt[] {
  return attempts.filter((a) => a.createdAt >= saved.startedAt && a.mission?.missionId === saved.missionId && saved.questionIds.includes(a.questionId));
}

export interface MissionContinuation { missionId: Id; stage: string; href: string; position: number; total: number }

/**
 * The mission step Today can send the learner back into, or null. Only a checkpoint that carries its
 * saved step (so the route restores those exact questions rather than re-planning), whose route still
 * names that mission and stage, and that has a question left unanswered in this run.
 */
export function missionContinuation(checkpoint: RevisionCheckpointInput | null | undefined, attempts: readonly Attempt[]): MissionContinuation | null {
  const saved = checkpoint?.activity === "practice" ? checkpoint.mission : undefined;
  if (!checkpoint || !saved || !saved.questionIds.length) return null;
  const route = new URLSearchParams(checkpoint.href.split("?")[1] ?? "");
  if (route.get("mission") !== saved.missionId || (route.get("stage") ?? "") !== saved.stage) return null;
  const position = missionResumePosition(saved.questionIds, missionRunAttempts(saved, attempts), saved.startedAt);
  if (position >= saved.questionIds.length) return null;
  return { missionId: saved.missionId, stage: saved.stage, href: checkpoint.href, position, total: saved.questionIds.length };
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

/** Questions a standalone proof check runs: two, reviewed, unseen, no hints. */
export const PROOF_CHECK_QUESTIONS = 2;

export interface ProofCheck {
  topicId: Id;
  questionIds: Id[];
  minutes: number;
  /** Every question is human-reviewed, so the answer can count as evidence. */
  verified: boolean;
  /** Set when there is not enough reviewed unseen supply, and why. */
  limit: string | null;
  /** Always 0: a proof check is by definition unaided. */
  hintBudget: 0;
}

/**
 * A delayed proof check for a topic that has a baseline but no follow-up yet.
 *
 * It runs the same questions, at the same support level, as a mission's
 * delayed-proof stage — reviewed, unseen, no hints — so an answer from here
 * feeds exactly the same proof ledger. If there is not enough reviewed unseen
 * supply the check says so instead of quietly running something that cannot
 * count.
 */
export function buildProofCheck(input: {
  topicId: Id;
  questions: readonly Question[];
  attempts: readonly Attempt[];
}): ProofCheck {
  const picked = selectProofCandidates(input.questions, input.attempts, [input.topicId], {
    max: PROOF_CHECK_QUESTIONS,
    verifiedOnly: true,
  });
  const ids = picked.map((q) => q.id);
  return {
    topicId: input.topicId,
    questionIds: ids,
    minutes: round1(picked.reduce((sum, q) => sum + minutesFor(q), 0)),
    verified: picked.length > 0 && picked.every(learnerEvidenceTrusted),
    limit: ids.length
      ? null
      : "Revise does not have enough reviewed new questions for this topic to test the improvement yet. Keep revising it, and the proof will open as soon as there is reviewed supply.",
    hintBudget: 0,
  };
}

/** The route that runs a standalone proof check on a topic. */
export function proofHref(subjectId: Id, topicId: Id): string {
  return `/practice?proof=${encodeURIComponent(topicId)}&subject=${encodeURIComponent(subjectId)}`;
}

/**
 * A proof check saves its run in the checkpoint's existing step state
 * (`MissionCheckpointState`: start instant, exact questions, hint budget), so a
 * refresh resumes the same run. The schema is unchanged: the run id is
 * `proof:<topicId>` and the stage is `proof-check`, neither of which any
 * mission route carries, so mission resume (`restoreMissionSession`,
 * `missionContinuation`) never mistakes it for a mission step.
 */
export const PROOF_CHECK_STAGE = "proof-check";
export const proofCheckRunId = (topicId: Id): string => `proof:${topicId}`;

export function proofCheckCheckpoint(check: ProofCheck, input: { title: string; subjectId: Id }, startedAt: string, position: number): RevisionCheckpointInput {
  return {
    activity: "practice",
    title: input.title,
    href: proofHref(input.subjectId, check.topicId),
    topicId: check.topicId,
    position,
    total: check.questionIds.length,
    queueIds: [...check.questionIds],
    mission: {
      missionId: proofCheckRunId(check.topicId),
      stage: PROOF_CHECK_STAGE,
      startedAt,
      questionIds: [...check.questionIds],
      hintBudgetFor: Object.fromEntries(check.questionIds.map((id) => [id, check.hintBudget])),
      contextFor: {},
    },
  };
}

export interface RestoredProofCheck {
  check: ProofCheck;
  /** When the saved run began: the only safe cut-off for "answered in this run". */
  startedAt: string;
  resume: { index: number; attempts: Attempt[] };
}

/**
 * The saved proof check, exactly as it was: same questions in the same order,
 * same (zero) hint budget, and the answers already given in this run.
 *
 * Rebuilding instead would be wrong twice over: the selector excludes questions
 * the learner has now answered (so the set changes under them), and the
 * checkpoint's `updatedAt` moves on every save (so it cannot date the run).
 *
 * Null, so the caller builds a fresh check, when the checkpoint is not this
 * topic's proof run, a question has left the bank, a question is no longer
 * teacher-reviewed (trust is re-checked, never inherited from the save), or
 * the saved run allowed hints.
 */
export function restoreProofCheck(
  saved: RevisionCheckpointInput | null | undefined,
  input: { topicId: Id; subjectId: Id; questions: readonly Question[]; attempts: readonly Attempt[] },
): RestoredProofCheck | null {
  const run = saved?.mission;
  if (!saved || !run || saved.activity !== "practice") return null;
  if (saved.href !== proofHref(input.subjectId, input.topicId)) return null;
  if (run.missionId !== proofCheckRunId(input.topicId) || run.stage !== PROOF_CHECK_STAGE) return null;
  const ids = run.questionIds;
  if (!ids.length || new Set(ids).size !== ids.length) return null;
  const byId = new Map(input.questions.map((q) => [q.id, q] as const));
  const questions = ids.map((id) => byId.get(id));
  if (!questions.every((q): q is Question => q !== undefined && learnerEvidenceTrusted(q) && q.topicIds.includes(input.topicId))) return null;
  if (!ids.every((id) => run.hintBudgetFor[id] === 0)) return null;
  const inRun = new Set(ids);
  const done = input.attempts.filter((a) => a.createdAt >= run.startedAt && inRun.has(a.questionId));
  return {
    check: {
      topicId: input.topicId,
      questionIds: [...ids],
      minutes: round1(questions.reduce((sum, q) => sum + minutesFor(q), 0)),
      verified: true,
      limit: null,
      hintBudget: 0,
    },
    startedAt: run.startedAt,
    resume: { index: missionResumePosition(ids, done, run.startedAt), attempts: done },
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
