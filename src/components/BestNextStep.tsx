"use client";

// The one dominant action on Today, from the Next Best Action engine: what to
// do, how long, why, what it is worth, what happens after, and one Start button.
// Everything that explains the ranking sits behind a disclosure.

import { getSubject } from "@/domain/curriculum";
import { LEARNER_STATE_LABEL } from "@/domain/learner-state";
import type { RevisionAction, RevisionPlan } from "@/domain/revision-engine";
import { ButtonLink, Pill } from "./ui";
import { ForwardIcon, TodayIcon } from "./icons";

const TONE = { "not-checked": "neutral", "needs-work": "danger", improving: "accent", "awaiting-proof": "review", proven: "success", regressed: "danger" } as const;

function stakes(a: RevisionAction): string | null {
  if (a.marksRecoverable && a.marksRecoverable > 0) return `${a.marksRecoverable} mark${a.marksRecoverable === 1 ? "" : "s"} at stake`;
  return null;
}

function examLine(a: RevisionAction): string {
  if (a.daysToExam === null) return "No exam date set";
  return a.daysToExam === 0 ? "Exam today" : `Exam in ${a.daysToExam} day${a.daysToExam === 1 ? "" : "s"}`;
}

export function BestNextStep({ action, plan }: { action: RevisionAction; plan: RevisionPlan }) {
  const subject = getSubject(action.subjectId)?.name ?? action.subjectId;
  const queued = plan.actions.slice(1, 4);
  const waiting = plan.deferred.filter((d) => /Waiting for the delay/.test(d.reason)).slice(0, 2);
  const e = action.explanation;
  return (
    <section aria-label="Best next step" className="grid gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="today-focus-icon" aria-hidden="true"><TodayIcon size={18} /></span>
          <p className="text-sm font-semibold text-speak">Your best next step</p>
          {action.proofStatus ? <Pill tone={TONE[action.proofStatus]}>{LEARNER_STATE_LABEL[action.proofStatus]}</Pill> : null}
          <span className="ml-auto rounded-full bg-speaksoft px-3 py-1 text-sm font-semibold text-speak">About {Math.ceil(action.minutes)} min</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{action.title}</h2>
        <p className="mt-2 text-base font-medium text-ink sm:text-lg">{subject}</p>
        <p className="mt-1 text-sm text-ink2">{[examLine(action), stakes(action)].filter(Boolean).join(" · ")}</p>
        <p className="mt-2 max-w-2xl text-sm text-ink2">{e.why}</p>
        <p className="mt-1 max-w-2xl text-sm text-ink2"><span className="font-medium text-ink">Then:</span> {e.after}</p>
        <ButtonLink href={action.route.href} variant="primary" size="md" className="mt-5 min-h-[3rem] w-full text-base sm:w-auto">
          {action.route.label} <ForwardIcon size={17} aria-hidden />
        </ButtonLink>
        <details className="mt-4 max-w-2xl">
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Why this, and why now?</summary>
          <dl className="mt-2 space-y-2 text-sm leading-6 text-ink2" aria-label="Why this recommendation">
            <div><dt className="font-semibold text-ink">Why now</dt><dd>{e.whyNow}</dd></div>
            <div><dt className="font-semibold text-ink">Why before the others</dt><dd>{e.whyBefore}</dd></div>
            <div><dt className="font-semibold text-ink">What it is based on</dt><dd><ul className="list-disc pl-5">{e.evidence.map((line) => <li key={line}>{line}</li>)}</ul></dd></div>
            <div><dt className="font-semibold text-ink">What will prove it worked</dt><dd>{e.proves}</dd></div>
            {action.effectiveness && action.effectiveness.level !== "neutral" ? (
              <div><dt className="font-semibold text-ink">What has worked for you</dt><dd>{action.effectiveness.uncertainty === "high" ? "Early signs only, from a small number of completed checks." : "Based on your own completed, delayed checks."}</dd></div>
            ) : null}
          </dl>
        </details>
        {queued.length || waiting.length ? (
          <details className="mt-3 max-w-2xl">
            <summary className="cursor-pointer select-none text-sm font-medium text-ink2">What comes after</summary>
            <ul className="mt-2 space-y-1 text-sm text-ink2">
              {queued.map((q) => <li key={q.id}>{q.title} · {Math.ceil(q.minutes)} min</li>)}
              {waiting.map((w) => <li key={w.action.id}>{w.action.title}: {w.reason.replace(/^Waiting for the delay to pass: /, "")}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
