"use client";

import Link from "next/link";
import { useMemo } from "react";
import { topicsFor } from "@/domain/curriculum";
import { pastPaperCoverage, type PastPaperCoverageRow } from "@/domain/past-paper-coverage";
import { pastPaperIndexFor } from "@/content/past-papers";
import { Panel, Pill, SectionHeading } from "@/components/ui";

// How often each topic has really come up in the board's own papers, question
// by question, with a link to every paper. Display-only: it never feeds
// mastery, proof or the plan.

function RefList({ row }: { row: PastPaperCoverageRow }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {row.refs.map((ref) => (
        <li key={`${ref.paperId}:${ref.number}`}>
          <a className="pill hover:underline" href={ref.href} target="_blank" rel="noopener noreferrer">
            {ref.label} · {ref.marks} marks
          </a>
        </li>
      ))}
    </ul>
  );
}

function summary(row: PastPaperCoverageRow, years: number): string {
  return `${row.years} of ${years} years · ${row.questions} ${row.questions === 1 ? "question" : "questions"} · ${row.marks} marks · last ${row.lastYear}`;
}

export function PastPaperCoveragePanel({ subjectId }: { subjectId: string }) {
  const index = pastPaperIndexFor(subjectId);
  const coverage = useMemo(() => (index ? pastPaperCoverage(index, topicsFor(subjectId)) : null), [index, subjectId]);
  if (!index || !coverage) return null;
  const first = coverage.years[0];
  const last = coverage.years[coverage.years.length - 1];

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Past-paper coverage"
        hint={`${coverage.questions} questions from ${coverage.papers} ${index.board} papers, ${first}–${last}, mapped to topics. Topic mapping is not yet teacher-reviewed.`}
      />
      <ul className="space-y-2">
        {coverage.topics.map((row) => (
          <li key={row.key}>
            <details>
              <summary className="cursor-pointer text-sm">
                <span className="font-medium text-ink">{row.title}</span>{" "}
                <span className="text-xs text-ink3">— {summary(row, coverage.years.length)}</span>
                {row.optionOnly ? <Pill className="ml-1.5">Option</Pill> : null}
              </summary>
              <RefList row={row} />
              <Link className="text-xs text-accent hover:underline" href={`/practice?subject=${subjectId}&topic=${row.key}`}>
                Practise this topic
              </Link>
            </details>
          </li>
        ))}
      </ul>
      {coverage.gaps.length ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Examined, but Revise has no topic for it yet</h3>
          <ul className="space-y-2">
            {coverage.gaps.map((row) => (
              <li key={row.key}>
                <details>
                  <summary className="cursor-pointer text-sm">
                    <Pill tone="danger">Gap</Pill> <span className="text-ink">{row.title}</span>{" "}
                    <span className="text-xs text-ink3">— {summary(row, coverage.years.length)}</span>
                  </summary>
                  <RefList row={row} />
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {coverage.unexamined.length ? (
        <p className="text-xs text-ink3">
          Not assessed in these papers: {coverage.unexamined.map((topic) => topic.title).join(", ")}.
        </p>
      ) : null}
    </Panel>
  );
}
