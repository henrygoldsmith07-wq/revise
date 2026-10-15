// ---------------------------------------------------------------------------
// Practice step modes — what a repair-plan link promises, made true in practice.
//
// The intervention engine links its steps to /practice with a flag:
//   guided=1   "Guided application"      the question with its steps shown first
//   timed=1    "Timed question"          exam pace, no hints, a visible clock
//   unaided=1  "Unaided exam question"   no hints, so the answer is evidence
// Before the twenty-third pass /practice read none of them, so a step labelled
// "Guided" or "Timed" opened the same plain question as every other link.
//
// Pure: no clock, no React. The page owns the clock and passes seconds in.
// ---------------------------------------------------------------------------

import { commandOf } from "./assessment";
import type { HintTier } from "./hint-tiers";
import type { CommandWord, Question } from "./types";

export type PracticeStepMode = "guided" | "timed" | "unaided";

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
 * Hint tiers the page allows. Timed and unaided allow none, so the attempt
 * stays independent evidence. Guided keeps the full ladder (the worked
 * solution stays behind its own button). `undefined` means "page default".
 */
export function stepModeHintBudget(mode: PracticeStepMode | null): number | undefined {
  return mode === "timed" || mode === "unaided" ? 0 : undefined;
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
