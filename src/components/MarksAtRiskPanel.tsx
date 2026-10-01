"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildMarksAtRisk, buildRecoverySession } from "@/domain/marks-at-risk";
import { useStoreFields } from "@/state/store";
import { BreakdownList } from "./BreakdownList";
import { ButtonLink, Panel, Pill, SectionHeading, StatTile } from "./ui";

function useMarksAtRisk(subjectId?: string) {
  const store = useStoreFields("attempts", "mistakes", "papers", "questions", "settings");
  return useMemo(() => {
    const scope = { subjectIds: store.settings.subjectIds, ...(subjectId ? { subjectId } : {}) };
    return {
      report: buildMarksAtRisk({ mistakes: store.mistakes, attempts: store.attempts, questions: store.questions, papers: store.papers, ...scope }),
      session: buildRecoverySession({ mistakes: store.mistakes, attempts: store.attempts, questions: store.questions, ...scope }),
    };
  }, [store.attempts, store.mistakes, store.papers, store.questions, store.settings.subjectIds, subjectId]);
}

function recoverHref(subjectId?: string): string {
  return subjectId ? `/practice?recover=1&subject=${encodeURIComponent(subjectId)}` : "/practice?recover=1";
}

/** Compact entry point: how many marks are open and one button to go after them. */
export function RecoverMarksCard({ subjectId }: { subjectId?: string }) {
  const { report, session } = useMarksAtRisk(subjectId);
  if (!report.totalMarks) return null;
  return (
    <section aria-label="Marks at risk" className="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Marks at risk</p>
        <p className="text-sm font-semibold text-ink mt-0.5">{report.headline}</p>
        {session.questionIds.length ? <p className="text-xs text-ink3 mt-1">{session.headline}</p> : null}
      </div>
      {session.questionIds.length ? (
        <ButtonLink href={recoverHref(subjectId)} variant="primary" size="sm" className="shrink-0">Recover these marks</ButtonLink>
      ) : null}
    </section>
  );
}

export function MarksAtRiskPanel({ subjectId }: { subjectId?: string }) {
  const { report, session } = useMarksAtRisk(subjectId);

  return (
    <section aria-labelledby="marks-at-risk-heading" className="space-y-4">
      <SectionHeading
        title="Marks at risk"
        hint="Marks you have already lost that no delayed retest has closed. An observed estimate, not a grade forecast."
      />
      <Panel className="space-y-5">
        <h2 id="marks-at-risk-heading" className="sr-only">Marks at risk</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Marks at risk" value={report.totalMarks} sub={`${report.openMistakes} open mistake${report.openMistakes === 1 ? "" : "s"}`} tone={report.totalMarks ? "danger" : "success"} />
          <StatTile label="Topics affected" value={report.topics.length} />
          <StatTile
            label="Evidence"
            value={report.evidence === "none" ? "None" : report.evidence === "thin" ? "Thin" : "Solid"}
            sub={`${report.attemptsConsidered} marked answer${report.attemptsConsidered === 1 ? "" : "s"}`}
            tone={report.evidence === "adequate" ? "success" : "review"}
          />
        </div>
        <p className="text-sm text-ink2" role="status">{report.headline}</p>

        {report.totalMarks ? (
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <BreakdownList
                title="By topic"
                rows={report.topics.map((topic) => ({
                  key: topic.key,
                  label: topic.label,
                  marks: topic.marks,
                  share: topic.share,
                  detail:
                    topic.lossRate !== null
                      ? `Losing ${Math.round(topic.lossRate * 100)}% of marks attempted here recently (${topic.marksAttempted} marks)`
                      : undefined,
                }))}
              />
              {report.topics[0] ? (
                <Link href={`/practice?topic=${encodeURIComponent(report.topics[0].topicId)}`} className="inline-block mt-2 text-xs text-ink2 underline underline-offset-2 hover:text-ink">
                  Practise {report.topics[0].label} →
                </Link>
              ) : null}
            </div>
            <BreakdownList title="By skill" rows={report.skills} />
            <BreakdownList title="By error type" rows={report.errorTypes} />
            <BreakdownList title="By question type" rows={report.questionTypes} />
            <BreakdownList title="By paper" rows={report.papers} />
            {report.recurring.length ? (
              <div>
                <h3 className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Recurring mistakes</h3>
                <ul className="space-y-2">
                  {report.recurring.slice(0, 4).map((row) => (
                    <li key={row.key} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-ink2">{row.label}</span>
                      <Pill tone="danger" className="shrink-0">{row.count}× · {row.marks} marks{row.paperCount >= 2 ? ` · across ${row.paperCount} papers` : ""}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {session.questionIds.length ? (
          <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Next best action</p>
              <p className="text-sm font-semibold text-ink mt-0.5">Recover these marks</p>
              <p className="text-xs text-ink2 mt-0.5">
                {session.headline} {session.resitIds.length} re-sit{session.resitIds.length === 1 ? "" : "s"}, {session.freshIds.length} new question{session.freshIds.length === 1 ? "" : "s"}.
              </p>
            </div>
            <ButtonLink href={recoverHref(subjectId)} variant="primary" className="shrink-0">Recover these marks</ButtonLink>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
