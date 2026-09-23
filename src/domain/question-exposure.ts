import type { Attempt, Id, Question } from "./types";
import { questionCapabilities, questionContexts, questionFamilies } from "./learning-evidence";
import { reasoningProfileOf, solutionPathOf } from "./reasoning-signature";

export const OVERPRACTICE_MIN_EXPOSURES = 4;
/** A family/context/capability/reasoning unit drilled this often is saturated. */
export const UNIT_OVERPRACTICE_MIN = 5;

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
  const reasoning = reasoningExposureReport(input);
  const byId = new Map(report.rows.map((row) => [row.questionId, row] as const));
  const penalty = new Map(input.questions.map((question) => [question.id, overpracticePenalty(question, reasoning)] as const));
  const statusRank: Record<ExposureStatus, number> = { unseen: 0, balanced: 1, overpractised: 2 };
  const mastery = input.masteryByTopic;
  return [...input.questions].sort((a, b) => {
    // A question whose family/context/capability/solution-path units are
    // already saturated is over-practice even if its own id is unseen; demote
    // it behind genuinely novel reasoning. Weak-mastery work is still kept
    // ahead of saturated strong work.
    const penaltyDiff = penalty.get(a.id)! - penalty.get(b.id)!;
    if (penaltyDiff !== 0) return penaltyDiff;
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

export type ReasoningUnitKind = "family" | "context" | "capability" | "solutionPath";

export interface ReasoningUnitRow {
  kind: ReasoningUnitKind;
  unit: string;
  attempts: number;
  accuracy: number | null;
  overpractised: boolean;
}

export interface ReasoningExposureReport {
  rows: ReasoningUnitRow[];
  byUnit: Map<`${ReasoningUnitKind}:${string}`, ReasoningUnitRow>;
  overpractised: ReasoningUnitRow[];
}

/** All reasoning units a question belongs to at each granularity. */
function unitsFor(question: Question): Array<{ kind: ReasoningUnitKind; unit: string }> {
  const units: Array<{ kind: ReasoningUnitKind; unit: string }> = [];
  for (const family of questionFamilies(question)) units.push({ kind: "family", unit: family });
  for (const context of questionContexts(question)) units.push({ kind: "context", unit: context });
  for (const capability of questionCapabilities(question)) units.push({ kind: "capability", unit: capability });
  for (const part of question.parts ?? []) {
    const profile = reasoningProfileOf(question, part);
    const path = solutionPathOf(part).join("|");
    // Solution-path units only exist where there is a genuine path to compare
    // (a calculation method or a multi-step written answer); a lone recall
    // bullet is not a "path" and would flood the report with trivial 1-token
    // units that over-trigger.
    if (path && (profile.calculationMethod.length || solutionPathOf(part).length > 1)) {
      units.push({ kind: "solutionPath", unit: path });
    }
  }
  return units;
}

/**
 * Aggregate exposure beyond the individual question: the same family, context,
 * capability or solution path practised repeatedly across many distinct
 * question ids is over-practice, because durable marks come from new reasoning,
 * not from re-solving the same operation in fresh clothes.
 */
export function reasoningExposureReport(input: {
  questions: Question[];
  attempts: Attempt[];
}): ReasoningExposureReport {
  const questionById = new Map(input.questions.map((q) => [q.id, q] as const));
  const tallies = new Map<string, { kind: ReasoningUnitKind; unit: string; attempts: number; awarded: number; max: number }>();
  for (const attempt of input.attempts) {
    const question = questionById.get(attempt.questionId);
    if (!question) continue;
    for (const { kind, unit } of unitsFor(question)) {
      const key = `${kind}:${unit}`;
      const row = tallies.get(key) ?? { kind, unit, attempts: 0, awarded: 0, max: 0 };
      row.attempts++;
      row.awarded += Math.max(0, Math.min(attempt.max, attempt.awarded));
      row.max += Math.max(0, attempt.max);
      tallies.set(key, row);
    }
  }
  const rows: ReasoningUnitRow[] = [...tallies.values()]
    .map((row) => ({
      kind: row.kind,
      unit: row.unit,
      attempts: row.attempts,
      accuracy: row.max > 0 ? Math.round((row.awarded / row.max) * 1000) / 1000 : null,
      overpractised: row.attempts >= UNIT_OVERPRACTICE_MIN && (row.max > 0 ? row.awarded / row.max : 0) >= 0.8,
    }))
    .sort((a, b) => b.attempts - a.attempts || a.kind.localeCompare(b.kind) || a.unit.localeCompare(b.unit));
  const byUnit = new Map(rows.map((row) => [`${row.kind}:${row.unit}`, row] as const));
  return { rows, byUnit, overpractised: rows.filter((row) => row.overpractised) };
}

/**
 * Penalty for choosing a question whose reasoning units are already saturated.
 * A question is only as fresh as its most-drilled unit, so a novel id that
 * re-runs a five-times-practised solution path still scores high (bad).
 */
export function overpracticePenalty(question: Question, report: ReasoningExposureReport): number {
  let penalty = 0;
  for (const { kind, unit } of unitsFor(question)) {
    const row = report.byUnit.get(`${kind}:${unit}`);
    if (row?.overpractised) penalty += 1;
  }
  return penalty;
}
