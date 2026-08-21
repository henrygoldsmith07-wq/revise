import type { Attempt, Id, Question } from "./types";

export const OVERPRACTICE_MIN_EXPOSURES = 4;

export type ExposureStatus = "unseen" | "balanced" | "overpractised";

export interface QuestionExposureRow {
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  exposures: number;
  accuracy: number | null;
  lastAttemptAt: string | null;
  status: ExposureStatus;
}

export interface QuestionExposureReport {
  rows: QuestionExposureRow[];
  unseen: number;
  balanced: number;
  overpractised: number;
  narrative: string;
}

function rowFor(question: Question, attempts: Attempt[]): QuestionExposureRow {
  const marksAvailable = attempts.reduce((sum, attempt) => sum + Math.max(0, attempt.max), 0);
  const marksAwarded = attempts.reduce((sum, attempt) => sum + Math.max(0, Math.min(attempt.max, attempt.awarded)), 0);
  const accuracy = marksAvailable > 0 ? Math.round((marksAwarded / marksAvailable) * 1000) / 1000 : null;
  const status: ExposureStatus = !attempts.length
    ? "unseen"
    : attempts.length >= OVERPRACTICE_MIN_EXPOSURES && (accuracy ?? 0) >= 0.8
      ? "overpractised"
      : "balanced";
  return {
    questionId: question.id,
    subjectId: question.subjectId,
    topicIds: question.topicIds,
    exposures: attempts.length,
    accuracy,
    lastAttemptAt: attempts.length ? attempts.map((attempt) => attempt.createdAt).sort().at(-1) ?? null : null,
    status,
  };
}

export function questionExposureReport(input: { questions: Question[]; attempts: Attempt[] }): QuestionExposureReport {
  const attemptsByQuestion = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    const rows = attemptsByQuestion.get(attempt.questionId) ?? [];
    rows.push(attempt);
    attemptsByQuestion.set(attempt.questionId, rows);
  }
  const rows = input.questions.map((question) => rowFor(question, attemptsByQuestion.get(question.id) ?? []));
  const unseen = rows.filter((row) => row.status === "unseen").length;
  const overpractised = rows.filter((row) => row.status === "overpractised").length;
  const balanced = rows.length - unseen - overpractised;
  const narrative = overpractised
    ? `${overpractised} secure question${overpractised === 1 ? " is" : "s are"} being practised repeatedly — switch to unseen or mixed questions.`
    : unseen
      ? `${unseen} question${unseen === 1 ? " is" : "s are"} unseen; the practice queue will surface those before repeats.`
      : "Question exposure is balanced across the available bank.";
  return { rows, unseen, balanced, overpractised, narrative };
}

/** Rank unseen and underexposed items ahead of secure repeats without hiding weak work. */
export function rankQuestionsForExposure(input: {
  questions: Question[];
  attempts: Attempt[];
  masteryByTopic?: Map<Id, number>;
}): Question[] {
  const report = questionExposureReport(input);
  const byId = new Map(report.rows.map((row) => [row.questionId, row] as const));
  const statusRank: Record<ExposureStatus, number> = { unseen: 0, balanced: 1, overpractised: 2 };
  const mastery = input.masteryByTopic;
  return [...input.questions].sort((a, b) => {
    const aRow = byId.get(a.id)!;
    const bRow = byId.get(b.id)!;
    const status = statusRank[aRow.status] - statusRank[bRow.status];
    if (status !== 0) return status;
    const aMastery = a.topicIds.length
      ? Math.min(...a.topicIds.map((topicId) => mastery?.get(topicId) ?? 0.5))
      : 0.5;
    const bMastery = b.topicIds.length
      ? Math.min(...b.topicIds.map((topicId) => mastery?.get(topicId) ?? 0.5))
      : 0.5;
    if (aMastery !== bMastery) return aMastery - bMastery;
    if (aRow.exposures !== bRow.exposures) return aRow.exposures - bRow.exposures;
    return a.id.localeCompare(b.id);
  });
}
