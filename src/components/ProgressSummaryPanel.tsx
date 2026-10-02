"use client";

import Link from "next/link";
import { useMemo } from "react";
import { allTopics } from "@/domain/curriculum";
import { STAGE_LABEL, STAGE_MEANING, type MasteryStage } from "@/domain/mastery-stage";
import { buildProgressSummary } from "@/domain/progress-summary";
import { useStoreFields } from "@/state/store";
import { ButtonLink, Panel, Pill } from "./ui";

const TONE: Record<MasteryStage, "neutral" | "review" | "success" | "accent" | "danger"> = {
  untouched: "neutral", learning: "review", practised: "accent", secure: "success", proven: "success", fading: "danger",
};

/** Four plain questions first; the detailed analytics stay below, one tap away. */
export function ProgressSummaryPanel() {
  const store = useStoreFields("attempts", "mistakes", "questions", "settings", "proofLedger", "adaptiveSession", "mastery");
  const summary = useMemo(() => {
    const subjectIds = store.settings.subjectIds;
    return buildProgressSummary({
      subjectIds,
      topics: allTopics(subjectIds),
      attempts: store.attempts,
      questions: store.questions,
      mistakes: store.mistakes,
      ledger: store.proofLedger,
      reviewedTopicIds: new Set(store.mastery.filter((row) => row.attempts > 0).map((row) => row.topicId)),
      nextHeadline: store.adaptiveSession?.intervention?.headline ?? (store.adaptiveSession ? `${store.adaptiveSession.topicTitle} session` : null),
    });
  }, [store.attempts, store.mistakes, store.questions, store.settings.subjectIds, store.proofLedger, store.adaptiveSession, store.mastery]);

  const counts = (Object.keys(STAGE_LABEL) as MasteryStage[]).filter((stage) => summary.stageCounts[stage] > 0);
  return (
    <section aria-labelledby="progress-summary-heading" className="space-y-3">
      <h2 id="progress-summary-heading" className="sr-only">Your progress at a glance</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What am I strong at?</p>
          {summary.strong.length ? (
            <ul className="space-y-1.5 text-sm">
              {summary.strong.map((row) => (
                <li key={row.topicId} className="flex flex-wrap items-center gap-2"><span className="text-ink">{row.title}</span><Pill tone={TONE[row.stage]} title={STAGE_MEANING[row.stage]}>{row.label}</Pill></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink2">{summary.coldStart ? "Not enough evidence yet to say. A few unaided questions will show where you stand." : "Nothing is secure yet. Different questions answered without hints build this."}</p>
          )}
          {summary.coldStart ? <Link className="text-sm font-medium text-accent underline" href="/diagnostic">Take the starting diagnostic</Link> : null}
        </Panel>

        <Panel className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Where am I losing marks?</p>
          {summary.losing.totalMarks > 0 || summary.losing.patterns.length ? (
            <>
              {summary.losing.totalMarks > 0 ? <p className="text-sm text-ink">{summary.losing.totalMarks} marks lost and not yet recovered{summary.losing.topics.length ? `, mostly in ${summary.losing.topics.map((row) => row.title).join(", ")}` : ""}.</p> : null}
              {summary.losing.patterns.map((row) => <p key={row.cause} className="text-xs text-ink2">{row.headline}</p>)}
            </>
          ) : (
            <p className="text-sm text-ink2">No open lost marks recorded.</p>
          )}
        </Panel>

        <Panel className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What has been proven?</p>
          {summary.proven.topics.length ? (
            <>
              <p className="text-sm text-ink">{summary.proven.topics.length} topic{summary.proven.topics.length === 1 ? "" : "s"} improved on new questions after a delay: {summary.proven.topics.map((row) => row.title).join(", ")}.</p>
              {summary.proven.declined ? <p className="text-xs text-ink2">{summary.proven.declined} declined and need another look.</p> : null}
            </>
          ) : (
            <p className="text-sm text-ink2">No improvement is proven yet. It counts only when you do better on new questions after a delay.{summary.proven.awaiting ? ` ${summary.proven.awaiting} topic${summary.proven.awaiting === 1 ? " is" : "s are"} due a check.` : ""}</p>
          )}
        </Panel>

        <Panel className="space-y-2 border-accent">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">What should I work on next?</p>
          <p className="text-sm text-ink">{summary.next ?? "Nothing is suggested yet."}</p>
          <ButtonLink href="/" size="sm" variant="primary">Go to Today</ButtonLink>
        </Panel>
      </div>
      {counts.length ? (
        <p className="text-xs text-ink3">
          Topics by evidence: {counts.map((stage) => `${summary.stageCounts[stage]} ${STAGE_LABEL[stage].toLowerCase()}`).join(" · ")}.
        </p>
      ) : null}
    </section>
  );
}
