"use client";

import { useMemo, useState } from "react";
import { allSubjects, subjectLabel } from "@/domain/curriculum";
import { todayIso } from "@/domain/scheduling";
import type { Availability, ExamDate } from "@/domain/types";
import { useStore } from "@/state/store";
import { Button, Field, Panel, ProgressBar, cx } from "./ui";
import { CreditedIcon } from "./icons";
import { useFocusTrap } from "./useFocusTrap";

// ---------------------------------------------------------------------------
// First run.
//
// Four questions, each of which materially changes what the app does next:
// which subjects (scopes everything), when the exams are (drives urgency),
// how much time there is (sizes the plan), and what grade they are chasing
// (frames the analytics). Anything that could be inferred or defaulted is not
// asked — there is no email step, no avatar, no tour.
//
// It ends by building the plan, so the student lands on a Today screen with
// something real on it rather than an empty state telling them to come back.
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_PRESETS: { label: string; hint: string; minutes: number[] }[] = [
  { label: "Light", hint: "About 4 hours a week", minutes: [60, 30, 30, 30, 30, 30, 60] },
  { label: "Steady", hint: "About 8 hours a week", minutes: [90, 60, 60, 60, 60, 45, 120] },
  { label: "Hard", hint: "About 14 hours a week", minutes: [180, 90, 90, 90, 90, 60, 180] },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [exams, setExams] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState(1);
  const [target, setTarget] = useState("A");
  const [saving, setSaving] = useState(false);

  const subjects = useMemo(() => allSubjects(), []);
  const today = todayIso();
  const steps = ["You", "Subjects", "Exams", "Time"];
  const dialogRef = useFocusTrap(true, onDone);

  async function finish() {
    setSaving(true);
    const availability: Availability[] = TIME_PRESETS[preset].minutes.map((minutes, weekday) => ({
      weekday,
      minutes,
    }));

    await store.updateSettings({
      displayName: name.trim() || "Student",
      subjectIds,
      availability,
      targetGrades: Object.fromEntries(subjectIds.map((id) => [id, target])),
    });

    for (const [subjectId, date] of Object.entries(exams)) {
      if (!date) continue;
      const exam: ExamDate = {
        id: crypto.randomUUID(),
        userId: store.userId,
        subjectId,
        date,
        label: `${subjects.find((s) => s.id === subjectId)?.name} exam`,
      };
      await store.upsertExamDate(exam);
    }

    // Build the plan now, so Today has real work on it the moment they land.
    await store.regeneratePlan();
    onDone();
  }

  const canContinue = step === 1 ? subjectIds.length > 0 : true;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-bg overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
      tabIndex={-1}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4 app-enter motion-safe:app-enter">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2" aria-live="polite">
              Step {step + 1} of {steps.length} · {steps[step]}
            </p>
            <ProgressBar value={(step + 1) / steps.length} label={`Step ${step + 1} of ${steps.length}`} />
          </div>

          {step === 0 ? (
            <Panel className="space-y-3">
              <h1 id="onboarding-step-title" className="text-xl font-semibold tracking-tight">Revision that knows what to do next</h1>
              <p className="text-sm text-ink2">
                Open the app, get one recommended task, do it, get marked. No deciding what to revise, no blank
                page. Four quick questions and it is set up.
              </p>
              <Field label="What should we call you?" hint="Optional.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Student"
                  className="field"
                  autoFocus
                  autoComplete="nickname"
                  aria-label="What should we call you?"
                />
              </Field>
            </Panel>
          ) : null}

          {step === 1 ? (
            <Panel className="space-y-3">
              <div>
                <h2 id="onboarding-step-title" className="text-sm font-semibold">Which subjects are you taking?</h2>
                <p className="text-xs text-ink3 mt-0.5">
                  Each comes with its specification, flashcards and exam questions already written.
                </p>
              </div>
              <ul className="space-y-2">
                {subjects.map((subject) => {
                  const on = subjectIds.includes(subject.id);
                  return (
                    <li key={subject.id}>
                      <button
                        onClick={() =>
                          setSubjectIds(
                            on ? subjectIds.filter((id) => id !== subject.id) : [...subjectIds, subject.id],
                          )
                        }
                        type="button"
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
                        <span className="min-w-0">
                          <span className="block text-sm text-ink">{subject.name}</span>
                          <span className="block text-[11px] text-ink3 truncate">{subjectLabel(subject.id)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!subjectIds.length ? <p className="text-xs text-ink3">Pick at least one to continue.</p> : null}
            </Panel>
          ) : null}

          {step === 2 ? (
            <Panel className="space-y-3">
              <div>
                <h2 id="onboarding-step-title" className="text-sm font-semibold">When are the exams?</h2>
                <p className="text-xs text-ink3 mt-0.5">
                  This is what makes the plan urgent in the right places. Skip any you do not know yet.
                </p>
              </div>
              {subjectIds.map((id) => (
                <Field key={id} label={subjects.find((s) => s.id === id)?.name ?? id}>
                  <input
                    type="date"
                    min={today}
                    value={exams[id] ?? ""}
                    onChange={(e) => setExams({ ...exams, [id]: e.target.value })}
                    className="field"
                    aria-label={`${subjects.find((s) => s.id === id)?.name ?? id} exam date`}
                  />
                </Field>
              ))}
              <Field label="Grade you are aiming for">
                <div className="flex gap-1.5">
                  {["A*", "A", "B", "C"].map((grade) => (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setTarget(grade)}
                      aria-pressed={target === grade}
                      aria-label={`Target grade ${grade}`}
                      className={cx(
                        "flex-1 py-2.5 rounded-[8px] border text-sm font-semibold transition-colors",
                        target === grade ? "bg-accent text-onaccent border-transparent" : "border-line text-ink2",
                      )}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </Field>
            </Panel>
          ) : null}

          {step === 3 ? (
            <Panel className="space-y-3">
              <div>
                <h2 id="onboarding-step-title" className="text-sm font-semibold">How much time do you have?</h2>
                <p className="text-xs text-ink3 mt-0.5">
                  The planner never schedules more than this. You can fine-tune each day later.
                </p>
              </div>
              <ul className="space-y-2">
                {TIME_PRESETS.map((option, i) => (
                  <li key={option.label}>
                    <button
                      onClick={() => setPreset(i)}
                      type="button"
                      className={cx(
                        "w-full text-left card px-4 py-3 min-h-[3.25rem] transition-colors",
                        preset === i ? "border-ink3 bg-surface2" : "hover:border-ink3",
                      )}
                    >
                      <span className="block text-sm text-ink">{option.label}</span>
                      <span className="block text-[11px] text-ink3">{option.hint}</span>
                      <span className="flex gap-1 mt-2">
                        {option.minutes.map((minutes, weekday) => (
                          <span key={weekday} className="flex-1 text-center">
                            <span className="block text-[9px] text-ink3">{WEEKDAYS[weekday]}</span>
                            <span
                              className="block mt-0.5 rounded-[2px] bg-accent mx-auto w-full"
                              style={{ height: `${Math.max(3, (minutes / 180) * 22)}px` }}
                            />
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <div className="flex gap-2">
            {step > 0 ? (
              <Button className="min-h-[3rem]" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : null}
            {step < steps.length - 1 ? (
              <Button
                variant="primary"
                className="flex-1 min-h-[3rem]"
                disabled={!canContinue}
                onClick={() => setStep(step + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button variant="primary" className="flex-1 min-h-[3rem]" disabled={saving} onClick={() => void finish()}>
                {saving ? "Building your plan…" : "Build my plan"}
              </Button>
            )}
          </div>

          <button type="button" onClick={onDone} className="w-full text-center text-xs text-ink3 hover:text-ink py-2" aria-label="Skip onboarding">
            Skip — I will set this up later
          </button>
        </div>
      </div>
    </div>
  );
}
