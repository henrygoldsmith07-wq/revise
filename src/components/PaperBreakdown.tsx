import Link from "next/link";
import { formatExamTime } from "@/domain/exam-conditions";
import type { PaperRunBreakdown } from "@/domain/paper-run-breakdown";
import { Panel, Pill, SectionHeading, cx } from "./ui";

// The marked result of one timed paper: per-question marks and time against
// the paper's pace, the topics that lost the most marks, and pacing findings.
// Presentational only; the numbers come from buildPaperRunBreakdown.

export function PaperBreakdown({
  breakdown,
  subjectId,
  formatName,
  gradeNote,
}: {
  breakdown: PaperRunBreakdown;
  subjectId: string;
  formatName: string;
  /** Shown under the topic table for unit mocks, which give no grade. */
  gradeNote?: string;
}) {
  return (
    <>
      <Panel className="space-y-3">
        <SectionHeading title="Pacing" hint={`${formatName} · about ${Math.round(breakdown.minutesPerMark * 10) / 10} min per mark`} />
        <ul className="space-y-1.5 text-sm text-ink2" aria-label="Pacing findings">
          {breakdown.findings.map((finding) => (
            <li key={finding} className="flex gap-2"><span className="text-accent" aria-hidden="true">•</span><span>{finding}</span></li>
          ))}
        </ul>
      </Panel>

      {breakdown.topics.length ? (
        <Panel className="space-y-3">
          <SectionHeading title="Marks by topic" hint="Where this paper's marks were won and lost" />
          <ul className="divide-y divide-line" aria-label="Marks by topic">
            {breakdown.topics.map((topic) => (
              <li key={topic.topicId} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-ink2 min-w-0 truncate">{topic.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {topic.lost > 0 ? <span className="text-xs text-ink3 tabular-nums">−{topic.lost}</span> : null}
                  <span className={cx("font-semibold tabular-nums", topic.lost === 0 ? "text-success" : "text-ink")}>
                    {topic.awarded}/{topic.max}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {breakdown.focusTopics.length ? (
            <div className="card card-2 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Repair next</p>
              <ul className="flex flex-wrap gap-2">
                {breakdown.focusTopics.map((topic) => (
                  <li key={topic.topicId}>
                    <Link
                      className="text-sm font-medium text-accent underline"
                      href={`/practice?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topic.topicId)}`}
                    >
                      Practise {topic.title} ({topic.lost} lost)
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {gradeNote ? <p className="text-xs text-ink3">{gradeNote}</p> : null}
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading title="Question breakdown" hint="Feedback for each answer is in your review history" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Question breakdown">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink3">
                <th scope="col" className="py-2 pr-2 font-semibold">Q</th>
                <th scope="col" className="py-2 pr-2 font-semibold">Topic</th>
                <th scope="col" className="py-2 pr-2 font-semibold text-right">Time / budget</th>
                <th scope="col" className="py-2 font-semibold text-right">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {breakdown.rows.map((row) => (
                <tr key={row.questionId}>
                  <td className="py-2 pr-2 text-ink2 tabular-nums">{row.number}</td>
                  <td className="py-2 pr-2 text-ink2">
                    <span className="block max-w-[16rem] truncate">{row.topicLabel}</span>
                    {row.blank ? <Pill tone="danger" className="mt-1">Blank</Pill> : null}
                    {row.provisional ? <Pill tone="review" className="mt-1 ml-1">Provisional</Pill> : null}
                  </td>
                  <td className={cx("py-2 pr-2 text-right tabular-nums", row.overBudget ? "text-review font-semibold" : "text-ink3")}>
                    {formatExamTime(row.elapsedMs / 1000)} / {formatExamTime(row.budgetMs / 1000)}
                    {row.overBudget ? <span className="sr-only"> (over budget)</span> : null}
                  </td>
                  <td className={cx("py-2 text-right font-semibold tabular-nums", row.awarded === row.max ? "text-success" : "text-ink")}>
                    {row.awarded}/{row.max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
