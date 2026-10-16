// ---------------------------------------------------------------------------
// Practice step modes — what a repair-plan link promises, made true in practice.
//
// The intervention engine links its steps to /practice with a flag:
//   guided=1   "Guided application"      the question with its steps shown first
//   timed=1    "Timed question"          exam pace, no hints, a visible clock
//   unaided=1  "Unaided exam question"   no hints, so the answer is evidence
//   worked=1   "Worked example"          one question worked through first,
//                                         then a fresh one to try (supported)
//   minutes=N  the step's stated minutes; the queue fits them at exam pace
// Before the twenty-third pass /practice read none of them, so a step labelled
// "Guided" or "Timed" opened the same plain question as every other link.
//
// Pure: no clock, no React. The page owns the clock and passes seconds in.
// ---------------------------------------------------------------------------

import { commandOf } from "./assessment";
import { learnerEvidenceTrusted } from "./content-trust";
import type { HintTier } from "./hint-tiers";
import { questionFamilies, unseenQuestion } from "./learning-evidence";
import type { Attempt, CommandWord, Question } from "./types";

export type PracticeStepMode = "guided" | "timed" | "unaided" | "worked";

/**
 * Exam-time baseline: 90 seconds a mark. The response-time calibration and
 * the mistake classifier already judge "rushed" and "slow" against this
 * figure, so the timed step's clock uses the same one rather than a new pace.
 */
export const EXAM_SECONDS_PER_MARK = 90;

/**
 * Read the step mode from a practice URL. Only the exact value "1" counts.
 * Timed wins over guided if both are present (a timed step never shows help),
 * and unaided is the plain no-hint form.
 */
export function parsePracticeStepMode(params: { get(name: string): string | null }): PracticeStepMode | null {
  if (params.get("timed") === "1") return "timed";
  if (params.get("unaided") === "1") return "unaided";
  if (params.get("guided") === "1") return "guided";
  if (params.get("worked") === "1") return "worked";
  return null;
}

/**
 * Whether a step mode applies on this visit. Retests, delayed far-transfer
 * checks, recall mode and adaptive-runner rungs already define their own
 * support; a plan flag must never loosen (or silently override) them.
 */
export function stepModeApplies(input: {
  mode: PracticeStepMode | null;
  retest: boolean;
  farTransfer: boolean;
  recall: boolean;
  adaptiveStep: boolean;
}): PracticeStepMode | null {
  if (!input.mode) return null;
  if (input.retest || input.farTransfer || input.recall || input.adaptiveStep) return null;
  return input.mode;
}

/**
 * A plan step is a short, focused try (8–10 minutes in the plan; one 4-mark
 * question is six at exam pace), not the whole topic bank: three questions
 * leaves room to skip one that does not suit, and "Practise normally instead"
 * opens the full queue.
 */
export const STEP_QUEUE_LIMIT = 3;

export function limitStepQueue<T>(ids: readonly T[], mode: PracticeStepMode | null): T[] {
  return mode ? ids.slice(0, STEP_QUEUE_LIMIT) : [...ids];
}

/**
 * A worked-example step is one example and one fresh try (an example-problem
 * pair); the next plan step is the guided try, so more would repeat it.
 */
export const WORKED_STEP_TRIES = 1;

/** The plan step's stated minutes (?minutes=), a whole number from 1 to 60. */
export function parseStepMinutes(value: string | null): number | null {
  if (!value || !/^\d{1,2}$/.test(value.trim())) return null;
  const minutes = Number(value.trim());
  return minutes >= 1 && minutes <= 60 ? minutes : null;
}

/**
 * Fit a step's queue to its stated minutes at exam pace (90 s a mark, the
 * same baseline as the timed clock), keeping the ranked order and never more
 * than `limit` questions. A question that would overrun the step is passed
 * over for a later one that fits; when none fits, the first question is still
 * offered (a step always has something to do) and `overrun` says so, so the
 * page can show its real length instead of pretending it fits.
 *
 * Without minutes the old count cap applies unchanged.
 */
export function fitStepQueueToMinutes<T extends Pick<Question, "totalMarks">>(
  questions: readonly T[],
  minutes: number | null,
  limit: number = STEP_QUEUE_LIMIT,
): { queue: T[]; seconds: number; overrun: boolean } {
  const cap = Math.max(1, limit);
  if (minutes === null) {
    const queue = questions.slice(0, cap);
    return { queue, seconds: queue.reduce((sum, q) => sum + examPaceTargetSeconds(q.totalMarks), 0), overrun: false };
  }
  const budget = minutes * 60;
  const queue: T[] = [];
  let seconds = 0;
  for (const question of questions) {
    if (queue.length >= cap) break;
    const cost = examPaceTargetSeconds(question.totalMarks);
    if (seconds + cost > budget) continue;
    queue.push(question);
    seconds += cost;
  }
  if (queue.length || !questions.length) return { queue, seconds, overrun: false };
  const first = questions[0]!;
  return { queue: [first], seconds: examPaceTargetSeconds(first.totalMarks), overrun: true };
}

/** A question can be shown worked through only when every part has a model answer. */
export function hasWorkedSolution(question: Pick<Question, "parts">): boolean {
  return question.parts.length > 0 && question.parts.every((part) => part.modelAnswer.trim().length > 0);
}

export type WorkedExampleChoice = {
  example: Question;
  /**
   * "your-answer": the student has already answered it (so seeing its worked
   * solution spends nothing); "practice-only": never answered, but neither it
   * nor anything it would make "seen" could ever count as proof.
   */
  basis: "your-answer" | "practice-only";
};

/**
 * Choose the question to show worked through, without spending proof supply.
 *
 * Proof needs a reviewed question the student has never seen, judged by
 * `unseenQuestion` (same question, same family or a shallow reskin). Showing a
 * model answer is not recorded as an attempt, so an example must never be a
 * question that could later be served as "unseen" proof, or something that
 * would hide such a question's answer. In order:
 *   1. a question in the step's pool the student has already answered,
 *      most recent lost marks first, then most recent;
 *   2. an unanswered question for which treating it as answered would make
 *      no reviewed, still-unseen question in the subject count as seen.
 * Otherwise null: the page says so and offers the guided try instead.
 */
export function chooseWorkedExample(input: {
  pool: readonly Question[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  /** How many unanswered candidates to test (each test walks the reviewed pool). */
  maxCandidates?: number;
}): WorkedExampleChoice | null {
  const { pool, attempts, questions } = input;
  const withSolution = pool.filter(hasWorkedSolution);
  if (!withSolution.length) return null;
  const poolIds = new Set(withSolution.map((q) => q.id));
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (!poolIds.has(attempt.questionId)) continue;
    const seen = latest.get(attempt.questionId);
    if (!seen || attempt.createdAt > seen.createdAt) latest.set(attempt.questionId, attempt);
  }
  if (latest.size) {
    const answered = [...latest.values()].sort((a, b) => {
      const lostA = a.awarded < a.max ? 1 : 0;
      const lostB = b.awarded < b.max ? 1 : 0;
      return lostB - lostA || b.createdAt.localeCompare(a.createdAt);
    });
    const example = withSolution.find((q) => q.id === answered[0]!.questionId);
    if (example) return { example, basis: "your-answer" };
  }
  const subjects = new Set(withSolution.map((q) => q.subjectId));
  // Reviewed questions that could still serve as unseen proof today.
  const provable = questions.filter((q) => subjects.has(q.subjectId) && learnerEvidenceTrusted(q) && unseenQuestion(q, attempts, questions));
  const unanswered = withSolution.filter((q) => !latest.has(q.id)).slice(0, input.maxCandidates ?? 6);
  for (const candidate of unanswered) {
    if (learnerEvidenceTrusted(candidate)) continue;
    const asIfAnswered = [...attempts, { questionId: candidate.id } as Attempt];
    const spends = provable.some((q) => q.subjectId === candidate.subjectId && !unseenQuestion(q, asIfAnswered, questions));
    if (!spends) return { example: candidate, basis: "practice-only" };
  }
  return null;
}

/**
 * The fresh tries after a worked example: the rest of the ranked pool minus
 * the example and anything in its family, so the try is not the same
 * question with new numbers.
 */
export function freshAfterExample<T extends Question>(ranked: readonly T[], example: Question | null): T[] {
  if (!example) return [...ranked];
  const families = new Set(questionFamilies(example));
  return ranked.filter((q) => q.id !== example.id && !questionFamilies(q).some((family) => families.has(family)));
}

/**
 * Hint tiers the page allows. Timed and unaided allow none, so the attempt
 * stays independent evidence. Guided keeps the full ladder (the worked
 * solution stays behind its own button). `undefined` means "page default".
 */
export function stepModeHintBudget(mode: PracticeStepMode | null): number | undefined {
  return mode === "timed" || mode === "unaided" ? 0 : undefined;
}

/**
 * The support a worked-example try records. The student studied a different
 * question's full solution first, the same kind of help as reading repair
 * teaching, so the try carries the scaffold tier: weighted as viewed support
 * by mastery and never independent evidence. Every other mode records only
 * the hints actually opened.
 */
export function stepModeSupportTier(mode: PracticeStepMode | null): HintTier | null {
  return mode === "worked" ? "scaffold" : null;
}

/**
 * The tiers a guided attempt opens with: every rung below the worked
 * solution that the question's own ladder actually has. Using them is the
 * point of the step, and they are recorded on the attempt exactly as if the
 * student had pressed each hint button, so mastery weights it as supported.
 */
export function guidedOpeningTiers(ladderTiers: readonly HintTier[], allowed: readonly HintTier[]): HintTier[] {
  return ladderTiers.filter((tier) => tier !== "worked-solution" && allowed.includes(tier));
}

/** Target seconds for a question at exam pace. */
export function examPaceTargetSeconds(totalMarks: number): number {
  return Math.max(1, Math.round(totalMarks)) * EXAM_SECONDS_PER_MARK;
}

export type ExamPaceState = "on-pace" | "over";

export function examPaceState(elapsedSeconds: number, targetSeconds: number): ExamPaceState {
  return elapsedSeconds > targetSeconds ? "over" : "on-pace";
}

/** m:ss, for a timer a student reads at a glance. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Normalise a ?command= value to a known command word, or null. */
export function parseCommandParam(value: string | null): Exclude<CommandWord, "other"> | null {
  if (!value) return null;
  const word = value.trim().toLowerCase();
  if (!word || word.length > 24) return null;
  const resolved = commandOf(word);
  return resolved === "other" ? null : resolved;
}

/** Whether any part of the question (or its stem) asks for this command word. */
export function questionUsesCommand(question: Pick<Question, "stem" | "parts">, command: CommandWord): boolean {
  if ((question.parts ?? []).some((part) => {
    const own = commandOf(part.prompt);
    return (own === "other" ? commandOf(question.stem) : own) === command;
  })) return true;
  return commandOf(question.stem) === command;
}

/**
 * Put questions that ask for the command word first, keeping the existing
 * order inside each group. Never drops a question: when the topic has none,
 * the queue is unchanged and the page says so instead of pretending.
 */
export function orderByCommand<T extends Pick<Question, "stem" | "parts">>(questions: readonly T[], command: CommandWord | null): { ordered: T[]; matched: number } {
  if (!command) return { ordered: [...questions], matched: 0 };
  const hit: T[] = [];
  const rest: T[] = [];
  for (const question of questions) (questionUsesCommand(question, command) ? hit : rest).push(question);
  return { ordered: [...hit, ...rest], matched: hit.length };
}
