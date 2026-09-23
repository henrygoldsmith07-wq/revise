"use client";

import Link from "next/link";
import { useMemo } from "react";
import { knowledgeVsAnswering, timedSessionRecommendation } from "@/domain/exam-technique";
import { useStore } from "@/state/store";
import { Button, Panel, Pill, SectionHeading } from "./ui";

/**
 * Where a subject's lost marks come from: missing knowledge or failing to
 * answer. Shown on the Library subject index, next to topic status, because
 * the two leaks need different medicine — learning the content vs timed exam
 * questions marked against the scheme. Nothing is rendered until a subject
 * has at least one marked loss, so the index never invents a signal.
 */
export function TechniqueSignal({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const report = useMemo(
    () =>
      knowledgeVsAnswering({
        subjectId,
        mistakes: store.mistakes,
        questions: store.questions,
        attempts: store.attempts,
      }),
    [store.attempts, store.mistakes, store.questions, subjectId],
  );
  // An answering leak gets a time-boxed prescription: a concrete timed run
  // the app can start right now, not an open-ended "practise technique".
  const timedRun = useMemo(() => timedSessionRecommendation(report), [report]);

  if (report.verdict === "none") return null;

  const knowledgePct = Math.round(report.knowledgeShare * 100);
  const answeringPct = Math.round(report.answeringShare * 100);

  return (
    <section aria-label="Knowledge vs answering">
      <SectionHeading
        title="Knowledge vs answering"
        hint="Where your lost marks come from — learn the content, or practise the answering."
      />
      <Panel>
        <p className="text-sm text-ink2 leading-relaxed">{report.narrative}</p>

        <div className="mt-3">
          <div
            role="img"
            aria-label={`Knowledge ${knowledgePct}% of lost marks, answering ${answeringPct}%`}
            className="flex h-2 overflow-hidden rounded-full bg-surface2"
          >
            {knowledgePct > 0 ? (
              <span className="h-full bg-accent" style={{ width: `${knowledgePct}%` }} />
            ) : null}
            {answeringPct > 0 ? (
              <span className="h-full bg-ink3" style={{ width: `${answeringPct}%` }} />
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink2">
            <span>
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
              Knowledge {knowledgePct}%
            </span>
            <span>
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink3 align-middle" />
              Answering {answeringPct}%
            </span>
          </div>
        </div>

        {timedRun ? (
          <div className="mt-3 rounded border border-line bg-surface2 p-3">
            <p className="text-sm text-ink font-medium">Start with {timedRun.headline}</p>
            <p className="text-[11px] text-ink2 mt-1">{timedRun.rationale}</p>
            <div className="mt-2">
              <Link href={`/practice?quick=${timedRun.minutes}&subject=${encodeURIComponent(subjectId)}`}>
                <Button size="sm">Start the {timedRun.minutes}-minute timed run →</Button>
              </Link>
            </div>
          </div>
        ) : null}

        {report.drivers.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.drivers.map((driver) => (
              <Pill key={driver.klass}>
                {driver.klass} · {driver.marksLost} mark{driver.marksLost === 1 ? "" : "s"}
              </Pill>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-ink3">
          {report.mistakes} loss{report.mistakes === 1 ? "" : "es"} on this subject
          {report.reliable ? "" : report.verdict === "too-early" ? " — too few yet to call a direction" : ""}
          {report.classifiedFromAnswers
            ? ` · ${report.classifiedFromAnswers} read from your actual answers`
            : ""}
          {report.mappedFromLegacy
            ? ` · ${report.mappedFromLegacy} from capture-time tags (older rows)`
            : ""}
        </p>
      </Panel>
    </section>
  );
}
