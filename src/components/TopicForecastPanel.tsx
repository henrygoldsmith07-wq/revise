"use client";

import { useMemo } from "react";
import { topicsFor } from "@/domain/curriculum";
import { FORECAST_MAX_TOPICS, forecastNextPaper } from "@/domain/topic-forecast";
import { useStoreFields } from "@/state/store";
import { Panel, Pill, SectionHeading } from "@/components/ui";

// "What will the next paper most likely test?" — a topic-level forecast
// derived from the papers the student actually holds plus the spec mix.
// Display-only; the generator panel consumes the same forecast when the
// student asks for a predicted-paper drill.

const RISK_TONE = { secure: "success", watch: undefined, "at-risk": "danger" } as const;

export function TopicForecastPanel({ subjectId }: { subjectId: string }) {
  const store = useStoreFields("attempts", "mastery", "mistakes", "papers", "questions");

  const forecast = useMemo(
    () =>
      forecastNextPaper({
        subjectId,
        papers: store.papers,
        questions: store.questions,
        topics: topicsFor(subjectId),
        mastery: store.mastery,
        attempts: store.attempts,
        mistakes: store.mistakes,
        now: new Date(),
      }),
    [subjectId, store.papers, store.questions, store.attempts, store.mastery, store.mistakes],
  );

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Next-paper forecast"
        hint="Which topics the next paper is most likely to sample — from the papers you hold and the spec mix, never invented."
      />
      <p className="text-sm text-ink2" role="status">
        {forecast.headline}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {forecast.provisional ? <Pill tone="danger">Provisional</Pill> : <Pill tone="success">Grounded sample</Pill>}
        <Pill>{Math.round(forecast.confidence * 100)}% confidence</Pill>
        <Pill>{forecast.papersCount} {forecast.papersCount === 1 ? "paper" : "papers"} in hand</Pill>
        {forecast.coveredTopics ? <Pill>{forecast.coveredTopics} topics sampled</Pill> : null}
      </div>
      <ul className="space-y-1.5">
        {forecast.rows.slice(0, FORECAST_MAX_TOPICS).map((row) => (
          <li key={row.topicId} className="text-xs text-ink2 flex items-center gap-1.5 flex-wrap">
            <Pill tone={RISK_TONE[row.riskLabel]}>≈{row.expectedMarks} marks</Pill>
            <span className="font-medium text-ink">{row.title}</span>
            <span className="text-ink3">
              — {row.evidenceNote}; {row.rationale}
            </span>
          </li>
        ))}
      </ul>
      {forecast.notes.length ? (
        <ul className="space-y-0.5 text-[11px] text-ink3 list-disc pl-4">
          {forecast.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
