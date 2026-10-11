// ---------------------------------------------------------------------------
// Marks recovered — one honest ledger of lost marks and what has been done
// about them. Derived on demand from mistakes, attempts and questions; nothing
// here is persisted and no second scoring model exists.
//
// A lost mark moves through:
//   open → targeted → provisional → awaiting-proof → proven   (or regressed)
//
//   targeted        revision touched it, but no success yet
//   provisional     a success that is not yet proof (same question or family,
//                   hinted, or taught first)
//   awaiting-proof  independent success on a different question; the delayed
//                   check has not happened yet
//   proven          a different question, answered independently and trusted,
//                   at least MIN_PROOF_DELAY_DAYS after the first success
//   regressed       was proven, then a later independent attempt failed
//
// One successful repeat never proves a mark. Pure domain: no clock, no storage.
// ---------------------------------------------------------------------------

import { independentAttempt, questionFamilies, trustedAssessmentAttempt, trustedAssessmentMistake, trustworthyAttempt, unseenQuestion } from "./learning-evidence";
import { learnerEvidenceTrusted, requiresWjecContentReview, trustedAssessmentContent } from "./content-trust";
import { isFlagship } from "./flagship";
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import { officialPaperQuestionEligible, type OfficialPaperContext } from "./official-papers";
import { isShallowReskin } from "./reskin";
import type { Attempt, Id, Mistake, Question } from "./types";

export type RecoveryState = "open" | "targeted" | "provisional" | "awaiting-proof" | "proven" | "regressed";

/**
 * Why a lost mark itself can never count towards proof, whatever is answered
 * afterwards. Proof of recovery needs the loss to be trusted evidence too
 * (`trustedAssessmentMistake`): a loss on an unreviewed question, an
 * unverified paper, an unreliable mark, or with no link to the marked answer
 * cannot be "recovered" provably, so asking for more questions would never
 * help. Only set on review-gated (WJEC flagship) losses, and only when
 * `trustedAssessmentMistake` already says no: it explains the existing gate,
 * it never changes it.
 */
export type ProofBarrier = "loss-unlinked" | "loss-unreviewed-question" | "loss-unverified-paper" | "loss-untrusted-mark";

/** Plain learner wording for each barrier, written to follow "because". */
export const PROOF_BARRIER_TEXT: Record<ProofBarrier, string> = {
  "loss-unverified-paper": "these marks were lost on a paper Revise cannot verify as an official WJEC paper with teacher-reviewed marking",
  "loss-unreviewed-question": "the question these marks were lost on has not been reviewed by two teachers yet",
  "loss-untrusted-mark": "the mark on the answer that lost them was not reliable enough to count (self-marked, low confidence, or waiting for a check)",
  "loss-unlinked": "these lost marks are not linked to a marked answer Revise can check",
};

export const SUCCESS_RATIO = 0.75;
export const REGRESSION_RATIO = 0.5;
/** Fewer trusted post-loss attempts than this and totals are reported as a range. */
export const THIN_RECOVERY_ATTEMPTS = 3;
const DAY_MS = 86_400_000;

export interface MistakeRecovery {
  mistakeId: Id;
  topicId: Id;
  subjectId: Id;
  paperId?: Id;
  marks: number;
  state: RecoveryState;
  /** First post-loss success of any kind. */
  firstSuccessAt?: string;
  /** Earliest moment a delayed check on a different question can count. */
  proofDueAt?: string;
  /** Why this state, in plain English. */
  reason: string;
  /** When revision first touched this loss. */
  targetedAt?: string;
  /** The attempt that first succeeded after the loss. */
  firstSuccessAttemptId?: Id;
  /** When the delayed independent success happened. */
  provenAt?: string;
  provenAttemptId?: Id;
  regressedAt?: string;
  /** Success counts as proof only on verified content; otherwise it stays provisional. */
  unverifiedOnly?: boolean;
  /** Set when the loss itself can never count towards proof (see ProofBarrier). Never changes state. */
  proofBarrier?: ProofBarrier;
  /**
   * Spaced practice revisits for a mark recovered only on unreviewed
   * questions (`unverifiedOnly`). Proof is impossible there, but whether the
   * fix held is still worth checking at expanding intervals. Never a proof
   * state: it changes no state, total or claim.
   */
  practiceRevisit?: PracticeRevisit;
}

export interface PracticeRevisit {
  /** When the next spaced practice check is due. */
  dueAt: string;
  /** Spaced checks already passed, unaided, on a different question. */
  heldChecks: number;
  /** When the last spaced check passed. */
  lastHeldAt?: string;
  /** A spaced check was answered unaided and lost marks: the new loss takes over. */
  slipped: boolean;
}

/** First spaced practice check after the first recovery; each one passed doubles the gap (3, 6, 12, 24 days…). */
export const PRACTICE_REVISIT_FIRST_DAYS = MIN_PROOF_DELAY_DAYS;
export const PRACTICE_REVISIT_MAX_DAYS = 30;

export interface RecoveryTotals {
  /** Every mark lost, recovered or not. */
  previouslyLost: number;
  /** Marks revision has touched (anything but untouched-open). */
  targeted: number;
  /** Marks with a success that is not proof yet (provisional + awaiting). */
  provisional: number;
  awaitingProof: number;
  proven: number;
  /** Marks proven then lost again; also counted in `open`. */
  regressed: number;
  /** Marks still needing work: open, targeted-only and regressed. */
  open: number;
  /** Invariant: proven + provisional + open === previouslyLost. */
  evidence: "none" | "thin" | "adequate";
  /** Marks that can honestly be called recovered: lowest and highest reading. */
  recovered: { low: number; high: number };
  statement: string;
}

export interface MarkRecoveryInput {
  mistakes: readonly Mistake[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  now?: Date;
  /**
   * Official-paper tier context. Absent or disabled by default: byte-identical
   * behaviour to before. When enabled, attempts on learner-confirmed official
   * paper matches can satisfy the trust half of proof for that learner only;
   * independent/unseen/delayed rules still apply, and shared coverage metrics
   * never see this tier.
   */
  officialPaper?: OfficialPaperContext;
}

const round = (n: number) => Math.round(n * 10) / 10;
const ratio = (a: Attempt) => a.awarded / a.max;
const plural = (n: number, word: string) => `${round(n)} ${word}${n === 1 ? "" : "s"}`;

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS;
}

export function classifyMistake(
  mistake: Mistake,
  attempts: readonly Attempt[],
  questionsById: ReadonlyMap<Id, Question>,
  now: Date = new Date(),
  officialPaper?: OfficialPaperContext,
): MistakeRecovery {
  const base: Pick<MistakeRecovery, "mistakeId" | "topicId" | "subjectId" | "marks" | "proofBarrier"> = { mistakeId: mistake.id, topicId: mistake.topicId, subjectId: mistake.subjectId, marks: mistake.marksLost };
  const sourceQuestion = mistake.questionId ? questionsById.get(mistake.questionId) : undefined;
  const sourceFamilies = new Set(sourceQuestion ? questionFamilies(sourceQuestion) : []);
  const after = attempts
    .filter((a) => a.createdAt > mistake.createdAt && a.topicIds.includes(mistake.topicId) && trustworthyAttempt(a))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bank = [...questionsById.values()];
  // Proof is a learner-facing claim, so the answering question must clear
  // learner-evidence trust (flagship + human review), exactly as the proof
  // ledger requires. Reference-tier outlines pass the permissive authoring
  // predicate but can only ever leave a mark "provisional". The official-paper
  // tier keeps its own, separately verified route.
  const proofQuestion = (q: Question | undefined): boolean => Boolean(q) &&
    (learnerEvidenceTrusted(q) || (officialPaper?.enabled === true && officialPaperQuestionEligible(q, officialPaper.manifest, true)));
  const verified = (a: Attempt) => proofQuestion(questionsById.get(a.questionId)) &&
    trustedAssessmentAttempt(a, questionsById.get(a.questionId), attempts, bank, officialPaper);
  // trustedAssessmentMistake defaults to reviewer trust; the official-paper
  // tier ORs in only at the question level, per learner, with the flag on.
  // With no context the second disjunct is false, so behaviour is unchanged.
  const trustedQuestion = (q: Question): boolean =>
    trustedAssessmentContent(q) ||
    (officialPaper?.enabled === true && officialPaperQuestionEligible(q, officialPaper.manifest, true));
  // Revision "targets" a loss only when it is a retest of it or a mission attempt aimed at it. A later
  // attempt that merely happens to be on the same topic, including the one that lost other marks, is not.
  const aimed = after.filter((a) => a.retestMistakeId === mistake.id || a.mission?.sourceMistakeIds.includes(mistake.id));
  const targeted = (mistake.retestCount ?? 0) > 0 || aimed.length > 0;
  const successes = after.filter((a) => ratio(a) >= SUCCESS_RATIO);
  const first = successes[0];
  const targetedAt = [aimed[0]?.createdAt, first?.createdAt].filter((t): t is string => Boolean(t)).sort()[0];
  const different = (a: Attempt): boolean => {
    if (a.questionId === mistake.questionId) return false;
    const q = questionsById.get(a.questionId);
    return !!q && !questionFamilies(q).some((f) => sourceFamilies.has(f)) && !(sourceQuestion && isShallowReskin(q, sourceQuestion));
  };
  const independentDifferent = successes.filter((a) => independentAttempt(a) && different(a));
  const lossTrusted = trustedAssessmentMistake(mistake, bank, attempts, trustedQuestion);
  const barrier = lossTrusted ? undefined : lossProofBarrier(mistake, questionsById, attempts, trustedQuestion);
  if (barrier) base.proofBarrier = barrier;
  const provable = independentDifferent.filter(a => verified(a) && lossTrusted &&
    unseenQuestion(questionsById.get(a.questionId)!, attempts.filter(prior => prior.userId === a.userId && prior.id !== a.id && prior.createdAt <= a.createdAt), bank));
  if (!first) {
    return { ...base, ...(targetedAt ? { targetedAt } : {}), state: targeted ? "targeted" : "open", reason: targeted
      ? "Revised, but no successful answer on this yet." : "Not revisited since the mark was lost." };
  }
  const proofDueAt = new Date(Date.parse(first.createdAt) + MIN_PROOF_DELAY_DAYS * DAY_MS).toISOString();
  const common = { ...base, firstSuccessAt: first.createdAt, firstSuccessAttemptId: first.id, proofDueAt, ...(targetedAt ? { targetedAt } : {}) };
  if (!independentDifferent.length) {
    return { ...common, state: "provisional", reason: "Succeeded, but on the same question, with help, or on a near-identical one. That is not proof." };
  }
  if (!provable.length) {
    const practiceRevisit = practiceRevisitFor(independentDifferent[0]!, after, different);
    return { ...common, state: "provisional", unverifiedOnly: true, practiceRevisit, reason: barrier
      ? `You improved here, but this cannot count as proof because ${PROOF_BARRIER_TEXT[barrier]}. Revise will bring it back for spaced practice checks instead.`
      : isFlagship(mistake.subjectId)
      ? "You improved here, but Revise does not yet have enough reviewed new questions to prove it."
      : "You improved here. This subject's questions have not been checked against the specification, so Revise can track practice but not prove it." };
  }
  const firstFamilies = new Set(questionsById.has(first.questionId) ? questionFamilies(questionsById.get(first.questionId)!) : []);
  // The delayed check must also be new relative to the success it follows.
  const delayed = provable.find((a) => daysBetween(first.createdAt, a.createdAt) >= MIN_PROOF_DELAY_DAYS &&
    a.questionId !== first.questionId && !questionFamilies(questionsById.get(a.questionId)!).some((f) => firstFamilies.has(f)) &&
    (!questionsById.has(first.questionId) || !isShallowReskin(questionsById.get(a.questionId)!, questionsById.get(first.questionId)!)));
  if (!delayed) {
    const due = Date.parse(proofDueAt) <= now.getTime();
    return { ...common, state: "awaiting-proof", reason: due
      ? "Improved on a different question. A delayed check on another new question can be taken now."
      : "Improved on a different question. Revise needs to check again after a delay, on another new question." };
  }
  const later = after.filter((a) => a.createdAt > delayed.createdAt && independentAttempt(a)).at(-1);
  if (later && ratio(later) < REGRESSION_RATIO) {
    return { ...common, state: "regressed", regressedAt: later.createdAt, provenAt: delayed.createdAt, provenAttemptId: delayed.id, reason: "Was proven, but a later independent attempt on this topic lost marks again." };
  }
  return { ...common, state: "proven", provenAt: delayed.createdAt, provenAttemptId: delayed.id, reason: "Answered independently on a different question after a delay." };
}

/**
 * Which part of `trustedAssessmentMistake` a review-gated loss failed. Call
 * only when that gate has already said no; returns undefined for losses that
 * are not review-gated (their proof rules live elsewhere). Pure.
 */
export function lossProofBarrier(
  mistake: Mistake,
  questionsById: ReadonlyMap<Id, Question>,
  attempts: readonly Attempt[],
  trustedQuestion: (question: Question) => boolean = trustedAssessmentContent,
): ProofBarrier | undefined {
  if (!requiresWjecContentReview(mistake.subjectId)) return undefined;
  const question = mistake.questionId ? questionsById.get(mistake.questionId) : undefined;
  const attempt = mistake.attemptId ? attempts.find((a) => a.id === mistake.attemptId) : undefined;
  if (!question || !attempt || attempt.questionId !== question.id ||
    question.subjectId !== mistake.subjectId || attempt.subjectId !== mistake.subjectId) return "loss-unlinked";
  if (!trustedQuestion(question)) return "loss-unreviewed-question";
  if (attempt.mode === "paper" && trustworthyAttempt(attempt)) return "loss-unverified-paper";
  return "loss-untrusted-mark";
}

/**
 * Spaced practice revisits after a recovery on unreviewed questions. The
 * anchor is the first unaided success on a different question. A check is
 * the first unaided attempt on yet another question once the current gap has
 * passed: a pass doubles the gap (capped), a loss of marks stops the schedule
 * because that attempt opened a new loss of its own. Hinted attempts and
 * repeats of the anchor question never count. Pure.
 */
export function practiceRevisitFor(
  anchor: Attempt,
  after: readonly Attempt[],
  differentFromSource: (a: Attempt) => boolean,
): PracticeRevisit {
  let anchorAt = anchor.createdAt;
  let anchorQuestion = anchor.questionId;
  let gapDays = PRACTICE_REVISIT_FIRST_DAYS;
  let heldChecks = 0;
  let lastHeldAt: string | undefined;
  for (const attempt of after) {
    if (attempt.createdAt <= anchorAt || !independentAttempt(attempt)) continue;
    if (attempt.questionId === anchorQuestion || !differentFromSource(attempt)) continue;
    if (daysBetween(anchorAt, attempt.createdAt) < gapDays) continue;
    if (ratio(attempt) < SUCCESS_RATIO) {
      return { dueAt: attempt.createdAt, heldChecks, ...(lastHeldAt ? { lastHeldAt } : {}), slipped: true };
    }
    heldChecks += 1;
    lastHeldAt = attempt.createdAt;
    anchorAt = attempt.createdAt;
    anchorQuestion = attempt.questionId;
    gapDays = Math.min(PRACTICE_REVISIT_MAX_DAYS, gapDays * 2);
  }
  return {
    dueAt: new Date(Date.parse(anchorAt) + gapDays * DAY_MS).toISOString(),
    heldChecks,
    ...(lastHeldAt ? { lastHeldAt } : {}),
    slipped: false,
  };
}

/**
 * What a single attempt proved: the lost marks whose delayed proof is exactly
 * this attempt and that are still proven now. This is the only basis on which
 * a marked answer may say "proven" — one full-marks answer on its own never
 * is (it needs an earlier independent success, a delay, a different reviewed
 * flagship question). Pure.
 */
export function marksProvenByAttempt(recovery: Pick<MarkRecovery, "items">, attemptId: Id): { marks: number; topicIds: Id[] } {
  const items = recovery.items.filter((i) => i.state === "proven" && i.provenAttemptId === attemptId);
  return { marks: Math.round(items.reduce((s, i) => s + i.marks, 0) * 10) / 10, topicIds: [...new Set(items.map((i) => i.topicId))] };
}

export interface MarkRecovery {
  items: MistakeRecovery[];
  now: Date;
  totals: RecoveryTotals;
  /** Totals for any subset: a topic, a paper, or a mission. */
  summarise: (filter: (item: MistakeRecovery) => boolean) => RecoveryTotals;
  byTopic: (topicId: Id) => RecoveryTotals;
  byPaper: (paperId: Id) => RecoveryTotals;
  forMistakes: (ids: Iterable<Id>) => RecoveryTotals;
}

export function summariseRecovery(items: readonly MistakeRecovery[], trustedAttempts: number): RecoveryTotals {
  const sum = (state: RecoveryState) => round(items.filter((i) => i.state === state).reduce((s, i) => s + i.marks, 0));
  const previouslyLost = round(items.reduce((s, i) => s + i.marks, 0));
  const proven = sum("proven");
  const awaitingProof = sum("awaiting-proof");
  const provisionalOnly = sum("provisional");
  const regressed = sum("regressed");
  const targetedOnly = sum("targeted");
  const open = round(sum("open") + targetedOnly + regressed);
  const provisional = round(provisionalOnly + awaitingProof);
  const targeted = round(previouslyLost - sum("open"));
  const evidence = previouslyLost === 0 || trustedAttempts === 0 ? "none" : trustedAttempts < THIN_RECOVERY_ATTEMPTS ? "thin" : "adequate";
  const recovered = { low: proven, high: round(proven + provisional) };
  let statement: string;
  if (previouslyLost === 0) statement = "No lost marks recorded yet.";
  else if (proven === 0 && recovered.high === 0) statement = `No marks recovered yet: ${plural(open, "mark")} still open.`;
  else if (evidence !== "adequate") statement = `Evidence is incomplete: ${plural(proven, "mark")} proven recovered, up to ${plural(recovered.high, "mark")} if early signs hold.`;
  else if (recovered.low === recovered.high) statement = `${plural(proven, "mark")} proven recovered out of ${plural(previouslyLost, "mark")} lost.`;
  else statement = `${plural(proven, "mark")} proven recovered; ${plural(provisional, "more mark")} look recovered but are not proven yet.`;
  return { previouslyLost, targeted, provisional, awaitingProof, proven, regressed, open, evidence, recovered, statement };
}

export function buildMarkRecovery(input: MarkRecoveryInput): MarkRecovery {
  const now = input.now ?? new Date();
  const questionsById = new Map(input.questions.map((q) => [q.id, q] as const));
  const attemptById = new Map(input.attempts.map((a) => [a.id, a] as const));
  const items = input.mistakes
    .filter((m) => m.marksLost > 0)
    .map((m): MistakeRecovery => {
      const paperId = (m.attemptId ? attemptById.get(m.attemptId)?.paperId ?? attemptById.get(m.attemptId)?.paperSpecId : undefined);
      const recovery = classifyMistake(m, input.attempts, questionsById, now, input.officialPaper);
      return paperId ? { ...recovery, paperId } : recovery;
    });
  const trusted = (subset: readonly MistakeRecovery[]) => {
    const topics = new Set(subset.map((i) => i.topicId));
    const since = subset.map((i) => input.mistakes.find((m) => m.id === i.mistakeId)?.createdAt ?? "").sort()[0] ?? "";
    return input.attempts.filter((a) => a.createdAt > since && a.topicIds.some((t) => topics.has(t)) && trustworthyAttempt(a)).length;
  };
  const summarise = (filter: (item: MistakeRecovery) => boolean) => {
    const subset = items.filter(filter);
    return summariseRecovery(subset, trusted(subset));
  };
  return {
    items,
    now,
    totals: summarise(() => true),
    summarise,
    byTopic: (topicId) => summarise((i) => i.topicId === topicId),
    byPaper: (paperId) => summarise((i) => i.paperId === paperId),
    forMistakes: (ids) => {
      const set = new Set(ids);
      return summarise((i) => set.has(i.mistakeId));
    },
  };
}
