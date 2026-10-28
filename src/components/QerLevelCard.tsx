"use client";

import { useMemo } from "react";
import { buildQerLevelView } from "@/domain/qer-levels";
import type { MarkedPart, Question, QuestionPart } from "@/domain/types";
import { Pill } from "./ui";

/** Level-of-response band for a 6-mark written answer, with what reaches the next band. */
export function QerLevelCard({ question, part, marked, answer }: { question: Question; part: QuestionPart; marked: MarkedPart; answer: string }) {
  const view = useMemo(() => buildQerLevelView({ question, part, marked, answer }), [question, part, marked, answer]);
  if (!view || question.kind === "mcq") return null;
  return (
    <div className="mt-3 card card-2 p-3 bg-surface2 space-y-2" aria-label="Level of response">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={view.level === 3 ? "success" : "review"}>{view.level === 0 ? "Level 0" : `Level ${view.level} of 3`}</Pill>
        <span className="text-xs text-ink2">{view.summary}</span>
      </div>
      {view.nextLevelPoints.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">To reach the next level, add</p>
          <ul className="mt-1 space-y-1 list-disc pl-4 text-xs text-ink2">{view.nextLevelPoints.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
      ) : null}
      {view.coherenceRisks.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{view.presentationRisk ? "Content is full band, but the writing may hold it back" : "Structure checks"}</p>
          <ul className="mt-1 space-y-1 list-disc pl-4 text-xs text-ink2">{view.coherenceRisks.map((issue) => <li key={issue.kind}>{issue.message}</li>)}</ul>
        </div>
      ) : null}
      <p className="text-[11px] text-ink3">Bands restate your mark out of 6 as 1–2, 3–4 and 5–6. Structure checks are simple text patterns and never change your mark.</p>
    </div>
  );
}
