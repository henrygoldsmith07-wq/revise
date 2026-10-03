"use client";

// Pre-exam command centre. It does not decide what to do next: it reads the
// same ranked plan as Today and answers "I have N minutes" with a different
// strategy per time box. Shown only inside the countdown window.

import { useMemo, useState } from "react";
import { getSubject } from "@/domain/curriculum";
import { COMMAND_CENTRE_DAYS, TIME_BOXES, timeBoxPlan, type TimeBox } from "@/domain/pre-exam-plan";
import { bestForTime } from "@/domain/revision-engine";
import { Button, ButtonLink, Pill } from "./ui";
import { useRevisionPlan } from "./recovery-evidence";

const label = (m: TimeBox) => (m === 60 ? "1 hour" : `${m} min`);

export function CommandCentreCard() {
  const { plan, evidence } = useRevisionPlan();
  const [box, setBox] = useState<TimeBox>(20);
  const days = evidence.daysToExam;
  const view = useMemo(() => {
    const has = (type: string) => plan.actions.some((a) => a.type === type);
    const strategy = timeBoxPlan(box, {
      daysToExam: days, hasRecurringError: has("recurring-error"), delayedProofDue: has("proof-check"), hasOpenLoss: evidence.recovery.totals.open > 0,
      paperAvailable: has("exam-section") || has("full-paper"), untouchedHighValue: has("learn-untouched"), dueCards: has("due-reviews") ? 1 : 0,
    });
    return bestForTime(plan, box, strategy);
  }, [plan, box, days, evidence.recovery.totals.open]);
  if (days === null || days > COMMAND_CENTRE_DAYS || days < 0) return null;
  const { action, strategy } = view;
  const subject = action ? getSubject(action.subjectId)?.name : undefined;
  return (
    <section aria-label="Pre-exam command centre" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{days} day{days === 1 ? "" : "s"} to your exam</p>
        <Pill tone={strategy.phase === "final" ? "danger" : "accent"}>{strategy.phase}</Pill>
      </div>
      <p className="text-sm text-ink2">How much time do you have? Each choice is a different plan, not a shorter version of the same one.</p>
      <div role="group" aria-label="Time available" className="grid grid-cols-5 gap-2">
        {TIME_BOXES.map((m) => <Button key={m} size="md" variant={m === box ? "primary" : "secondary"} aria-pressed={m === box} onClick={() => setBox(m)}>{label(m)}</Button>)}
      </div>
      <div className="rounded-[8px] border border-line px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-ink">{strategy.label}</p>
        <ol className="text-sm text-ink2 space-y-0.5">{strategy.steps.map((s) => <li key={s.label}>{s.minutes} min: {s.label}</li>)}</ol>
        <p className="text-xs text-ink3">{strategy.reason}</p>
        {action ? (
          <>
            <p className="text-xs text-ink3">Best match from your plan: {action.title}{subject ? ` (${subject})` : ""}.</p>
            <ButtonLink href={action.route.href} variant="primary" className="w-full sm:w-auto">Start {label(box)} plan</ButtonLink>
          </>
        ) : <p className="text-xs text-ink3">Nothing in your plan fits this time box yet.</p>}
      </div>
    </section>
  );
}
