"use client";

import { useMemo, useState } from "react";
import { allQualifications, allSubjects, allTopics, availableBoards, getBoard, gradesFor } from "@/domain/curriculum";
import { todayIso } from "@/domain/scheduling";
import type { Availability, ExamDate, Id } from "@/domain/types";
import { seedQuestionsForTopic } from "@/content";
import {
  DIAGNOSTIC_BUDGET,
  newDiagnosticSession,
  nextDiagnosticQuestion,
  type DiagnosticQuestionRef,
} from "@/domain/diagnostic-intake";
import { useStore } from "@/state/store";
import { Button, Field, Panel, Pill, ProgressBar, cx } from "./ui";
import { SubjectPicker } from "./SubjectPicker";
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
// top grade, both fine-tunable in Settings afterwards. Exam dates are useful
// but optional: a student can skip them and add them later in Settings.
// A short self-check follows so Today starts from measured known/weak/
// unknown evidence instead of a cohort prior — eight quick taps at most,
// skippable, and it never blocks finishing onboarding.
// ---------------------------------------------------------------------------

const PHASES = ["Board", "Subjects", "Exam dates", "Quick check"] as const;

/** Default time budget while the student has not yet tuned Settings. */
const STEADY_MINUTES = [90, 60, 60, 60, 60, 45, 120];

/** Subject grouped under the qualification it belongs to, for a board. */
interface SubjectRow {
  qualificationId: Id;
  level: string;
  subjects: { id: Id; name: string; detail: string }[];
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
          .map((subject) => ({ id: subject.id, name: subject.name, detail: qualification.level }))
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
  const invalidDates = chosenSubjects.filter((s) => {
    const date = examDates[s.id];
    return Boolean(date && date < today);
  });
  const enteredDatesValid = invalidDates.length === 0;
  const datesValid =
    chosenSubjects.length > 0 &&
    missingDates.length === 0 &&
    enteredDatesValid;
  const canSkipExamDates = chosenSubjects.length > 0 && enteredDatesValid;
  const onDatesPhase = phase === PHASES.length - 2;
  const onCheckPhase = phase === PHASES.length - 1;
  const canContinue = phase === 0 ? boardId !== null : phase === 1 ? subjectIds.length > 0 : onCheckPhase ? true : datesValid;

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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Which subjects do you take with {board.name}?</h2>
                  <p className="text-xs text-ink3 mt-0.5">
                    Choose every subject you&apos;re sitting. You can change this later, and each choice brings its
                    specification, lessons, flashcards and exam questions with it.
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

        {phase === 2 && onDatesPhase ? (
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
                  ? "No dates yet is fine — choose ‘Skip dates for now’ below, or add them later in Settings."
                  : `Still to add: ${missingDates.map((s) => s.name).join(", ")}. You can also skip now and add them later in Settings.`}
              </p>
            ) : null}
            {invalidDates.length ? (
              <p className="text-xs text-danger" role="status">
                Choose today or a future date, or clear the date and skip for now.
              </p>
            ) : null}
          </Panel>
        ) : null}

        {onCheckPhase ? (
          <QuickCheck subjectIds={subjectIds} />
        ) : null}

        <div className={cx("flex gap-2", (onDatesPhase || onCheckPhase) && "flex-col sm:flex-row")}>
          {phase > 0 ? (
            <Button className="min-h-[3rem]" onClick={() => setPhase(phase - 1)}>
              Back
            </Button>
          ) : null}
          {!onDatesPhase && !onCheckPhase ? (
            <Button
              variant="primary"
              className="flex-1 min-h-[3rem]"
              disabled={!canContinue}
              onClick={() => setPhase(phase + 1)}
            >
              Continue
            </Button>
          ) : null}
          {onDatesPhase ? (
            <>
              <Button
                variant="primary"
                className="flex-1 min-h-[3rem]"
                disabled={!canContinue}
                onClick={() => setPhase(phase + 1)}
              >
                Continue
              </Button>
              <Button
                variant="secondary"
                className="min-h-[3rem] flex-1"
                disabled={saving || !canSkipExamDates}
                onClick={() => setPhase(phase + 1)}
              >
                Skip dates for now
              </Button>
            </>
          ) : null}
          {onCheckPhase ? (
            <>
              <Button
                variant="secondary"
                className="min-h-[3rem] flex-1"
                disabled={saving}
                onClick={() => void finish()}
              >
                Skip the check
              </Button>
              <Button
                variant="primary"
                className="min-h-[3rem] flex-1"
                disabled={saving}
                onClick={() => void finish()}
              >
                {saving ? "Building your plan…" : "Build my plan"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick check — the lightweight initial diagnostic. Up to eight self-marked
// probes (two per topic) across the student's subjects: recall first, then
// application when recall passes. Known / weak / unknown lands in the store
// as review evidence before Today first renders, so the tutor starts from
// measurement instead of a cohort prior. Fully skippable — finishing
// onboarding never depends on it.
// ---------------------------------------------------------------------------

function QuickCheck({ subjectIds }: { subjectIds: Id[] }) {
  const store = useStore();
  const [started, setStarted] = useState(false);
  const topics = useMemo(() => {
    const pool = allTopics(subjectIds.length ? subjectIds : undefined);
    return pool.slice(0, Math.max(4, Math.min(8, pool.length)));
  }, [subjectIds]);
  const [state, setState] = useState(() => newDiagnosticSession(topics.map((t) => t.id)));
  const [answers, setAnswers] = useState<Record<string, "known" | "weak" | "unknown">>({});

  const pools = useMemo<Record<string, DiagnosticQuestionRef[]>>(() => {
    const out: Record<string, DiagnosticQuestionRef[]> = {};
    for (const topic of topics) {
      const bank = seedQuestionsForTopic(topic.id);
      const recall = bank[0];
      const application = bank[1] ?? bank[0];
      const refs: DiagnosticQuestionRef[] = [];
      if (recall) refs.push({ id: recall.id, topicId: topic.id, capability: "recall", difficulty: 2 });
      if (application) refs.push({ id: application.id, topicId: topic.id, capability: "application", difficulty: 3 });
      out[topic.id] = refs;
    }
    return out;
  }, [topics]);

  const current = nextDiagnosticQuestion(state, pools);
  const currentTopic = topics.find((t) => t.id === current?.topicId);
  const doneCount = state.askedTotal;

  async function answerSelfMark(mark: "known" | "weak" | "unknown") {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: mark }));
    // Honest self-marks become review evidence on a real seeded card:
    // known = recalled, weak = struggled, unknown = no evidence (kept
    // unknown, never weak). The card is the topic's first seeded card, so
    // FSRS grades land on the deck the student will actually study.
    if (mark !== "unknown") {
      const seed = store.cards.find((c) => c.topicId === current.topicId);
      if (seed) {
        await store.reviewCard(seed, mark === "known" ? "good" : "again", 0);
      }
    }
    // Advance the intake without fabricating capability scores: the review
    // evidence above is the measurement; the intake tracks budget.
    const remaining = state.remaining.filter((t) => t !== current.topicId || mark === "known");
    const asked = { ...state.asked, [current.topicId]: (state.asked[current.topicId] ?? 0) + 1 };
    const askedTotal = state.askedTotal + 1;
    setState({
      ...state,
      remaining: mark === "unknown" ? state.remaining.filter((t) => t !== current.topicId) : remaining,
      asked,
      askedTotal,
      done: remaining.length === 0 || askedTotal >= DIAGNOSTIC_BUDGET,
    });
  }

  if (!topics.length) {
    return (
      <Panel className="space-y-2">
        <h2 className="text-sm font-semibold">Quick check</h2>
        <p className="text-xs text-ink3">Choose a subject first — the check draws from its topics.</p>
      </Panel>
    );
  }

  if (!started) {
    return (
      <Panel className="space-y-3">
        <h2 className="text-sm font-semibold">Quick check <span className="text-ink3 font-normal">(optional, ~2 min)</span></h2>
        <p className="text-xs text-ink3">
          Eight quick self-marks across your topics — known, weak, or unknown. Today then starts from
          measurement instead of guessing. Unknown stays unknown; it is never treated as weak.
        </p>
        <Button variant="primary" className="w-full min-h-[3rem]" onClick={() => setStarted(true)}>
          Start the quick check
        </Button>
      </Panel>
    );
  }

  if (!current || state.done) {
    const known = Object.values(answers).filter((a) => a === "known").length;
    const weak = Object.values(answers).filter((a) => a === "weak").length;
    const unknown = Object.values(answers).filter((a) => a === "unknown").length;
    return (
      <Panel className="space-y-2" aria-live="polite">
        <h2 className="text-sm font-semibold">Check complete</h2>
        <p className="text-xs text-ink2">
          {known} known · {weak} weak · {unknown} unknown{unknown ? " (kept unknown, never weak)" : ""}. Today will build from this.
        </p>
        <p className="text-[11px] text-ink3">Continue to finish onboarding — your plan builds from this evidence.</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Quick check</h2>
        <p className="text-[11px] text-ink3 tabular-nums" aria-live="polite">
          {doneCount + 1} of {Math.min(DIAGNOSTIC_BUDGET, topics.length * 2)}
        </p>
      </div>
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
        {currentTopic?.title ?? current.topicId} · {current.capability === "recall" ? "Recall" : "Application"}
      </p>
      <p className="text-sm text-ink">
        {current.capability === "recall"
          ? `Without notes: what do you remember about ${currentTopic?.title ?? "this topic"}?`
          : `Could you answer an exam question on ${currentTopic?.title ?? "this topic"} right now?`}
      </p>
      {currentTopic?.keyPoints[0] ? (
        <p className="text-[11px] text-ink3">Mark honestly — this sets where Today starts, not a grade.</p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" className="min-h-[3rem]" onClick={() => void answerSelfMark("known")}>
          Known
        </Button>
        <Button variant="secondary" className="min-h-[3rem]" onClick={() => void answerSelfMark("weak")}>
          Weak
        </Button>
        <Button variant="secondary" className="min-h-[3rem]" onClick={() => void answerSelfMark("unknown")}>
          Unknown
        </Button>
      </div>
    </Panel>
  );
}
