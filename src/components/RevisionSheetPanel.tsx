"use client";

import { useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildRevisionSheet, sheetTitleLine } from "@/domain/revision-sheet";
import { useStoreFields } from "@/state/store";
import { Button, Panel, Pill, SectionHeading } from "@/components/ui";

// One printable page per topic: spec content condensed, misconceptions, and
// the student's own open mistakes to confront. Print styles hide the chrome,
// so the browser's print dialog produces a clean hand-out.

export function RevisionSheetPanel({ topicId }: { topicId: string }) {
  const store = useStoreFields("attempts", "mistakes", "questions");
  const [expanded, setExpanded] = useState(false);

  const sheet = useMemo(() => {
    const topic = getTopic(topicId);
    if (!topic) return null;
    return buildRevisionSheet(
      { topicId, attempts: store.attempts, questions: store.questions, mistakes: store.mistakes, now: new Date() },
      topic,
    );
  }, [topicId, store.attempts, store.mistakes, store.questions]);

  if (!sheet) return null;
  const subject = getSubject(sheet.subjectId);

  return (
    <Panel className={`space-y-3 ${expanded ? "" : "print:hidden"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <SectionHeading
          title="Revision sheet"
          hint="One printable page: what earns marks, where they are lost, and your own open mistakes."
        />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      <header className={expanded ? "" : "line-clamp-3"}>
        <p className="text-sm font-semibold text-ink print:text-base">
          {sheetTitleLine(sheet, subject?.name ?? sheet.subjectId)}
        </p>
        <p className="text-xs text-ink3 mt-0.5">{sheet.evidenceNote}</p>
        <p className="text-sm text-ink2 mt-1">{sheet.summary}</p>
      </header>

      <section aria-label="What earns marks">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">What earns marks</p>
        <ul className="space-y-1">
          {sheet.keyPoints.map((point, i) => (
            <li key={i} className="text-sm text-ink2">✓ {point}</li>
          ))}
        </ul>
      </section>

      {sheet.commonErrors.length ? (
        <section aria-label="Where marks are lost">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Where marks are lost</p>
          <ul className="space-y-1">
            {sheet.commonErrors.map((error, i) => (
              <li key={i} className="text-sm text-danger">✗ {error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {sheet.myMistakes.length ? (
        <section aria-label="Your recorded losses">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Your recorded losses</p>
          <ul className="space-y-1">
            {sheet.myMistakes.map((mistake, i) => (
              <li key={i} className="text-sm text-ink2">
                <span className="text-danger font-medium">{mistake.point ?? mistake.description}</span>
                {mistake.command ? <Pill className="ml-1.5">{mistake.command}</Pill> : null}
                <span className="text-ink3"> — {mistake.when}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sheet.misconceptions.length ? (
        <section aria-label="Common misconceptions">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Watch out: common misconceptions</p>
          <ul className="space-y-1.5">
            {sheet.misconceptions.map((misconception, i) => (
              <li key={i} className="text-sm text-ink2">
                <span className="text-ink font-medium">{misconception.statement}</span> — {misconception.correction}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sheet.selfCheck.length ? (
        <section aria-label="Blank-page self-check">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">Close the sheet, then answer</p>
          <ul className="space-y-1 list-disc pl-4">
            {sheet.selfCheck.map((prompt, i) => (
              <li key={i} className="text-sm text-ink2">{prompt}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}
