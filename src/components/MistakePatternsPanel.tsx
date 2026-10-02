"use client";

import { useMemo } from "react";
import { getTopic } from "@/domain/curriculum";
import { buildMistakePatterns } from "@/domain/mistake-patterns";
import { INTERVENTION_LABEL } from "@/domain/intervention-ranking";
import { useStoreFields } from "@/state/store";
import { Panel, Pill, SectionHeading } from "./ui";

const NEXT: Record<string, string> = {
  "misconception-correction": "misconception repair",
  "technique-intervention": "exam-technique practice",
  "retrieval-set": "recall practice",
  "prerequisite-repair": "prerequisite repair",
  "independent-set": "independent application questions",
  "timed-sprint": "timed practice",
};

/** Recurring mistake causes, with a repair that only counts after success on a different question. */
export function MistakePatternsPanel() {
  const store = useStoreFields("mistakes", "attempts", "questions", "settings");
  const patterns = useMemo(
    () => buildMistakePatterns({ mistakes: store.mistakes, attempts: store.attempts, questions: store.questions })
      .filter((row) => store.settings.subjectIds.length === 0 || row.topics.some((id) => {
        const subject = getTopic(id)?.subjectId;
        return !subject || store.settings.subjectIds.includes(subject);
      }))
      .filter((row) => row.recurring || row.openMarks > 0)
      .slice(0, 5),
    [store.mistakes, store.attempts, store.questions, store.settings.subjectIds],
  );
  if (!patterns.length) return null;
  return (
    <section aria-labelledby="mistake-patterns-heading" className="space-y-4">
      <SectionHeading title="Recurring mistake patterns" hint="Grouped by root cause across questions and dates. A pattern is repaired only after you succeed unaided on a different question." />
      <h2 id="mistake-patterns-heading" className="sr-only">Recurring mistake patterns</h2>
      <Panel className="space-y-3">
        {patterns.map((row) => (
          <article key={row.cause} className="space-y-1">
            <p className="text-sm font-medium text-ink">{row.headline}</p>
            <p className="text-xs text-ink3">
              {row.topics.length} topic{row.topics.length === 1 ? "" : "s"} · {row.days} day{row.days === 1 ? "" : "s"}
              {row.papers.length ? ` · ${row.papers.length} paper${row.papers.length === 1 ? "" : "s"}` : ""} · next: {NEXT[row.intervention] ?? INTERVENTION_LABEL[row.intervention]}
            </p>
            <Pill tone={row.repaired ? "success" : row.recurring ? "danger" : "neutral"}>
              {row.repaired ? "Repaired on a different question" : row.openMarks ? `${row.openMarks} marks still open` : "Awaiting proof on a different question"}
            </Pill>
          </article>
        ))}
      </Panel>
    </section>
  );
}
