"use client";

// Settings: one date per unit paper. A Year 12 student sits Unit 1 and Unit 2 on
// different days, so each gets its own date; the planner then counts down to
// the paper a topic actually belongs to. Clearing a date removes it.

import { useMemo, useState } from "react";
import { Button, Panel, SectionHeading } from "@/components/ui";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { checkUnitExamDate, editUnitDate, timetableRows, upcomingPapers, type UnitTimetableRow } from "@/domain/exam-timetable";
import { todayLocal } from "@/domain/local-date";
import type { YearGroup } from "@/domain/year-group";
import type { ExamDate, Id, Subject } from "@/domain/types";

interface Props {
  subjectIds: readonly Id[];
  exams: readonly ExamDate[];
  userId: Id;
  yearGroup?: YearGroup;
  today?: string;
  onSave: (exam: ExamDate) => Promise<void>;
  onRemove: (id: Id) => Promise<void>;
  onChanged?: () => void;
}

function countdown(row: UnitTimetableRow): string {
  if (row.days === null) return "No date yet";
  if (row.days < 0) return "Sat";
  if (row.days === 0) return "Today";
  if (row.days === 1) return "Tomorrow";
  return `In ${row.days} days`;
}

export function UnitExamTimetable({ subjectIds, exams, userId, yearGroup, today = todayLocal(), onSave, onRemove, onChanged }: Props) {
  const subjects = useMemo(() => subjectIds.map((id) => getSubject(id)).filter((s): s is Subject => Boolean(s)), [subjectIds]);
  const topics = useMemo(() => subjects.flatMap((s) => topicsFor(s.id)), [subjects]);
  const rows = useMemo(() => timetableRows({ subjects, topics, exams, today, yearGroup }), [subjects, topics, exams, today, yearGroup]);
  const next = upcomingPapers(rows)[0];
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function change(row: UnitTimetableRow, value: string) {
    const key = row.paperSpecId;
    if (value) {
      const check = checkUnitExamDate(value, today);
      if (!check.ok) {
        setErrors((prev) => ({ ...prev, [key]: check.reason }));
        return;
      }
    }
    setErrors((prev) => {
      const { [key]: _gone, ...rest } = prev;
      void _gone;
      return rest;
    });
    const subject = subjects.find((s) => s.id === row.subjectId);
    if (!subject) return;
    const edit = editUnitDate({ exams, userId, subject, unit: row.unit, paperName: row.paperName, date: value, newId: crypto.randomUUID() });
    if (edit.save) await onSave(edit.save);
    for (const id of edit.removeIds) await onRemove(id);
    onChanged?.();
  }

  if (!rows.length) return null;
  return (
    <section aria-labelledby="unit-timetable-heading">
      <SectionHeading
        title="Exam timetable"
        hint={yearGroup === "year-12" ? "Your AS papers, one date each." : "One date per unit paper. Leave a unit blank if you do not know it yet."}
      />
      <Panel className="space-y-3">
        <p id="unit-timetable-heading" className="text-sm text-ink">
          {next ? `Next paper: ${next.subjectName} ${next.paperName.split(":")[0]}, ${countdown(next).toLowerCase()}.` : "Add a date for each paper you know. Topics count down to the paper they belong to."}
        </p>
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.paperSpecId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {row.subjectName} · {row.paperName.split(":")[0]} ({row.level})
                </p>
                <p className="text-[11px] text-ink3">
                  {row.durationMinutes} min · {row.marks} marks · {row.topicCount} topic{row.topicCount === 1 ? "" : "s"} · {countdown(row)}
                </p>
                {errors[row.paperSpecId] ? (
                  <p role="alert" className="text-[11px] text-danger">
                    {errors[row.paperSpecId]}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label={`${row.subjectName} ${row.paperName.split(":")[0]} date`}
                  className="field text-sm"
                  defaultValue={row.date ?? ""}
                  min={today}
                  onChange={(event) => void change(row, event.target.value)}
                />
                {row.date ? (
                  <Button size="sm" variant="secondary" onClick={() => void change(row, "")}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
