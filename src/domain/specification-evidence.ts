// ---------------------------------------------------------------------------
// Specification evidence — how much proof exists for each spec statement.
//
// A statement the student has answered once, correctly, is not "secure"; it is
// barely tested. This module separates *how well* a statement is going from
// *how much evidence* says so: attempts are joined to statements through the
// authored specPointIds on question parts, only trusted marks count, and
// "secure" needs several distinct questions, unaided answers and recent
// retrieval. Statements with no mapped question at all are reported as such so
// content gaps are not mistaken for student gaps.
// ---------------------------------------------------------------------------

import { topicsFor, unitsFor } from "./curriculum";
import { independentAttempt, trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Id, Question, SpecPoint, Topic, Unit } from "./types";

export type EvidenceStrength = "untested" | "thin" | "building" | "established";
export type SpecStatus = "no-evidence" | "insufficient" | "weak" | "developing" | "secure" | "stale";

export interface SpecPointEvidence {
  specPointId: Id;
  ref: string;
  text: string;
  /** Bank questions that exercise this statement. */
  questionsAvailable: number;
  attempts: number;
  distinctQuestions: number;
  /** Attempts made without hints, copied text or a taught answer in view. */
  independentAttempts: number;
  marksGained: number;
  marksAvailable: number;
  accuracy: number | null;
  lastTestedAt: string | null;
  daysSinceTested: number | null;
  strength: EvidenceStrength;
  status: SpecStatus;
}

export interface SpecRollup {
  total: number;
  byStatus: Record<SpecStatus, number>;
  /** Statements with at least one mapped question in the bank. */
  withQuestions: number;
  /** Statements whose evidence is building or established. */
  evidenced: number;
}

export interface SpecTopicEvidence {
  topic: Topic;
  points: SpecPointEvidence[];
  rollup: SpecRollup;
}

export interface SpecUnitEvidence {
  unit: Unit;
  topics: SpecTopicEvidence[];
  rollup: SpecRollup;
}

export interface SpecificationMap {
  subjectId: Id;
  units: SpecUnitEvidence[];
  rollup: SpecRollup;
  /** Topic with the most statements that lack real evidence, for the next action. */
  thinnestTopic: { topicId: Id; lacking: number } | null;
}

export interface SpecificationMapInput {
  subjectId: Id;
  attempts: Attempt[];
  questions: Question[];
  now?: Date;
  units?: Unit[];
  topics?: Topic[];
}

/** Distinct questions needed before evidence counts as established. */
export const ESTABLISHED_QUESTIONS = 3;
export const ESTABLISHED_INDEPENDENT_ATTEMPTS = 3;
export const ESTABLISHED_MARKS = 8;
/** Established evidence older than this is stale: the statement needs retrieving again. */
export const STALE_AFTER_DAYS = 42;
const DAY_MS = 86_400_000;

const STATUSES: SpecStatus[] = ["no-evidence", "insufficient", "weak", "developing", "secure", "stale"];

function emptyRollup(): SpecRollup {
  return {
    total: 0,
    byStatus: Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<SpecStatus, number>,
    withQuestions: 0,
    evidenced: 0,
  };
}

function addToRollup(rollup: SpecRollup, point: SpecPointEvidence) {
  rollup.total += 1;
  rollup.byStatus[point.status] += 1;
  if (point.questionsAvailable > 0) rollup.withQuestions += 1;
  if (point.strength === "building" || point.strength === "established") rollup.evidenced += 1;
}

function mergeRollups(rollups: SpecRollup[]): SpecRollup {
  const out = emptyRollup();
  for (const rollup of rollups) {
    out.total += rollup.total;
    out.withQuestions += rollup.withQuestions;
    out.evidenced += rollup.evidenced;
    for (const status of STATUSES) out.byStatus[status] += rollup.byStatus[status];
  }
  return out;
}

export function classifyEvidence(input: {
  distinctQuestions: number;
  independentAttempts: number;
  marksAvailable: number;
  accuracy: number | null;
  daysSinceTested: number | null;
}): { strength: EvidenceStrength; status: SpecStatus } {
  const { distinctQuestions, independentAttempts, marksAvailable, accuracy, daysSinceTested } = input;
  if (distinctQuestions === 0 || accuracy === null) return { strength: "untested", status: "no-evidence" };
  if (distinctQuestions < 2 || marksAvailable < 4) return { strength: "thin", status: "insufficient" };
  const established =
    distinctQuestions >= ESTABLISHED_QUESTIONS &&
    independentAttempts >= ESTABLISHED_INDEPENDENT_ATTEMPTS &&
    marksAvailable >= ESTABLISHED_MARKS;
  const strength: EvidenceStrength = established ? "established" : "building";
  if (accuracy < 0.5) return { strength, status: "weak" };
  if (!established || accuracy < 0.8) return { strength, status: "developing" };
  if (daysSinceTested !== null && daysSinceTested > STALE_AFTER_DAYS) return { strength, status: "stale" };
  return { strength, status: "secure" };
}

interface Tally {
  attemptIds: Set<Id>;
  questionIds: Set<Id>;
  independent: Set<Id>;
  gained: number;
  available: number;
  last: number;
}

function questionSpecIds(question: Question): Set<Id> {
  return new Set([...(question.specPointIds ?? []), ...question.parts.flatMap((part) => part.specPointIds ?? [])]);
}

export function buildSpecificationMap(input: SpecificationMapInput): SpecificationMap {
  const now = (input.now ?? new Date()).getTime();
  const subjectQuestions = input.questions.filter((question) => question.subjectId === input.subjectId);
  const questionsById = new Map(subjectQuestions.map((question) => [question.id, question] as const));

  const available = new Map<Id, number>();
  for (const question of subjectQuestions) {
    for (const id of questionSpecIds(question)) available.set(id, (available.get(id) ?? 0) + 1);
  }

  const tallies = new Map<Id, Tally>();
  const tally = (id: Id): Tally => {
    const row = tallies.get(id) ?? { attemptIds: new Set(), questionIds: new Set(), independent: new Set(), gained: 0, available: 0, last: 0 };
    tallies.set(id, row);
    return row;
  };
  for (const attempt of input.attempts) {
    if (attempt.subjectId !== input.subjectId || !trustworthyAttempt(attempt)) continue;
    const question = questionsById.get(attempt.questionId);
    if (!question) continue;
    const at = Date.parse(attempt.createdAt);
    const questionLevel = new Set(question.specPointIds ?? []);
    const credited = new Set<Id>();
    for (const part of question.parts) {
      const marked = attempt.marked.find((row) => row.partId === part.id && row.max > 0);
      if (!marked || !part.specPointIds?.length) continue;
      for (const id of part.specPointIds) {
        const row = tally(id);
        row.gained += marked.awarded;
        row.available += marked.max;
        credited.add(id);
      }
    }
    // Whole-question mapping only stands in where no part claimed the statement.
    for (const id of questionLevel) {
      if (credited.has(id)) continue;
      const row = tally(id);
      row.gained += attempt.awarded;
      row.available += attempt.max;
      credited.add(id);
    }
    for (const id of credited) {
      const row = tally(id);
      row.attemptIds.add(attempt.id);
      row.questionIds.add(question.id);
      if (independentAttempt(attempt)) row.independent.add(attempt.id);
      row.last = Math.max(row.last, at);
    }
  }

  const pointEvidence = (point: SpecPoint): SpecPointEvidence => {
    const row = tallies.get(point.id);
    const accuracy = row && row.available > 0 ? Math.round((row.gained / row.available) * 1000) / 1000 : null;
    const daysSinceTested = row && row.last ? Math.max(0, Math.floor((now - row.last) / DAY_MS)) : null;
    const base = {
      distinctQuestions: row?.questionIds.size ?? 0,
      independentAttempts: row?.independent.size ?? 0,
      marksAvailable: row?.available ?? 0,
      accuracy,
      daysSinceTested,
    };
    return {
      specPointId: point.id,
      ref: point.ref,
      text: point.text,
      questionsAvailable: available.get(point.id) ?? 0,
      attempts: row?.attemptIds.size ?? 0,
      distinctQuestions: base.distinctQuestions,
      independentAttempts: base.independentAttempts,
      marksGained: Math.round((row?.gained ?? 0) * 10) / 10,
      marksAvailable: Math.round(base.marksAvailable * 10) / 10,
      accuracy,
      lastTestedAt: row && row.last ? new Date(row.last).toISOString() : null,
      daysSinceTested,
      ...classifyEvidence(base),
    };
  };

  const topics = input.topics ?? topicsFor(input.subjectId);
  const units = (input.units ?? unitsFor(input.subjectId)).slice().sort((a, b) => a.order - b.order);
  const unitRows: SpecUnitEvidence[] = units
    .map((unit) => {
      const topicRows: SpecTopicEvidence[] = topics
        .filter((topic) => topic.unitId === unit.id && topic.specPoints?.length)
        .sort((a, b) => a.order - b.order)
        .map((topic) => {
          const points = (topic.specPoints ?? []).map(pointEvidence);
          const rollup = emptyRollup();
          for (const point of points) addToRollup(rollup, point);
          return { topic, points, rollup };
        });
      return { unit, topics: topicRows, rollup: mergeRollups(topicRows.map((row) => row.rollup)) };
    })
    .filter((unit) => unit.topics.length > 0);

  const allTopics = unitRows.flatMap((unit) => unit.topics);
  const lacking = allTopics
    .map((row) => ({ topicId: row.topic.id, lacking: row.rollup.total - row.rollup.evidenced }))
    .filter((row) => row.lacking > 0)
    .sort((a, b) => b.lacking - a.lacking || a.topicId.localeCompare(b.topicId))[0];

  return {
    subjectId: input.subjectId,
    units: unitRows,
    rollup: mergeRollups(unitRows.map((unit) => unit.rollup)),
    thinnestTopic: lacking ?? null,
  };
}

export const STATUS_LABELS: Record<SpecStatus, string> = {
  "no-evidence": "No evidence",
  insufficient: "Not enough evidence",
  weak: "Weak",
  developing: "Developing",
  secure: "Secure",
  stale: "Secure but stale",
};
