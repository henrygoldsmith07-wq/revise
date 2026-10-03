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

import { independentAttempt, questionFamilies, trustedAssessmentAttempt, trustworthyAttempt } from "./learning-evidence";
import { MIN_PROOF_DELAY_DAYS } from "./proof-of-improvement";
import type { Attempt, Id, Mistake, Question } from "./types";

export type RecoveryState = "open" | "targeted" | "provisional" | "awaiting-proof" | "proven" | "regressed";

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
}

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
): MistakeRecovery {
  const base = { mistakeId: mistake.id, topicId: mistake.topicId, subjectId: mistake.subjectId, marks: mistake.marksLost };
  const sourceQuestion = mistake.questionId ? questionsById.get(mistake.questionId) : undefined;
  const sourceFamilies = new Set(sourceQuestion ? questionFamilies(sourceQuestion) : []);
  const after = attempts
    .filter((a) => a.createdAt > mistake.createdAt && a.topicIds.includes(mistake.topicId) && trustworthyAttempt(a))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bank = [...questionsById.values()];
  const verified = (a: Attempt) => trustedAssessmentAttempt(a, questionsById.get(a.questionId), attempts, bank);
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
    return !!q && !questionFamilies(q).some((f) => sourceFamilies.has(f));
  };
  const independentDifferent = successes.filter((a) => independentAttempt(a) && different(a));
  const provable = independentDifferent.filter(verified);
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
    return { ...common, state: "provisional", unverifiedOnly: true, reason: "Succeeded on a different question, but only on content that has not been human-verified, so it cannot count as proof." };
  }
  const firstFamilies = new Set(questionsById.has(first.questionId) ? questionFamilies(questionsById.get(first.questionId)!) : []);
  // The delayed check must also be new relative to the success it follows.
  const delayed = provable.find((a) => daysBetween(first.createdAt, a.createdAt) >= MIN_PROOF_DELAY_DAYS &&
    a.questionId !== first.questionId && !questionFamilies(questionsById.get(a.questionId)!).some((f) => firstFamilies.has(f)));
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
      const recovery = classifyMistake(m, input.attempts, questionsById, now);
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
