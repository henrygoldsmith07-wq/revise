"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getSubject, getTopic, topicsFor, unitsFor } from "@/domain/curriculum";
import { buildPaperReadiness } from "@/domain/paper-readiness";
import { buildTopicLifecycles } from "@/domain/proof-lifecycle";
import { buildTodayBrief } from "@/domain/today-brief";
import { useStoreFields } from "@/state/store";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-session";
import type { ProofLedger } from "@/domain/proof-of-improvement";
import { explainSession } from "@/domain/session-explanation";
import { ButtonLink, Pill } from "./ui";
import { ForwardIcon, TodayIcon } from "./icons";

/** Today's lead action, with the session steps shown when space permits. */
export function AdaptiveSessionHero({
  session,
  displayName,
  greeting,
  proof,
}: {
  session: AdaptiveSessionPlan;
  displayName: string;
  greeting: string;
  /** Overall proof state, shown as one line when there is something true to say. */
  proof?: ProofLedger;
}) {
  const subject = getSubject(session.subjectId);
  const store = useStoreFields("attempts", "mistakes", "questions", "examDates");
  const brief = useMemo(() => {
    const papers = subject
      ? buildPaperReadiness({ subject, topics: topicsFor(subject.id), units: unitsFor(subject.id), questions: store.questions, attempts: store.attempts, mistakes: store.mistakes, examDates: store.examDates })
      : [];
    const topic = getTopic(session.topicId);
    const lifecycle = topic
      ? buildTopicLifecycles({ topics: [topic], ledger: proof, attempts: store.attempts, questions: store.questions })[0]
      : undefined;
    return buildTodayBrief({ plan: session, papers, examDates: store.examDates, mistakes: store.mistakes, lifecycle });
  }, [subject, session, proof, store.questions, store.attempts, store.mistakes, store.examDates]);
  const explanation = useMemo(() => explainSession(session, proof?.conversion), [session, proof?.conversion]);
  // Today stays calm: mention proof only when something is shown or a test is due, not while it is merely waiting.
  const proofHeadline = proof && (proof.proven || proof.declined || proof.illusory || proof.due) ? proof.headline : null;

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

        <p className="mt-1 text-sm text-ink2">
          {[brief.paperName, brief.examLabel].filter(Boolean).join(" · ") || "No exam date set"}
          {brief.marksAtRisk ? ` · ${brief.marksAtRisk} marks at risk here` : ""}
        </p>
        {brief.provisional ? <p className="mt-1 text-sm text-ink2" role="note">{brief.provisional}</p> : <p className="mt-1 text-sm text-ink2">{explanation.stakes}</p>}
        {brief.lifecycle ? (
          <p className="mt-1 text-sm text-ink2">
            <span className="font-medium text-ink">{brief.lifecycle.label}.</span> {brief.lifecycle.line}
          </p>
        ) : null}
        {brief.produces.length ? (
          <p className="mt-1 text-sm text-ink2">
            In this session: {brief.produces.join(", ")}.{brief.doesNotProve ? ` ${brief.doesNotProve}` : ""}
          </p>
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
        <details className="mt-3 max-w-2xl">
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Why this session?</summary>
          <ul className="mt-2 space-y-1.5" aria-label="Evidence behind this session">
            {/* A mapped skill action carries its own reason (which gap, why now); otherwise the evidence lines cover it. */}
            {session.learningPolicy && session.reason ? (
              <li className="flex gap-2 text-sm leading-6 text-ink2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0 font-medium text-ink">{session.reason}</span>
              </li>
            ) : null}
            {session.intervention ? (
              <li className="flex gap-2 text-sm leading-6 text-ink2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0 font-medium text-ink">Best fit: {session.intervention.headline}.</span>
              </li>
            ) : null}
            {session.intervention?.gap ? (
              <li className="flex gap-2 text-sm leading-6 text-ink2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-review" aria-hidden="true" />
                <span className="min-w-0">{session.intervention.gap.text} <span className="font-medium text-ink">{session.intervention.gap.label} — {session.intervention.gap.minutes} min.</span></span>
              </li>
            ) : null}
            {session.intervention?.lines.map((line) => (
              <li key={`i-${line}`} className="flex gap-2 text-sm leading-6 text-ink2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink3" aria-hidden="true" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
            {explanation.lines.map((line) => (
              <li key={line.text} className="flex gap-2 text-sm leading-6 text-ink2">
                <span
                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${line.tone === "gap" ? "bg-review" : line.tone === "proof" ? "bg-speak" : "bg-ink3"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">{line.text}</span>
              </li>
            ))}
          </ul>
        </details>
        {proofHeadline ? (
          <p className="mt-3 max-w-2xl text-sm text-ink2" role="note">
            {proofHeadline}{" "}
            <Link href="/readiness#proof" className="font-medium text-ink underline underline-offset-2">See the proof</Link>
          </p>
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
