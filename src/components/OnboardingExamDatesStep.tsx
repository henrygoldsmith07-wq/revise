"use client";

import type { Id } from "@/domain/types";
import type { ExamSitting } from "@/domain/exam-series";
import { Field, Panel } from "./ui";

// ---------------------------------------------------------------------------
// Onboarding step 3: exam dates. Dates Revise could work out from the year
// group and board arrive filled in, each with a line saying where it came
// from ("From the WJEC summer 2027 timetable…" or "Estimated…"). Every date
// stays an ordinary, editable input; clearing one leaves it blank.
// ---------------------------------------------------------------------------

export interface ExamDatesStepSubject {
  id: Id;
  name: string;
}

export interface OnboardingExamDatesStepProps {
  subjects: readonly ExamDatesStepSubject[];
  /** The date each input shows: the student's own entry, else the auto-filled one, else "". */
  values: Readonly<Record<Id, string>>;
  /** Auto-filled sittings the student has not overridden, keyed by subject. */
  autoFilled: Readonly<Record<Id, ExamSitting>>;
  today: string;
  onChange: (subjectId: Id, value: string) => void;
  missing: readonly ExamDatesStepSubject[];
  invalidCount: number;
}

export function OnboardingExamDatesStep({ subjects, values, autoFilled, today, onChange, missing, invalidCount }: OnboardingExamDatesStepProps) {
  const filled = Object.values(autoFilled);
  const timetabled = filled.filter((s) => s.status === "timetabled").length;
  const estimated = filled.length - timetabled;
  return (
    <Panel className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">When are the exams? <span className="text-ink3 font-normal">(optional)</span></h2>
        <p className="text-xs text-ink3 mt-0.5">
          The plan paces revision towards these dates. Change any that are wrong, or leave a date blank and add it
          later in Settings.
        </p>
      </div>
      {filled.length ? (
        <p className="text-xs text-ink2" role="status" aria-live="polite">
          {timetabled ? `Filled in ${timetabled === 1 ? "1 date" : `${timetabled} dates`} from the official timetable` : ""}
          {timetabled && estimated ? " and " : ""}
          {estimated ? `${timetabled ? "" : "Filled in "}${estimated === 1 ? "1 estimated date" : `${estimated} estimated dates`}` : ""}
          {" "}for your year. Check them against your school&apos;s exam timetable.
        </p>
      ) : null}
      {subjects.map((subject) => {
        const sitting = autoFilled[subject.id];
        const noteId = `exam-note-${subject.id}`;
        return (
          <Field key={subject.id} label={`${subject.name} exam date`} labelled>
            <input
              type="date"
              min={today}
              value={values[subject.id] ?? ""}
              onChange={(e) => onChange(subject.id, e.target.value)}
              className="field min-h-[44px]"
              aria-label={`${subject.name} exam date`}
              aria-describedby={sitting ? noteId : undefined}
            />
            {sitting ? (
              <p id={noteId} className="mt-1 text-[11px] text-ink3" data-sitting-status={sitting.status}>
                {sitting.status === "timetabled" ? (
                  <>
                    {sitting.note}{" "}
                    <a className="underline" href={sitting.sourceUrl} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  </>
                ) : (
                  sitting.note
                )}
              </p>
            ) : null}
          </Field>
        );
      })}
      {missing.length ? (
        <p className="text-xs text-ink3" role="status">
          {missing.length === subjects.length
            ? "No dates yet is fine — build your plan now and add them later in Settings."
            : `Still to add: ${missing.map((s) => s.name).join(", ")}. You can build now and add them later in Settings.`}
        </p>
      ) : null}
      {invalidCount ? (
        <p className="text-xs text-danger" role="status">
          Choose today or a future date, or clear the invalid date before building your plan.
        </p>
      ) : null}
    </Panel>
  );
}
