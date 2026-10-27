import { MOCK_READING_MINUTES, MOCK_TIME_PER_MARK_MINUTES } from "./mock-generator";
import type { Paper, PaperSpec, Question } from "./types";

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

export const GENERATED_PAPER_SPEC_PREFIX = "generated:";

/**
 * The paper format the exam-conditions clock runs to, and the formats the
 * learner may switch between before starting.
 *
 * - A paper tied to a real format of its subject (an uploaded past paper, a
 *   unit mock) uses that format. A unit mock is locked to it: switching would
 *   turn an 80-mark, 90-minute paper into something else.
 * - A bespoke mock is timed to its own mark budget. Before this it fell back
 *   to the subject's first format, so a 30-mark Physics mock got Unit 3's
 *   135 minutes. Mocks saved before the duration was stored are timed from
 *   their marks with the generator's own pacing.
 * - Anything else keeps the old behaviour: the subject's first format.
 */
export function examPaperFormat(
  paper: Pick<Paper, "id" | "paperSpecId" | "generated" | "totalMarks">,
  subjectPapers: readonly PaperSpec[],
  fallback: PaperSpec,
): { initial: PaperSpec; options: PaperSpec[]; locked: boolean; generated: boolean } {
  const real = paper.paperSpecId ? subjectPapers.find((spec) => spec.id === paper.paperSpecId) : undefined;
  if (paper.generated?.unitMock) {
    const spec = real ?? subjectPapers.find((candidate) => candidate.id === paper.generated?.unitMock?.paperSpecId);
    if (spec) {
      const minutes = paper.generated.durationMinutes ?? spec.durationMinutes;
      const timed = minutes === spec.durationMinutes ? spec : { ...spec, durationMinutes: minutes };
      return { initial: timed, options: [timed], locked: true, generated: false };
    }
  }
  if (real) return { initial: real, options: [...subjectPapers], locked: false, generated: false };
  if (paper.generated) {
    const minutes = paper.generated.durationMinutes ?? Math.round(MOCK_READING_MINUTES + paper.totalMarks * MOCK_TIME_PER_MARK_MINUTES);
    const own: PaperSpec = {
      id: `${GENERATED_PAPER_SPEC_PREFIX}${paper.id}`,
      name: "Bespoke mock",
      weight: 0,
      durationMinutes: Math.max(1, minutes),
      calculatorAllowed: true,
    };
    return { initial: own, options: [own, ...subjectPapers], locked: false, generated: true };
  }
  const first = subjectPapers[0] ?? fallback;
  return { initial: first, options: subjectPapers.length ? [...subjectPapers] : [fallback], locked: false, generated: false };
}

/** True for a format id that names a real paper of the subject, not a mock's own clock. */
export function isRealPaperSpecId(id: string | undefined): id is string {
  return Boolean(id) && !id!.startsWith(GENERATED_PAPER_SPEC_PREFIX);
}
