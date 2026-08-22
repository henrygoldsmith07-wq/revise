import type { Question } from "./types";

export const EXAM_WARNING_SECONDS = 5 * 60;

export type ExamClockState = "on-time" | "warning" | "time-up";

/** Seconds left on a wall-clock exam timer. The value never goes below zero. */
export function secondsRemaining(startedAt: number, now: number, durationMinutes: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || !Number.isFinite(durationMinutes)) return 0;
  return Math.max(0, Math.ceil(durationMinutes * 60 - Math.max(0, now - startedAt) / 1000));
}

export function formatExamTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function examClockState(remaining: number, warningSeconds = EXAM_WARNING_SECONDS): ExamClockState {
  if (remaining <= 0) return "time-up";
  if (remaining <= warningSeconds) return "warning";
  return "on-time";
}

export function questionHasAnswer(question: Question, answers: Record<string, string>): boolean {
  if (question.kind === "mcq") {
    // MCQ answers are keyed under the first part id by the marker and the
    // question runner; accept the question id too so both shapes count.
    const partKey = question.parts[0]?.id;
    const raw = answers[question.id] ?? "";
    const viaPart = partKey ? answers[partKey] ?? "" : "";
    return Boolean((raw || viaPart).trim());
  }
  return question.parts.some((part) => Boolean(answers[part.id]?.trim()));
}

export function unansweredQuestionCount(questions: Question[], answers: Record<string, string>): number {
  return questions.reduce((count, question) => count + (questionHasAnswer(question, answers) ? 0 : 1), 0);
}

export function examQuestionProgress(index: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.min(1, Math.max(0, (index + 1) / questionCount));
}
