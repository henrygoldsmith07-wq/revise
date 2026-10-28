// ---------------------------------------------------------------------------
// Per-unit exam timetable. A WJEC AS student sits Unit 1 and Unit 2 on
// different days, so one date per subject cannot say "Unit 1 Physics is in 23
// days". Dates are stored as ExamDate rows with paperSpecId = "<subject>.u<N>"
// (the field already exists); a row without paperSpecId is the old
// whole-subject date and keeps working for every unit that has no date of its own.
//
// Honesty rules: a topic only inherits a date that belongs to its own unit (or
// the whole-subject date). If the student dated Unit 1 only, Unit 2 topics get
// no countdown rather than borrowing Unit 1's.
// ---------------------------------------------------------------------------

import { topicUnitNumber, type YearGroup } from "./year-group";
import type { ExamDate, Id, IsoDate, Subject, Topic } from "./types";

export const TIMETABLE_UNITS = [1, 2, 3, 4] as const;

export function unitPaperSpecId(subjectId: Id, unit: number): Id {
  return `${subjectId}.u${unit}`;
}

/** The unit number a paper spec id names ("x.u2" -> 2), or null. */
export function unitOfPaperSpec(paperSpecId: Id | undefined): number | null {
  const match = /\.u(\d+)$/.exec(paperSpecId ?? "");
  return match ? Number(match[1]) : null;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** The exam row that governs a topic: its own unit's dated paper, else the whole-subject date. */
export function examForTopic(exams: readonly ExamDate[], topic: Pick<Topic, "specRef" | "id" | "subjectId" | "title">, today: IsoDate): ExamDate | null {
  const unit = topicUnitNumber(topic);
  const mine = exams.filter((exam) => exam.subjectId === topic.subjectId && exam.date >= today);
  const own = unit === null ? [] : mine.filter((exam) => exam.paperSpecId === unitPaperSpecId(topic.subjectId, unit));
  const pool = own.length ? own : mine.filter((exam) => !exam.paperSpecId);
  return [...pool].sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** Days until the exam that governs this topic, or null when none is dated for it. */
export function daysToTopicExam(exams: readonly ExamDate[], topic: Pick<Topic, "specRef" | "id" | "subjectId" | "title">, today: IsoDate): number | null {
  const exam = examForTopic(exams, topic, today);
  return exam ? daysBetween(today, exam.date) : null;
}

/** True once every dated paper for this topic's own unit falls on or before `date`: the unit has been sat. */
export function topicUnitSat(exams: readonly ExamDate[], topic: Pick<Topic, "specRef" | "id" | "subjectId" | "title">, date: IsoDate): boolean {
  const unit = topicUnitNumber(topic);
  if (unit === null) return false;
  const own = exams.filter((exam) => exam.subjectId === topic.subjectId && exam.paperSpecId === unitPaperSpecId(topic.subjectId, unit));
  return own.length > 0 && own.every((exam) => exam.date <= date);
}

/**
 * The day a subject's run-up ends: its next exam, or, once any unit is dated
 * separately, the latest paper still ahead (a whole-subject date included,
 * since it governs every undated unit). Sitting Unit 1 does not end Unit 2's run-up.
 */
export function subjectRunUpEnd(exams: readonly ExamDate[], subjectId: Id, today: IsoDate): IsoDate | null {
  const ahead = exams.filter((exam) => exam.subjectId === subjectId && exam.date >= today).map((exam) => exam.date).sort();
  if (!ahead.length) return null;
  const unitDated = exams.some((exam) => exam.subjectId === subjectId && exam.paperSpecId);
  return unitDated ? ahead[ahead.length - 1] : ahead[0];
}

export type UnitExamStatus = "upcoming" | "today" | "past" | "undated";

export interface UnitTimetableRow {
  subjectId: Id;
  subjectName: string;
  unit: number;
  level: "AS" | "A2";
  paperSpecId: Id;
  paperName: string;
  durationMinutes: number;
  marks: number;
  /** The dated row for this unit, or null. */
  exam: ExamDate | null;
  date: IsoDate | null;
  days: number | null;
  status: UnitExamStatus;
  topicCount: number;
}

/** Units a learner can date: AS units only for Year 12, all four written units otherwise. */
export function timetableRows(input: {
  subjects: readonly Subject[];
  topics: readonly Topic[];
  exams: readonly ExamDate[];
  today: IsoDate;
  yearGroup?: YearGroup;
}): UnitTimetableRow[] {
  const rows: UnitTimetableRow[] = [];
  for (const subject of input.subjects) {
    for (const unit of TIMETABLE_UNITS) {
      if (input.yearGroup === "year-12" && unit > 2) continue;
      const spec = subject.papers.find((paper) => paper.id === unitPaperSpecId(subject.id, unit));
      if (!spec) continue;
      const topicCount = input.topics.filter((topic) => topic.subjectId === subject.id && topicUnitNumber(topic) === unit).length;
      const all = input.exams
        .filter((exam) => exam.subjectId === subject.id && exam.paperSpecId === spec.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const exam = all.find((row) => row.date >= input.today) ?? all[all.length - 1] ?? null;
      const days = exam ? daysBetween(input.today, exam.date) : null;
      rows.push({
        subjectId: subject.id,
        subjectName: subject.name,
        unit,
        level: unit <= 2 ? "AS" : "A2",
        paperSpecId: spec.id,
        paperName: spec.name,
        durationMinutes: spec.durationMinutes,
        marks: spec.marks ?? 0,
        exam,
        date: exam?.date ?? null,
        days,
        status: days === null ? "undated" : days < 0 ? "past" : days === 0 ? "today" : "upcoming",
        topicCount,
      });
    }
  }
  return rows;
}

/** Dated, not-yet-sat papers across subjects, soonest first. */
export function upcomingPapers(rows: readonly UnitTimetableRow[]): UnitTimetableRow[] {
  return rows
    .filter((row) => row.status === "upcoming" || row.status === "today")
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || a.subjectName.localeCompare(b.subjectName) || a.unit - b.unit);
}

export type ExamDateCheck = { ok: true } | { ok: false; reason: string };

/** A unit paper date must be a real calendar day, not in the past, and within three years. */
export function checkUnitExamDate(value: string, today: IsoDate): ExamDateCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, reason: "Enter the date as day, month and year." };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return { ok: false, reason: "That is not a real calendar date." };
  if (value < today) return { ok: false, reason: "That date has already passed." };
  if (daysBetween(today, value) > 365 * 3) return { ok: false, reason: "That is more than three years away." };
  return { ok: true };
}

export interface TimetableEdit {
  save?: ExamDate;
  removeIds: Id[];
}

/**
 * Set (or clear, with an empty date) one unit's paper date. Replaces every
 * existing row for that unit so duplicates cannot accumulate.
 */
export function editUnitDate(input: {
  exams: readonly ExamDate[];
  userId: Id;
  subject: Pick<Subject, "id" | "name">;
  unit: number;
  paperName: string;
  date: string;
  newId: Id;
}): TimetableEdit {
  const spec = unitPaperSpecId(input.subject.id, input.unit);
  const existing = input.exams.filter((exam) => exam.subjectId === input.subject.id && exam.paperSpecId === spec);
  if (!input.date) return { removeIds: existing.map((exam) => exam.id) };
  const keep = existing[0];
  const save: ExamDate = {
    id: keep?.id ?? input.newId,
    userId: input.userId,
    subjectId: input.subject.id,
    paperSpecId: spec,
    date: input.date,
    label: `${input.subject.name} ${input.paperName.split(":")[0] ?? `Unit ${input.unit}`}`,
  };
  return { save, removeIds: existing.slice(1).map((exam) => exam.id) };
}

/** One honest sentence about the nearest paper for a subject, used by Today and the plan. */
export function nextPaperSentence(row: UnitTimetableRow | undefined): string | null {
  if (!row || row.days === null || row.days < 0) return null;
  const when = row.days === 0 ? "today" : row.days === 1 ? "tomorrow" : `in ${row.days} days`;
  return `${row.subjectName} Unit ${row.unit} is ${when} (${row.durationMinutes} minutes, ${row.marks} marks).`;
}
