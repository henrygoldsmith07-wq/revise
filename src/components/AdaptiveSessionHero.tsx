"use client";

import { getSubject } from "@/domain/curriculum";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-session";
import { ButtonLink, Pill } from "./ui";
import { ForwardIcon, TodayIcon } from "./icons";

/** Today's lead action, with the session steps shown when space permits. */
export function AdaptiveSessionHero({
  session,
  displayName,
  greeting,
}: {
  session: AdaptiveSessionPlan;
  displayName: string;
  greeting: string;
}) {
  const subject = getSubject(session.subjectId);

  return (
    <section aria-label="Suggested study session" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,21rem)] lg:gap-8">
      <div className="min-w-0">
        {greeting ? <p className="mb-0.5 text-sm text-ink3">{greeting}, {displayName}</p> : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="today-focus-icon" aria-hidden="true"><TodayIcon size={18} /></span>
          <p className="text-sm font-semibold text-speak">A good next step</p>
          <span className="ml-auto rounded-full bg-speaksoft px-3 py-1 text-sm font-semibold text-speak">About {Math.ceil(session.totalMinutes)} min</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Your next session is ready
        </h2>
        <p className="mt-2 text-base font-medium text-ink sm:text-lg">{subject?.name ?? session.subjectId} · {session.topicTitle}</p>

        {session.evidence.factors.uncertainty >= 0.65 ? (
          <p className="mt-2 text-sm text-ink2">Evidence is still limited. This session will help find the right level.</p>
        ) : null}

        {session.stoppedEarly ? (
          <p className="mt-2 text-sm text-ink2" role="note">{session.stoppedEarly.reason}</p>
        ) : null}

        <ButtonLink href={session.startHref} variant="primary" size="md" className="mt-5 min-h-[3rem] w-full text-base sm:w-auto">
          Start session <ForwardIcon size={17} aria-hidden />
        </ButtonLink>

        <details className="today-sequence mt-4 lg:hidden">
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2">What you&apos;ll do</summary>
          <ol className="mt-3 space-y-2" aria-label="Adaptive learning sequence">
            {session.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm text-ink2">
                <span className="w-8 shrink-0 text-right tabular-nums text-ink3">{step.minutes}m</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1">{step.label}</span>
                {step.questionIds.length || step.cardIds.length ? (
                  <Pill>{step.questionIds.length || step.cardIds.length}</Pill>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
        {session.reason ? (
          <details className="mt-3 max-w-2xl">
            <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Why this session?</summary>
            <p className="mt-2 text-sm leading-6 text-ink2">{session.reason}</p>
          </details>
        ) : null}
      </div>

      <div className="today-session-steps hidden lg:block" aria-label="Session outline">
        <h3 className="text-sm font-semibold text-ink">What you&apos;ll do</h3>
        <ol className="mt-4 space-y-3">
          {session.steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-speak" aria-hidden="true">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-5 text-ink">{step.label}</span>
              <span className="shrink-0 pt-0.5 text-xs tabular-nums text-ink2">{step.minutes} min</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
