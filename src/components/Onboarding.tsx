"use client";

import { useMemo, useState } from "react";
import { allQualifications, allSubjects, availableBoards, getBoard, gradesFor } from "@/domain/curriculum";
import { todayIso } from "@/domain/scheduling";
import type { Availability, ExamDate, Id } from "@/domain/types";
import { useStore } from "@/state/store";
import { Button, Field, Panel, ProgressBar, cx } from "./ui";
import { CreditedIcon } from "./icons";

// ---------------------------------------------------------------------------
// First screen. Not a dialog over the app — the app itself waits (AppShell
// renders nothing else until onboarding completes), so this is a full page.
//
// Exactly three questions, each of which materially changes what the app does
// next: which exam board (scopes every subject offered), which subjects on
// that board (scopes all content), and when each exam is (drives planner
// urgency). Everything that can be defaulted is not asked: the time budget
// starts on the "Steady" preset and the target grade on the qualification's
// top grade, both fine-tunable in Settings afterwards. There is no Skip —
// nothing in the app makes sense until board, subject and exam date exist.
// ---------------------------------------------------------------------------

const PHASES = ["Board", "Subjects", "Exam dates"] as const;

/** Default time budget while the student has not yet tuned Settings. */
const STEADY_MINUTES = [90, 60, 60, 60, 60, 45, 120];

/** Subject grouped under the qualification it belongs to, for a board. */
interface SubjectRow {
  qualificationId: Id;
  level: string;
  subjects: { id: Id; name: string }[];
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [phase, setPhase] = useState(0);
  const [boardId, setBoardId] = useState<Id | null>(null);
  const [subjectIds, setSubjectIds] = useState<Id[]>([]);
  const [examDates, setExamDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const boards = useMemo(() => availableBoards(), []);
  const today = todayIso();

  const board = boardId ? (getBoard(boardId) ?? null) : null;

  /** Subject rows for the chosen board, grouped by qualification level. */
  const subjectRows = useMemo<SubjectRow[]>(() => {
    if (!boardId) return [];
    return allQualifications(boardId)
      .map((qualification) => ({
        qualificationId: qualification.id,
        level: qualification.level,
        subjects: allSubjects(qualification.id)
          .map((subject) => ({ id: subject.id, name: subject.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((row) => row.subjects.length > 0)
      .sort((a, b) => a.level.localeCompare(b.level));
  }, [boardId]);

  const chosenSubjects = useMemo(
    () =>
      subjectRows
        .flatMap((row) => row.subjects)
        .filter((s) => subjectIds.includes(s.id)),
    [subjectRows, subjectIds],
  );

  const missingDates = chosenSubjects.filter((s) => !examDates[s.id]);
  const datesValid =
    chosenSubjects.length > 0 &&
    missingDates.length === 0 &&
    chosenSubjects.every((s) => (examDates[s.id] ?? "") >= today);
  const canContinue = phase === 0 ? boardId !== null : phase === 1 ? subjectIds.length > 0 : datesValid;

  function chooseBoard(id: Id) {
    // Changing board resets subject + date choices: they belonged to the
    // previous board's qualifications.
    setBoardId(id);
    setSubjectIds([]);
    setExamDates({});
  }

  async function finish() {
    if (!boardId) return;
    setSaving(true);
    const availability: Availability[] = STEADY_MINUTES.map((minutes, weekday) => ({ weekday, minutes }));

    await store.updateSettings({
      displayName: "Student",
      subjectIds,
      availability,
      targetGrades: Object.fromEntries(subjectIds.map((id) => [id, gradesFor(id)[0] ?? "A*"])),
    });

    for (const subject of chosenSubjects) {
      const date = examDates[subject.id];
      if (!date) continue;
      const exam: ExamDate = {
        id: crypto.randomUUID(),
        userId: store.userId,
        subjectId: subject.id,
        date,
        label: `${subject.name} exam`,
      };
      await store.upsertExamDate(exam);
    }

    // Build the plan now, so Today has real work on it the moment they land.
    await store.regeneratePlan();
    onDone();
  }

  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4 app-enter motion-safe:app-enter">
        <header className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Welcome</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Revision that knows what to do next</h1>
          <p className="text-sm text-ink2">
            Pick your exam board, your subjects and when the exams are — the plan, flashcards and questions follow.
          </p>
        </header>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2" aria-live="polite">
            Step {phase + 1} of {PHASES.length} · {PHASES[phase]}
          </p>
          <ProgressBar value={(phase + 1) / PHASES.length} label={`Step ${phase + 1} of ${PHASES.length}`} />
        </div>

        {phase === 0 ? (
          <Panel className="space-y-3">
            <h2 className="text-sm font-semibold">Which exam board are you studying with?</h2>
            <p className="text-xs text-ink3 mt-0.5 -mb-1">
              Your specification, questions and past papers follow your board&apos;s syllabus. Pick the one your school
              uses.
            </p>
            <ul className="space-y-2 pt-2">
              {boards.map((option) => {
                const on = boardId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => chooseBoard(option.id)}
                      aria-pressed={on}
                      className={cx(
                        "w-full text-left card px-4 py-3.5 min-h-[3.5rem] flex items-center gap-3 transition-colors",
                        on ? "border-ink3 bg-surface2" : "hover:border-ink3",
                      )}
                    >
                      <span
                        className={cx(
                          "w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                          on ? "bg-accent border-transparent text-onaccent" : "border-line",
                        )}
                      >
                        {on ? <CreditedIcon size={12} aria-hidden /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{option.name}</span>
                        <span className="block text-[11px] text-ink3 truncate">{option.country}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

        {phase === 1 && board ? (
          <Panel className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Which subjects do you take with {board.name}?</h2>
              <p className="text-xs text-ink3 mt-0.5">
                Tick every subject you&apos;re sitting — each comes with its specification, flashcards and exam
                questions already written.
              </p>
            </div>
            {subjectRows.map((row) => (
              <div key={row.qualificationId}>
                <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
                  {board.name} {row.level}
                </p>
                <ul className="space-y-2">
                  {row.subjects.map((subject) => {
                    const on = subjectIds.includes(subject.id);
                    return (
                      <li key={subject.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSubjectIds(on ? subjectIds.filter((id) => id !== subject.id) : [...subjectIds, subject.id])
                          }
                          aria-pressed={on}
                          aria-label={`${row.level} ${subject.name}`}
                          className={cx(
                            "w-full text-left card px-4 py-3 min-h-[3.25rem] flex items-center gap-3 transition-colors",
                            on ? "border-ink3 bg-surface2" : "hover:border-ink3",
                          )}
                        >
                          <span
                            className={cx(
                              "w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                              on ? "bg-accent border-transparent text-onaccent" : "border-line",
                            )}
                          >
                            {on ? <CreditedIcon size={12} aria-hidden /> : null}
                          </span>
                          <span className="text-sm text-ink">{subject.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!subjectIds.length ? <p className="text-xs text-ink3">Pick at least one subject to continue.</p> : null}
          </Panel>
        ) : null}

        {phase === 2 ? (
          <Panel className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">When are the exams?</h2>
              <p className="text-xs text-ink3 mt-0.5">
                This is what makes the plan urgent in the right places. Every subject needs its date before you can
                start.
              </p>
            </div>
            {chosenSubjects.map((subject) => (
              <Field key={subject.id} label={`${subject.name} exam date`}>
                <input
                  type="date"
                  min={today}
                  required
                  value={examDates[subject.id] ?? ""}
                  onChange={(e) => setExamDates({ ...examDates, [subject.id]: e.target.value })}
                  className="field"
                  aria-label={`${subject.name} exam date`}
                />
              </Field>
            ))}
            {missingDates.length ? (
              <p className="text-xs text-ink3" role="status">
                Add a date for: {missingDates.map((s) => s.name).join(", ")}
              </p>
            ) : null}
          </Panel>
        ) : null}

        <div className="flex gap-2">
          {phase > 0 ? (
            <Button className="min-h-[3rem]" onClick={() => setPhase(phase - 1)}>
              Back
            </Button>
          ) : null}
          {phase < PHASES.length - 1 ? (
            <Button
              variant="primary"
              className="flex-1 min-h-[3rem]"
              disabled={!canContinue}
              onClick={() => setPhase(phase + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button variant="primary" className="flex-1 min-h-[3rem]" disabled={saving || !canContinue} onClick={() => void finish()}>
              {saving ? "Building your plan…" : "Build my plan"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
