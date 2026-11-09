"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { allQualifications, allSubjects, availableBoards, getBoard, getSubject, gradesFor } from "@/domain/curriculum";
import { isFlagship } from "@/domain/flagship";
import { followsOwnSpecification } from "@/domain/curriculum/honesty";
import { todayIso } from "@/domain/scheduling";
import { isOptionalExamDateValid } from "@/domain/onboarding";
import type { Availability, ExamDate, Id } from "@/domain/types";
import { useStoreFields } from "@/state/store-context";
import type { StoreValue } from "@/state/store";
import { Button, Panel, Pill, cx } from "./ui";
import { isUnit4Option, isYearGroup, type Unit4Option, type YearGroup } from "@/domain/year-group";
import { examRowsForSitting, examSittingFor, type ExamSitting } from "@/domain/exam-series";
import { boardAfterRegionChange, isSchoolRegion, regionBoardMissing, type SchoolRegion } from "@/domain/school-region";
import { deleteReviseUserMeta, readReviseUserMeta, writeReviseUserMeta } from "@/data/storage-namespace";
import { syncWireIdValue } from "@/data/sync-contract";
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
const PHASE_KEYS = ["you", "subjects", "exam_dates", "quick_check", "first_step"] as const;

/** Default time budget while the student has not yet tuned Settings. */
const STEADY_MINUTES = [90, 60, 60, 60, 60, 45, 120];

/** Subject grouped under the qualification it belongs to, for a board. */
interface SubjectRow {
  qualificationId: Id;
  level: string;
  subjects: { id: Id; name: string; detail: string }[];
}

interface OnboardingDraft {
  version: 1;
  phase: number;
  boardId: Id | null;
  subjectIds: Id[];
  examDates: Record<string, string>;
  region: SchoolRegion | null;
  boardInferred: boolean;
  pickingBoard: boolean;
  diagnosticChoice: "quick" | "skip";
  yearGroup: YearGroup | null;
  unit4Option: Unit4Option | null;
  showReference: boolean;
}

function parseOnboardingDraft(value: unknown, boardIds: readonly Id[]): OnboardingDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<OnboardingDraft>;
  if (raw.version !== 1 || !Number.isInteger(raw.phase) || raw.phase! < 0 || raw.phase! >= PHASES.length) return null;
  if (raw.boardId !== null && (typeof raw.boardId !== "string" || !boardIds.includes(raw.boardId))) return null;
  if (!Array.isArray(raw.subjectIds) || !raw.subjectIds.every((id) => typeof id === "string")) return null;
  if (!raw.examDates || typeof raw.examDates !== "object" || Array.isArray(raw.examDates)) return null;
  if (!Object.values(raw.examDates).every((date) => typeof date === "string")) return null;
  if (raw.region !== null && !isSchoolRegion(raw.region)) return null;
  if (typeof raw.boardInferred !== "boolean" || typeof raw.pickingBoard !== "boolean" || typeof raw.showReference !== "boolean") return null;
  if (raw.diagnosticChoice !== "quick" && raw.diagnosticChoice !== "skip") return null;
  if (raw.yearGroup !== null && !isYearGroup(raw.yearGroup)) return null;
  if (raw.unit4Option !== null && !isUnit4Option(raw.unit4Option)) return null;

  const validSubjects = new Set(
    raw.boardId
      ? allQualifications(raw.boardId).flatMap((qualification) => allSubjects(qualification.id).map((subject) => subject.id))
      : [],
  );
  const subjectIds = [...new Set(raw.subjectIds.filter((id): id is Id => validSubjects.has(id)))];
  let phase = raw.phase!;
  if (phase > 0 && !raw.boardId) phase = 0;
  if (phase > 1 && !subjectIds.length) phase = 1;
  const examDates = Object.fromEntries(
    Object.entries(raw.examDates)
      .filter(([id, date]) => subjectIds.includes(id) && (date === "" || /^\d{4}-\d{2}-\d{2}$/.test(date)))
      .map(([id, date]) => [id, date]),
  );
  return {
    version: 1,
    phase,
    boardId: raw.boardId ?? null,
    subjectIds,
    examDates,
    region: raw.region ?? null,
    boardInferred: raw.boardInferred,
    pickingBoard: raw.pickingBoard,
    diagnosticChoice: raw.diagnosticChoice,
    yearGroup: raw.yearGroup ?? null,
    unit4Option: raw.unit4Option ?? null,
    showReference: raw.showReference,
  };
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
  const [draftReady, setDraftReady] = useState(false);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const finishing = useRef(false);
  // The student pressed the final button before the store was ready.
  const [finishQueued, setFinishQueued] = useState(false);
  const router = useRouter();
  const draftTouched = useRef(false);
  const draftTouchedUserId = useRef<string | null>(null);
  const draftOwnerRef = useRef<string | null>(null);
  const draftFinished = useRef(false);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const reachedPhases = useRef(new Set<number>());
  const completedPhases = useRef(new Set<number>());
  const recordedReachedPhases = useRef(new Set<number>());
  const recordedCompletedPhases = useRef(new Set<number>());
  reachedPhases.current.add(phase);

  const boards = useMemo(() => availableBoards(), []);
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const today = todayIso();

  function resetDraftForNewUser() {
    setPhase(0);
    setBoardId(null);
    setSubjectIds([]);
    setExamDates({});
    setRegion(undefined);
    setBoardInferred(false);
    setPickingBoard(false);
    setDiagnosticChoice("quick");
    setYearGroup(undefined);
    setUnit4Option(undefined);
    setShowReference(false);
    setRestoredDraft(false);
  }

  useEffect(() => {
    const userId = actions?.userId;
    if (!userId) return;
    const previousOwner = draftOwnerRef.current;
    draftOwnerRef.current = userId;
    let cancelled = false;
    draftFinished.current = false;
    void readReviseUserMeta<unknown>("onboardingDraft", userId)
      .then((saved) => {
        if (cancelled) return;
        const touchedForUser = draftTouched.current && (
          draftTouchedUserId.current === userId ||
          (previousOwner === null && draftTouchedUserId.current === null)
        );
        const draft = touchedForUser ? null : parseOnboardingDraft(saved, boardIds);
        if (previousOwner !== null && previousOwner !== userId) setRestoredDraft(false);
        if (draft) {
          setPhase(draft.phase);
          setBoardId(draft.boardId);
          setSubjectIds(draft.subjectIds);
          setExamDates(draft.examDates);
          setRegion(draft.region ?? undefined);
          setBoardInferred(draft.boardInferred);
          setPickingBoard(draft.pickingBoard);
          setDiagnosticChoice(draft.diagnosticChoice);
          setYearGroup(draft.yearGroup ?? undefined);
          setUnit4Option(draft.unit4Option ?? undefined);
          setShowReference(draft.showReference);
          setRestoredDraft(true);
        } else if (previousOwner !== null && previousOwner !== userId && !touchedForUser) {
          resetDraftForNewUser();
        }
        draftTouched.current = touchedForUser;
        draftTouchedUserId.current = touchedForUser ? userId : null;
        setDraftOwner(userId);
        setDraftReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          const touchedForUser = draftTouched.current && (
            draftTouchedUserId.current === userId ||
            (previousOwner === null && draftTouchedUserId.current === null)
          );
          if (previousOwner !== null && previousOwner !== userId && !touchedForUser) resetDraftForNewUser();
          draftTouched.current = touchedForUser;
          draftTouchedUserId.current = touchedForUser ? userId : null;
          setDraftOwner(userId);
          setDraftReady(true);
        }
      });
    return () => { cancelled = true; };
  }, [actions?.userId, boardIds]);

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
                : followsOwnSpecification(subject.id)
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
    phase === 0 ? boardId !== null : phase === 1 ? subjectIds.length > 0 : enteredDatesValid && boardId !== null && subjectIds.length > 0;

  useEffect(() => {
    const userId = actions?.userId;
    if (!userId || !draftReady || draftOwner !== userId || draftFinished.current) return;
    const draft: OnboardingDraft = {
      version: 1,
      phase,
      boardId,
      subjectIds,
      examDates,
      region: region ?? null,
      boardInferred,
      pickingBoard,
      diagnosticChoice,
      yearGroup: yearGroup ?? null,
      unit4Option: unit4Option ?? null,
      showReference,
    };
    const write = () => writeReviseUserMeta("onboardingDraft", userId, draft);
    draftWrites.current = draftWrites.current.catch(() => undefined).then(write);
    void draftWrites.current.catch(() => undefined);
  }, [actions?.userId, boardId, boardInferred, diagnosticChoice, draftOwner, draftReady, examDates, phase, pickingBoard, region, showReference, subjectIds, unit4Option, yearGroup]);

  useEffect(() => {
    if (!actions) return;
    for (const step of reachedPhases.current) {
      if (recordedReachedPhases.current.has(step)) continue;
      recordedReachedPhases.current.add(step);
      void actions.recordFunnel("onboarding_step_reached", PHASE_KEYS[step]).catch(() => undefined);
    }
    for (const step of completedPhases.current) {
      if (recordedCompletedPhases.current.has(step)) continue;
      recordedCompletedPhases.current.add(step);
      void actions.recordFunnel("onboarding_step_completed", PHASE_KEYS[step]).catch(() => undefined);
    }
  }, [actions, phase, saving, finishQueued]);

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
    if (!canContinue || saving || finishing.current) return;
    setSaveError(null);
    setSaving(true);
    if (actions) void finish(actions);
    else setFinishQueued(true);
  }

  async function finish(store: OnboardingActions) {
    if (finishing.current) return;
    setFinishQueued(false);
    // A restored draft or an idle tab can outlive the dates it collected.
    if (!boardId || !subjectIds.length || chosenSubjects.some((subject) => !isOptionalExamDateValid(shownDates[subject.id], todayIso()))) {
      setSaving(false);
      setSaveError("Review your subjects and exam dates before finishing. Clear any date you do not know yet.");
      return;
    }
    finishing.current = true;
    setSaving(true);
    setSaveError(null);
    try {
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
          for (const row of rows) await saveExamDate(row);
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
        await saveExamDate(exam);
      }

      // Build the plan now, so Today (or the check) has real work the moment they land.
      await store.regeneratePlan();
      // Wait for the "onboarded" marker to land in IndexedDB before leaving.
      // Online, router.push is a client-side transition and a fire-and-forget
      // write finished anyway; offline, the RSC fetch for /diagnostic fails and
      // Next falls back to a full browser navigation, which dropped the
      // in-flight write, so the student landed back on step 1 of onboarding
      // (e2e/offline.spec.ts "offline banner appears when offline").
      await onDone();
      void store.recordFunnel("onboarding_step_completed", PHASE_KEYS[phase]).catch(() => undefined);
      draftFinished.current = true;
      await draftWrites.current.catch(() => undefined);
      await deleteReviseUserMeta("onboardingDraft", store.userId).catch(() => undefined);
      if (diagnosticChoice === "skip") {
        void store.recordFunnel("diagnostic_skipped", subjectIds[0] ?? "none").catch(() => undefined);
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
    } catch {
      setSaveError("Your setup could not finish saving on this device. Your choices are still here. Try again; if it keeps happening, check that this browser allows site storage.");
    } finally {
      finishing.current = false;
      setSaving(false);
    }

    async function saveExamDate(exam: ExamDate) {
      // A failed finish can have saved some rows already. Reuse their IDs
      // across retries and reloads rather than adding duplicate countdowns.
      const id = syncWireIdValue(store.userId, JSON.stringify(["onboarding-exam-v1", exam.subjectId, exam.paperSpecId ?? null, exam.date, exam.label]));
      await store.upsertExamDate({ ...exam, id });
    }
  }

  useEffect(() => {
    if (!finishQueued || !actions) return;
    void finish(actions);
    // finish reads this render's choices; it runs once when the store arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishQueued, actions]);

  return (
    <div
      className="min-h-dvh bg-bg flex items-center justify-center p-4"
      onClickCapture={() => {
        draftTouched.current = true;
        draftTouchedUserId.current = actions?.userId ?? null;
      }}
      onChangeCapture={() => {
        draftTouched.current = true;
        draftTouchedUserId.current = actions?.userId ?? null;
      }}
    >
      <div className="w-full max-w-xl space-y-4 app-enter motion-safe:app-enter">
        <header className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Welcome</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Revision that knows what to do next</h1>
          <p className="text-sm text-ink2">
            Tell us your year, where you study and your subjects — Revise works out your board and exam dates, then
            the plan, flashcards and questions follow.
          </p>
          {restoredDraft ? <p className="text-xs text-success" role="status">Your saved setup is back. You can change any answer before continuing.</p> : null}
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
                        : row.subjects.every((subject) => followsOwnSpecification(subject.id))
                          ? <>Their topic lists follow {board.name}&apos;s specification, but their notes and questions have not yet been checked by a teacher.</>
                          : <>These reuse another board&apos;s topic list and have not been checked against {board.name}&apos;s
                      specification. Use them to navigate, not as a specification guarantee.</>}
                      {row.level !== "GCSE" && !row.subjects.every((subject) => followsOwnSpecification(subject.id)) && row.subjects.some((subject) => followsOwnSpecification(subject.id))
                        ? ` Except ${row.subjects.filter((subject) => followsOwnSpecification(subject.id)).map((subject) => subject.name).join(", ")}: their topic lists follow this specification, but have not yet been checked by a teacher.`
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
              A 5–10 minute quick check can help you choose where to start. Reviewed questions count
              as evidence; if there are not enough, Revise may offer authored questions labelled
              “practice, not proof”. It is not a grade and never tests everything.
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
                    <span className="block text-xs text-ink3 mt-0.5">Recommended. About 5–10 minutes, then a suggested next step.</span>
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
                  ? "Flagship subjects have authored question banks. If reviewed questions are not available, the check is labelled practice, not proof."
                  : `Flagship: ${flagshipChosen.map((id) => getSubject(id)?.name ?? id).join(", ")} use reviewed questions where available; any unreviewed practice is labelled.`}
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
                  ? `Revise will start with a quick check in ${firstSubjectName}. Reviewed answers can count as evidence; any unreviewed practice is labelled and cannot prove your skill.`
                  : "Revise will start with a quick check. Reviewed answers can count as evidence; any unreviewed practice is labelled and cannot prove your skill."
                : "Revise already has a first step waiting on Today — and you can run the quick check any time to sharpen it."}
            </p>
            <div className="rounded-xl border border-line bg-surface2/60 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What happens next</p>
              <ol className="mt-1.5 space-y-1 text-xs text-ink2 list-decimal pl-4">
                <li>{diagnosticChoice === "quick" ? "Answer a few short questions with no hints; unreviewed practice is labelled." : "Open Today and start the recommended step."}</li>
                <li>See what Revise found, what counts as evidence, and why it suggested the next step.</li>
                <li>Mistakes can lead to targeted repair. Proof needs a later, unseen, reviewed question.</li>
              </ol>
            </div>
          </Panel>
        ) : null}

        {saveError ? <p className="text-sm text-danger" role="alert">{saveError}</p> : null}
        {onFinalPhase && !enteredDatesValid ? <p className="text-sm text-danger" role="alert">An exam date is invalid or has passed. Go back to Exam dates and update it, or clear it to add later.</p> : null}
        <div className={cx("flex gap-2", onFinalPhase && "flex-col sm:flex-row")}>
          {phase > 0 ? (
            <Button className="min-h-[3rem]" disabled={saving} onClick={() => { setSaveError(null); setPhase(phase - 1); }}>
              Back
            </Button>
          ) : null}
          {!onFinalPhase ? (
            <Button
              variant="primary"
              className="flex-1 min-h-[3rem]"
              disabled={!canContinue}
              onClick={() => {
                completedPhases.current.add(phase);
                setPhase(phase + 1);
              }}
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
