"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getSubject, getTopic, topicsFor, unitsFor } from "@/domain/curriculum";
import { buildPaperReadiness, rankPapers, type PaperReadiness } from "@/domain/paper-readiness";
import { useStoreFields } from "@/state/store";
import { Panel, Pill, SectionHeading } from "./ui";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function PaperCard({ row }: { row: PaperReadiness }) {
  const gap = row.gapTopicId ? getTopic(row.gapTopicId)?.title : null;
  const strongest = row.strongestTopicId ? getTopic(row.strongestTopicId)?.title : null;
  const known = row.mapping !== "unknown" && row.statements > 0;
  const exam = row.daysUntil === null ? "No exam date set" : row.daysUntil < 0 ? "Exam date has passed" : row.daysUntil === 0 ? "Exam today" : `${plural(row.daysUntil, "day")} remaining`;
  return (
    <Panel as="article" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{row.name}</h3>
          <p className="text-xs text-ink3">{exam} · {pct(row.weight)} of the qualification</p>
        </div>
        <Pill tone={row.evidence === "solid" ? "success" : row.evidence === "none" ? "neutral" : "review"}>
          {row.evidence === "none" ? "No evidence yet" : `${row.evidence[0]!.toUpperCase()}${row.evidence.slice(1)} ${row.referenceTier ? "practice evidence" : "evidence"}`}
        </Pill>
      </div>
      {!known ? (
        <p className="text-sm text-ink3">The topics this paper covers are not recorded in the curriculum data, so Revise does not estimate it. Subject-level evidence is on the Specification page.</p>
      ) : (
        <>
          <ul className="text-sm text-ink space-y-1">
            <li>{pct(row.secureShare ?? 0)} of {plural(row.statements, "statement")} {row.referenceTier ? "secure in practice" : "evidence-secure"} ({row.secure} secure, {row.weak} weak or thin, {row.missing} untouched)</li>
            <li>{row.marksAtRisk} marks at risk across {plural(row.unresolvedMistakes, "open mistake")}{row.recurringMistakes ? `, ${row.recurringMistakes} recurring` : ""}</li>
            <li>
              Recall {row.recall.accuracy === null ? "unknown" : pct(row.recall.accuracy)} · Application {row.application.accuracy === null ? "unknown" : pct(row.application.accuracy)} · Unfamiliar {row.transfer.accuracy === null ? "unknown" : pct(row.transfer.accuracy)}
            </li>
            <li>{row.referenceTier
              ? row.transferUnproven ? `${plural(row.transferUnproven, "statement")} not yet done well on unfamiliar practice questions` : `${row.transferProven} done well on unfamiliar practice questions (practice, not proof)`
              : row.transferUnproven ? `${plural(row.transferUnproven, "statement")} still lack unfamiliar-context proof` : `${row.transferProven} proven on unfamiliar questions`}</li>
            <li>{row.paperAttempts ? `${plural(row.paperAttempts, "timed paper answer")} recorded` : "No timed paper evidence"}</li>
          </ul>
          <p className="text-xs text-ink3">
            {strongest ? `Strongest: ${strongest}. ` : ""}{gap ? `Highest-value gap: ${gap}. ` : ""}{row.referenceTier ? "Next step" : "Next proof"}: {row.nextProof.text}
          </p>
          {row.gapTopicId ? (
            <Link className="text-sm font-medium text-accent underline" href={`/practice?subject=${encodeURIComponent(row.subjectId)}&topic=${encodeURIComponent(row.gapTopicId)}`}>
              Practise {gap}
            </Link>
          ) : null}
        </>
      )}
    </Panel>
  );
}

export function PaperReadinessPanel() {
  const store = useStoreFields("attempts", "mistakes", "questions", "examDates", "settings");
  const rows = useMemo(() => {
    return store.settings.subjectIds.flatMap((subjectId) => {
      const subject = getSubject(subjectId);
      if (!subject) return [];
      const subjectTopics = topicsFor(subjectId);
      return rankPapers(buildPaperReadiness({
        subject, topics: subjectTopics, units: unitsFor(subjectId), questions: store.questions,
        attempts: store.attempts, mistakes: store.mistakes, examDates: store.examDates,
      }));
    });
  }, [store.attempts, store.mistakes, store.questions, store.examDates, store.settings.subjectIds]);

  if (!rows.length) return null;
  return (
    <section aria-labelledby="paper-readiness-heading" className="space-y-4">
      <SectionHeading title="Paper readiness" hint="Evidence per exam paper. Every figure counts recorded, trusted, unaided answers; unknown stays unknown." />
      <h2 id="paper-readiness-heading" className="sr-only">Paper readiness</h2>
      <div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <PaperCard key={row.paperId} row={row} />)}</div>
    </section>
  );
}
