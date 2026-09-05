"use client";

import { getSubject } from "@/domain/curriculum";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-session";
import { ButtonLink, Pill } from "./ui";

/**
 * The only decision Today asks the student to make. The detailed sequence is
 * available on demand, but the default view is deliberately just a subject,
 * topic, and one Start button.
 */
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
    <section aria-label="Best use of the next 20 minutes" className="pt-2">
      {greeting ? <p className="text-[11px] text-ink3 mb-0.5">{greeting}, {displayName}</p> : null}

      <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink mt-1">
        Best use of the next {session.totalMinutes} minutes
      </p>

      <p className="text-lg text-ink mt-2 font-medium">
        {subject?.name ?? session.subjectId} — {session.topicTitle}
      </p>

      <ButtonLink href={session.startHref} variant="primary" size="md" className="mt-4 w-full sm:w-auto min-h-[3rem] text-base">
        Start
      </ButtonLink>

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs text-ink3">See the sequence</summary>
        <ol className="mt-2 space-y-1.5" aria-label="Adaptive learning sequence">
          {session.steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2 text-xs text-ink2">
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
    </section>
  );
}

