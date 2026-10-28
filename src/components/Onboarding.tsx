"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { allQualifications, allSubjects, availableBoards, getBoard, getSubject, gradesFor } from "@/domain/curriculum";
import { isFlagship } from "@/domain/flagship";
import { AUTHORED_REFERENCE_SUBJECTS } from "@/domain/curriculum/honesty";
import { todayIso } from "@/domain/scheduling";
import { isOptionalExamDateValid } from "@/domain/onboarding";
import type { Availability, ExamDate, Id } from "@/domain/types";
import { useStoreFields } from "@/state/store-context";
import type { StoreValue } from "@/state/store";
import { Button, Panel, Pill, cx } from "./ui";
import type { Unit4Option, YearGroup } from "@/domain/year-group";
import { examRowsForSitting, examSittingFor, type ExamSitting } from "@/domain/exam-series";
import { boardAfterRegionChange, regionBoardMissing, type SchoolRegion } from "@/domain/school-region";
import { SubjectPicker } from "./SubjectPicker";
import { CreditedIcon } from "./icons";
import { OnboardingSchoolStep } from "./OnboardingSchoolStep";
import { OnboardingExamDatesStep } from "./OnboardingExamDatesStep";

// ---------------------------------------------------------------------------
// First screen. Not a dialog over the app — the app itself waits (AppShell
// renders nothing else until onboarding completes), so this is a full page.
//
// Five steps that end in value, not configuration:
//   1. year, school and board → 2. subjects → 3. exam dates → 4. quick check → 5. first step.
// Step 1 infers the board from where the school is (Wales → WJEC) and step 3
// fills in exam dates from the year group, board and subject
// (src/domain/exam-series.ts); both stay editable.
// The diagnostic preferentially uses trusted/reviewed content; unreviewed
// questions never provide trusted evidence. After onboarding Today shows the
// personalised next action immediately.
// ---------------------------------------------------------------------------

const PHASES = ["You & board", "Subjects", "Exam dates", "Quick check", "Your first step"] as const;

/** Default time budget while the student has not yet tuned Settings. */
const STEADY_MINUTES = [90, 60, 60, 60, 60, 45, 120];

/** Subject grouped under the qualification it belongs to, for a board. */
interface SubjectRow {
  qualificationId: Id;
  level: string;
  subjects: { id: Id; name: string; detail: string }[];
}

/** The store actions the final step needs. `null` while the content bank is still installing. */
export type OnboardingActions = Pick<StoreValue, "regeneratePlan" | "updateSettings" | "upsertExamDate" | "userId" | "recordFunnel">;

/** Onboarding inside a ready store (AppShell's path). */
export function Onboarding({ onDone }: { onDone: () => void | Promise<void> }) {
  const actions = useStoreFields("regeneratePlan", "updateSettings", "upsertExamDate", "userId", "recordFunnel");
  return <OnboardingFlow actions={actions} onDone={onDone} />;
}

/**
 * The onboarding flow itself. It does not need the store until the final
 * step, so a fresh profile is shown it straight away while the content bank
 * installs in the background (StoreProvider renders it before the snapshot
 * is ready). If the student reaches "Start" before the bank is in, the click
 * is held and runs the moment the store is ready; nothing is saved early.
 */
export function OnboardingFlow({ actions, onDone }: { actions: OnboardingActions | null; onDone: () => void | Promise<void> }) {
  const [phase, setPhase] = useState(0);
  const [boardId, setBoardId] = useState<Id | null>(null);
  const [subjectIds, setSubjectIds] = useState<Id[]>([]);
  // Dates the student typed (or cleared, as ""). Anything not here shows the auto-filled sitting.
  const [examDates, setExamDates] = useState<Record<string, string>>({});
  const [region, setRegion] = useState<SchoolRegion | undefined>(undefined);
  const [boardInferred, setBoardInferred] = useState(false);
  const [pickingBoard, setPickingBoard] = useState(false);
  const [diagnosticChoice, setDiagnosticChoice] = useState<"quick" | "skip">("quick");
  const [yearGroup, setYearGroup] = useState<YearGroup | undefined>(undefined);
  const [unit4Option, setUnit4Option] = useState<Unit4Option | undefined>(undefined);
  const [showReference, setShowReference] = useState(false);
  const [saving, setSaving] = useState(false);
  // The student pressed the final button before the store was ready.
  const [finishQueued, setFinishQueued] = useState(false);
  const router = useRouter();

  const boards = useMemo(() => availableBoards(), []);
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
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
                : AUTHORED_REFERENCE_SUBJECTS.has(subject.id)
                  ? `${qualification.level} · Reference · not yet teacher-checked`
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

  // 28 of the registered subjects reuse a WJEC A-level outline without having
  // been checked against their own board's specification. They are offered, but
  // only behind an explicit "Unverified preview" choice — a student picking a
  // subject should never have to notice a disclaimer to find out it is a guess.
  const { flagshipRows, referenceRows, hiddenReferenceCount } = useMemo(() => {
    const isReference = (subject: { detail: string }) => subject.detail.includes("Reference");
    return {
      flagshipRows: subjectRows.map((row) => ({ ...row, subjects: row.subjects.filter((s) => !isReference(s)) })).filter((row) => row.subjects.length > 0),
      referenceRows: subjectRows.map((row) => ({ ...row, subjects: row.subjects.filter(isReference) })).filter((row) => row.subjects.length > 0),
      hiddenReferenceCount: subjectRows.reduce((sum, row) => sum + row.subjects.filter(isReference).length, 0),
    };
  }, [subjectRows]);

  /** The next sitting Revise can work out for each chosen subject (none for "Not sure" or GCSE). */
  const sittings = useMemo(() => {
    const out: Record<string, ExamSitting> = {};
    if (!boardId) return out;
    for (const row of subjectRows) {
      for (const subject of row.subjects) {
        if (!subjectIds.includes(subject.id)) continue;
        const sitting = examSittingFor({ boardId, subjectId: subject.id, level: row.level, yearGroup, today });
        if (sitting) out[subject.id] = sitting;
      }
    }
    return out;
  }, [boardId, subjectRows, subjectIds, yearGroup, today]);
  /** Auto-filled sittings the student has not typed over. */
  const autoFilled = useMemo(
    () => Object.fromEntries(Object.entries(sittings).filter(([id]) => !(id in examDates))),
    [sittings, examDates],
  );
  const shownDates: Record<string, string> = Object.fromEntries(
    chosenSubjects.map((s) => [s.id, s.id in examDates ? (examDates[s.id] ?? "") : (sittings[s.id]?.firstDate ?? "")]),
  );

  const missingDates = chosenSubjects.filter((s) => !shownDates[s.id]);
  const invalidDates = chosenSubjects.filter((s) => {
    const date = shownDates[s.id];
    return !isOptionalExamDateValid(date, today);
  });
  const enteredDatesValid = invalidDates.length === 0;
  const onFinalPhase = phase === PHASES.length - 1;
  const flagshipChosen = subjectIds.filter((id) => isFlagship(id));
  const referenceChosen = subjectIds.filter((id) => !isFlagship(id));
  const firstSubjectName = chosenSubjects[0] ? getSubject(chosenSubjects[0].id)?.name ?? chosenSubjects[0].name : "";
  const canContinue =
    phase === 0 ? boardId !== null : phase === 1 ? subjectIds.length > 0 : phase === 2 ? enteredDatesValid : true;

  function chooseBoard(id: Id | null, inferred = false) {
    setBoardInferred(inferred);
    if (id === boardId) return;
    // Changing board resets subject + date choices: they belonged to the
    // previous board's qualifications.
    setBoardId(id);
    setSubjectIds([]);
    setExamDates({});
  }

  function chooseRegion(next: SchoolRegion) {
    setRegion(next);
    setPickingBoard(false);
    const result = boardAfterRegionChange({ region: next, currentBoardId: boardId, currentWasInferred: boardInferred, availableBoardIds: boardIds });
    chooseBoard(result.boardId, result.inferred);
  }

  function requestFinish() {
    if (!boardId) return;
    setSaving(true);
    if (actions) void finish(actions);
    else setFinishQueued(true);
  }

  async function finish(store: OnboardingActions) {
    if (!boardId) return;
    setFinishQueued(false);
    setSaving(true);
    const availability: Availability[] = STEADY_MINUTES.map((minutes, weekday) => ({ weekday, minutes }));

    await store.updateSettings({
      displayName: "Student",
      subjectIds,
      availability,
      targetGrades: Object.fromEntries(subjectIds.map((id) => [id, gradesFor(id)[0] ?? "A*"])),
      // A skipped quick check stays skipped on Today; otherwise Today leads with it.
      ...(yearGroup ? { yearGroup } : {}),
      ...(yearGroup === "year-13" && unit4Option ? { unit4Option } : {}),
      quickCheckSkipped: diagnosticChoice === "skip" ? [...subjectIds] : [],
    });

    for (const subject of chosenSubjects) {
      const sitting = autoFilled[subject.id];
      if (sitting) {
        // Auto-filled and untouched: one row per unit paper when timetabled.
        const paperIds = getSubject(subject.id)?.papers.map((paper) => paper.id) ?? [];
        const rows = examRowsForSitting({ sitting, subject: { id: subject.id, name: subject.name, paperIds }, userId: store.userId, newId: () => crypto.randomUUID() });
        for (const row of rows) await store.upsertExamDate(row);
        continue;
      }
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

    // Build the plan now, so Today (or the check) has real work the moment they land.
    await store.regeneratePlan();
    if (diagnosticChoice === "quick" && subjectIds.length) {
      void store.recordFunnel("diagnostic_started", subjectIds[0]!);
    } else {
      void store.recordFunnel("diagnostic_skipped", subjectIds[0] ?? "none");
    }
    // Wait for the "onboarded" marker to land in IndexedDB before leaving.
    // Online, router.push is a client-side transition and a fire-and-forget
    // write finished anyway; offline, the RSC fetch for /diagnostic fails and
    // Next falls back to a full browser navigation, which dropped the
    // in-flight write, so the student landed back on step 1 of onboarding
    // (e2e/offline.spec.ts "offline banner appears when offline").
    try {
      await onDone();
    } catch {
      // Settings, exam dates and the plan are already saved; if only the
      // marker failed, onboarding reappears on the next load, as before.
    }
    // Honour the "Start my quick check" commit. The final step promises
    // "Revise will start with a quick check", so take them straight to it
    // (with autoStart) instead of dropping them on Today, where the check
    // is only one of several next actions and — before human review lands —
    // is not even the lead. A skipped check stays on Today, whose copy
    // already promises exactly that ("a first step waiting on Today").
    if (diagnosticChoice === "quick" && subjectIds.length) {
      router.push(`/diagnostic?subject=${encodeURIComponent(subjectIds[0]!)}`);
    }
  }

  useEffect(() => {
    if (!finishQueued || !actions) return;
    void finish(actions);
    // finish reads this render's choices; it runs once when the store arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishQueued, actions]);

  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4 app-enter motion-safe:app-enter">
        <header className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Welcome</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Revision that knows what to do next</h1>
          <p className="text-sm text-ink2">
            Tell us your year, where you study and your subjects — Revise works out your board and exam dates, then
            the plan, flashcards and questions follow.
          </p>
        </header>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2" aria-live="polite">
            Step {phase + 1} of {PHASES.length} · {PHASES[phase]}
          </p>
          {/* One segment per step, so the length of the setup is visible at a glance. */}
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${PHASES.length}, minmax(0, 1fr))` }}
            role="progressbar"
            aria-valuenow={phase + 1}
            aria-valuemin={1}
            aria-valuemax={PHASES.length}
            aria-label={`Step ${phase + 1} of ${PHASES.length}`}
          >
            {PHASES.map((name, step) => (
              <span key={name} className={cx("h-2 rounded-full transition-colors", step <= phase ? "bg-accent" : "bg-surface2")} />
            ))}
          </div>
        </div>

        {phase === 0 ? (
          <OnboardingSchoolStep
            yearGroup={yearGroup}
            onYearGroup={setYearGroup}
            unit4Option={unit4Option}
            onUnit4Option={setUnit4Option}
            region={region}
            onRegion={chooseRegion}
            boards={boards}
            boardId={boardId}
            onBoard={(id) => chooseBoard(id)}
            boardInferred={boardInferred}
            regionBoardMissing={regionBoardMissing(region, boardIds)}
            pickingBoard={pickingBoard}
            onChangeBoard={() => setPickingBoard(true)}
          />
        ) : null}

        {phase === 1 && board ? (
          <Panel className="space-y-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Which subjects do you take with {board.name}?</h2>
                  <p className="text-xs text-ink3 mt-0.5">
                    Choose every subject you&apos;re sitting. Flagship subjects are authored against the spec;
                    other subjects reuse that outline and are offered behind an unverified-preview choice.
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
            {flagshipRows.map((row) => (
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
            {hiddenReferenceCount > 0 ? (
              showReference ? (
                referenceRows.map((row) => (
                  <section key={`ref-${row.qualificationId}`} className="rounded-xl border border-line bg-surface2/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
                        Unverified preview &mdash; {board.name} {row.level}
                      </p>
                      <p className="text-[11px] text-ink3 tabular-nums">
                        {row.subjects.filter((subject) => subjectIds.includes(subject.id)).length} of {row.subjects.length}
                      </p>
                    </div>
                    <p className="mb-2 text-xs text-ink3">
                      {row.level === "GCSE"
                        ? "These use the WJEC A-level topic list, so their lessons and flashcards go well beyond GCSE. Only the practice questions were written for GCSE, and none has been checked against the specification."
                        : <>These reuse another board&apos;s topic list and have not been checked against {board.name}&apos;s
                      specification. Use them to navigate, not as a specification guarantee.</>}
                      {row.subjects.some((subject) => AUTHORED_REFERENCE_SUBJECTS.has(subject.id))
                        ? ` Except ${row.subjects.filter((subject) => AUTHORED_REFERENCE_SUBJECTS.has(subject.id)).map((subject) => subject.name).join(", ")}: their topic lists were written for this specification, but have not yet been checked by a teacher.`
                        : null}
                    </p>
                    <SubjectPicker
                      options={row.subjects}
                      selectedIds={subjectIds}
                      onChange={setSubjectIds}
                      selectionMode="multiple"
                      ariaLabel={`${row.level} unverified preview subjects`}
                    />
                  </section>
                ))
              ) : (
                <button
                  type="button"
                  className="w-full rounded-xl border border-dashed border-line bg-surface2/40 px-3 py-3 text-left text-sm text-ink2 hover:text-ink"
                  aria-expanded={false}
                  onClick={() => setShowReference(true)}
                >
                  <span className="font-semibold">Show {hiddenReferenceCount} more subjects — unverified preview</span>
                  <span className="mt-0.5 block text-xs text-ink3">
                    These reuse another board&apos;s topic list and have not been checked against {board.name}&apos;s
                    specification.
                  </span>
                </button>
              )
            ) : null}
            {!subjectIds.length ? <p className="text-xs text-ink3">Pick at least one subject to continue.</p> : null}
          </Panel>
        ) : null}

        {phase === 2 ? (
          <OnboardingExamDatesStep
            subjects={chosenSubjects}
            values={shownDates}
            autoFilled={autoFilled}
            today={today}
            onChange={(id, value) => setExamDates({ ...examDates, [id]: value })}
            missing={missingDates}
            invalidCount={invalidDates.length}
          />
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
                <li>
                  {flagshipChosen.length
                    ? "Mistakes turn into targeted repair, then an unseen proof check."
                    : "Mistakes turn into targeted repair, then a fresh practice question on the same skill."}
                </li>
              </ol>
            </div>
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
              onClick={requestFinish}
            >
              {finishQueued
                ? "Finishing setting up your subjects…"
                : saving
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
