"use client";

import { useMemo, useState } from "react";
import { allQualifications, allSubjects, availableBoards, getBoard, getSubject, gradesFor } from "@/domain/curriculum";
import { isFlagship } from "@/domain/flagship";
import { todayIso } from "@/domain/scheduling";
import { isOptionalExamDateValid } from "@/domain/onboarding";
import type { Availability, ExamDate, Id } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { Button, Field, Panel, Pill, ProgressBar, cx } from "./ui";
import { SubjectPicker } from "./SubjectPicker";
import { CreditedIcon } from "./icons";

// ---------------------------------------------------------------------------
// First screen. Not a dialog over the app — the app itself waits (AppShell
// renders nothing else until onboarding completes), so this is a full page.
//
// Five steps that end in value, not configuration:
//   1. board → 2. subjects → 3. exam dates → 4. quick check → 5. first step.
// The diagnostic preferentially uses trusted/reviewed content; unreviewed
// questions never provide trusted evidence. After onboarding Today shows the
// personalised next action immediately.
// ---------------------------------------------------------------------------

const PHASES = ["Board", "Subjects", "Exam dates", "Quick check", "Your first step"] as const;

/** Default time budget while the student has not yet tuned Settings. */
const STEADY_MINUTES = [90, 60, 60, 60, 60, 45, 120];

/** Subject grouped under the qualification it belongs to, for a board. */
interface SubjectRow {
  qualificationId: Id;
  level: string;
  subjects: { id: Id; name: string; detail: string }[];
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const store = useStoreFields("regeneratePlan", "updateSettings", "upsertExamDate", "userId", "recordFunnel");
  const [phase, setPhase] = useState(0);
  const [boardId, setBoardId] = useState<Id | null>(null);
  const [subjectIds, setSubjectIds] = useState<Id[]>([]);
  const [examDates, setExamDates] = useState<Record<string, string>>({});
  const [diagnosticChoice, setDiagnosticChoice] = useState<"quick" | "skip">("quick");
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
          .map((subject) => ({
            id: subject.id,
            name: subject.name,
            detail:
              subject.contentTier === "flagship"
                ? `${qualification.level} · Flagship`
                : `${qualification.level} · Reference · not spec-checked`,
          }))
          .sort((a, b) => {
            const aRef = a.detail.includes("Reference") ? 1 : 0;
            const bRef = b.detail.includes("Reference") ? 1 : 0;
            return aRef - bRef || a.name.localeCompare(b.name);
          }),
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
  const invalidDates = chosenSubjects.filter((s) => {
    const date = examDates[s.id];
    return !isOptionalExamDateValid(date, today);
  });
  const enteredDatesValid = invalidDates.length === 0;
  const onFinalPhase = phase === PHASES.length - 1;
  const onDatesPhase = phase === 2;
  const flagshipChosen = subjectIds.filter((id) => isFlagship(id));
  const referenceChosen = subjectIds.filter((id) => !isFlagship(id));
  const firstSubjectName = chosenSubjects[0] ? getSubject(chosenSubjects[0].id)?.name ?? chosenSubjects[0].name : "";
  const canContinue =
    phase === 0 ? boardId !== null : phase === 1 ? subjectIds.length > 0 : phase === 2 ? enteredDatesValid : true;

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
      // A skipped quick check stays skipped on Today; otherwise Today leads with it.
      quickCheckSkipped: diagnosticChoice === "skip" ? [...subjectIds] : [],
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
    if (diagnosticChoice === "quick" && subjectIds.length) {
      void store.recordFunnel("diagnostic_started", subjectIds[0]!);
    } else {
      void store.recordFunnel("diagnostic_skipped", subjectIds[0] ?? "none");
    }
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Which subjects do you take with {board.name}?</h2>
                  <p className="text-xs text-ink3 mt-0.5">
                    Choose every subject you&apos;re sitting. Flagship subjects are authored against the spec;
                    reference-tier boards reuse that outline and are labelled as not spec-checked.
                  </p>
                </div>
                <div className="shrink-0 rounded-xl border border-line bg-surface2 px-3 py-2 text-center" aria-live="polite">
                  <p className="text-lg font-semibold leading-none tabular-nums">{subjectIds.length}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink3 font-semibold">
                    {subjectIds.length === 1 ? "subject" : "subjects"} selected
                  </p>
                </div>
              </div>

              {chosenSubjects.length ? (
                <div className="mt-3 rounded-xl border border-line bg-surface2/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">Your selection</p>
                    <Button size="sm" variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => setSubjectIds([])}>
                      Clear all
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected subjects">
                    {chosenSubjects.map((subject) => (
                      <Pill key={subject.id} tone="accent">
                        {subject.name}
                      </Pill>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-line bg-surface2/40 px-3 py-2.5 text-xs text-ink3" role="status">
                  Start by choosing at least one subject below.
                </p>
              )}
            </div>
            {subjectRows.map((row) => (
              <section key={row.qualificationId} className="rounded-xl border border-line bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
                    {board.name} {row.level}
                  </p>
                  <p className="text-[11px] text-ink3 tabular-nums">
                    {row.subjects.filter((subject) => subjectIds.includes(subject.id)).length} of {row.subjects.length}
                  </p>
                </div>
                <SubjectPicker
                  options={row.subjects}
                  selectedIds={subjectIds}
                  onChange={setSubjectIds}
                  selectionMode="multiple"
                  ariaLabel={`${row.level} subjects`}
                />
              </section>
            ))}
            {!subjectIds.length ? <p className="text-xs text-ink3">Pick at least one subject to continue.</p> : null}
          </Panel>
        ) : null}

        {phase === 2 ? (
          <Panel className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">When are the exams? <span className="text-ink3 font-normal">(optional)</span></h2>
              <p className="text-xs text-ink3 mt-0.5">
                If you know a date, add it so the plan can pace revision towards it. If you do not know yet, skip this
                step and add dates later in Settings.
              </p>
            </div>
            {chosenSubjects.map((subject) => (
              <Field key={subject.id} label={`${subject.name} exam date`}>
                <input
                  type="date"
                  min={today}
                  value={examDates[subject.id] ?? ""}
                  onChange={(e) => setExamDates({ ...examDates, [subject.id]: e.target.value })}
                  className="field"
                  aria-label={`${subject.name} exam date`}
                />
              </Field>
            ))}
            {missingDates.length ? (
              <p className="text-xs text-ink3" role="status">
                {missingDates.length === chosenSubjects.length
                  ? "No dates yet is fine — build your plan now and add them later in Settings."
                  : `Still to add: ${missingDates.map((s) => s.name).join(", ")}. You can build now and add them later in Settings.`}
              </p>
            ) : null}
            {invalidDates.length ? (
              <p className="text-xs text-danger" role="status">
                Choose today or a future date, or clear the invalid date before building your plan.
              </p>
            ) : null}
          </Panel>
        ) : null}

        {phase === 3 ? (
          <Panel className="space-y-3">
            <h2 className="text-sm font-semibold">Start with a short diagnostic?</h2>
            <p className="text-xs text-ink3">
              A 5–10 minute quick check across several topics shows Revise where to start. It uses
              trusted, reviewed questions where they exist — no hints, so answers count as unaided
              evidence. It is not a grade and never tests everything.
            </p>
            <ul className="space-y-2" role="radiogroup" aria-label="Diagnostic choice">
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={diagnosticChoice === "quick"}
                  onClick={() => setDiagnosticChoice("quick")}
                  className={cx(
                    "w-full text-left card px-4 py-3 min-h-[3.5rem] flex items-start gap-3",
                    diagnosticChoice === "quick" ? "border-ink3 bg-surface2" : "hover:border-ink3",
                  )}
                >
                  <span className={cx("mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0", diagnosticChoice === "quick" ? "bg-accent border-transparent text-onaccent" : "border-line")}>
                    {diagnosticChoice === "quick" ? <CreditedIcon size={12} aria-hidden /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">Yes — find where I should start</span>
                    <span className="block text-xs text-ink3 mt-0.5">Recommended. About 5–10 minutes, then a personalised first step.</span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={diagnosticChoice === "skip"}
                  onClick={() => setDiagnosticChoice("skip")}
                  className={cx(
                    "w-full text-left card px-4 py-3 min-h-[3.5rem] flex items-start gap-3",
                    diagnosticChoice === "skip" ? "border-ink3 bg-surface2" : "hover:border-ink3",
                  )}
                >
                  <span className={cx("mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0", diagnosticChoice === "skip" ? "bg-accent border-transparent text-onaccent" : "border-line")}>
                    {diagnosticChoice === "skip" ? <CreditedIcon size={12} aria-hidden /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">Skip for now</span>
                    <span className="block text-xs text-ink3 mt-0.5">Start revising directly. You can run the check later from Today.</span>
                  </span>
                </button>
              </li>
            </ul>
            {flagshipChosen.length ? (
              <p className="text-xs text-ink2" role="status">
                {flagshipChosen.length === subjectIds.length
                  ? "Your subjects have authored flagship content; the check uses reviewed questions where they exist."
                  : `Flagship: ${flagshipChosen.map((id) => getSubject(id)?.name ?? id).join(", ")} use reviewed questions where available.`}
              </p>
            ) : null}
            {referenceChosen.length ? (
              <p className="text-xs text-ink3" role="note">
                Reference subjects ({referenceChosen.map((id) => getSubject(id)?.name ?? id).join(", ")}) are good for
                practice, but unreviewed questions cannot provide trusted evidence — Revise will say so rather than guess.
              </p>
            ) : null}
          </Panel>
        ) : null}

        {phase === 4 ? (
          <Panel className="space-y-3">
            <h2 className="text-sm font-semibold">Your first step is ready</h2>
            <p className="text-sm text-ink2">
              {diagnosticChoice === "quick"
                ? firstSubjectName
                  ? `Revise will start with a quick check in ${firstSubjectName}, then choose your personalised next action from what you get wrong. Anything you lose becomes a repair plan.`
                  : "Revise will start with a quick check, then choose your personalised next action."
                : "Revise already has a first step waiting on Today — and you can run the quick check any time to sharpen it."}
            </p>
            <div className="rounded-xl border border-line bg-surface2/60 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What happens next</p>
              <ol className="mt-1.5 space-y-1 text-xs text-ink2 list-decimal pl-4">
                <li>{diagnosticChoice === "quick" ? "Answer a few short questions with no hints." : "Open Today and start the recommended step."}</li>
                <li>See what Revise found and why it chose the next action.</li>
                <li>Mistakes turn into targeted repair, then an unseen proof check.</li>
              </ol>
            </div>
            <p className="text-xs text-ink3">
              Revise already understands where to look first — you will leave thinking that, not that you configured a dashboard.
            </p>
          </Panel>
        ) : null}

        <div className={cx("flex gap-2", onFinalPhase && "flex-col sm:flex-row")}>
          {phase > 0 ? (
            <Button className="min-h-[3rem]" onClick={() => setPhase(phase - 1)}>
              Back
            </Button>
          ) : null}
          {!onFinalPhase ? (
            <Button
              variant="primary"
              className="flex-1 min-h-[3rem]"
              disabled={!canContinue}
              onClick={() => setPhase(phase + 1)}
            >
              Continue
            </Button>
          ) : null}
          {onFinalPhase ? (
            <Button
              variant="primary"
              className="flex-1 min-h-[3rem]"
              disabled={saving || !canContinue}
              onClick={() => void finish()}
            >
              {saving
                ? "Building your plan…"
                : diagnosticChoice === "quick"
                  ? "Start my quick check"
                  : missingDates.length
                    ? "Build my plan without all dates"
                    : "Build my plan"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
