"use client";

import { useMemo, useState } from "react";
import { getSubject, topicsFor } from "@/domain/curriculum";
import {
  buildUnitMock,
  buildUnitMockPaper,
  earlierUnitMockQuestionIds,
  unitMockBlueprints,
  unitMockMinutes,
  type UnitMock,
} from "@/domain/unit-mock";
import { useStoreFields } from "@/state/store";
import { Button, Panel, Pill, SectionHeading } from "./ui";

// Sit a mock built to the real shape of one WJEC unit paper: the unit's own
// duration and mark total, questions only from that unit, spread across the
// whole unit. Year 12 is offered the AS units only.

export function UnitMockPanel({ subjectId, onStart }: { subjectId: string; onStart: (paperId: string) => void }) {
  const store = useStoreFields("addPaper", "attempts", "papers", "questions", "settings", "userId");
  const [savingUnit, setSavingUnit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subject = getSubject(subjectId);
  const yearGroup = store.settings?.yearGroup;
  const unit4Option = store.settings?.unit4Option;

  const mocks = useMemo(() => {
    if (!subject) return [];
    const topics = topicsFor(subjectId);
    const now = new Date();
    return unitMockBlueprints({ subject, topics, yearGroup, unit4Option }).map((blueprint) => {
      const earlier = earlierUnitMockQuestionIds(store.papers, blueprint);
      const fresh = buildUnitMock({ blueprint, questions: store.questions, topics, attempts: store.attempts, excludeQuestionIds: earlier, now, seed: earlier.length });
      // When earlier mocks have used the unit up, allow their questions again
      // rather than offering a short paper.
      return fresh.complete || !earlier.length
        ? fresh
        : buildUnitMock({ blueprint, questions: store.questions, topics, attempts: store.attempts, now, seed: earlier.length });
    });
  }, [subject, subjectId, yearGroup, unit4Option, store.papers, store.questions, store.attempts]);

  if (!subject || !mocks.length) return null;

  async function start(mock: UnitMock) {
    if (savingUnit !== null || !mock.questionIds.length || !subject) return;
    setSavingUnit(mock.blueprint.unit);
    setError(null);
    try {
      const paper = buildUnitMockPaper({ mock, subjectName: subject.name, userId: store.userId, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      await store.addPaper(paper);
      onStart(paper.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mock could not be saved. Try again.");
    } finally {
      setSavingUnit(null);
    }
  }

  return (
    <UnitMockList
      subjectName={subject.name}
      yearGroupLabel={yearGroup === "year-12" ? "Year 12: AS units" : null}
      mocks={mocks}
      savingUnit={savingUnit}
      error={error}
      onStart={(mock) => void start(mock)}
    />
  );
}

export function UnitMockList({
  subjectName,
  yearGroupLabel,
  mocks,
  savingUnit,
  error,
  onStart,
}: {
  subjectName: string;
  yearGroupLabel: string | null;
  mocks: UnitMock[];
  savingUnit: number | null;
  error: string | null;
  onStart: (mock: UnitMock) => void;
}) {
  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Sit a WJEC unit paper"
        hint={`A full mock built to the real ${subjectName} unit paper: its own time limit and mark total, questions only from that unit.`}
        action={yearGroupLabel ? <Pill tone="accent">{yearGroupLabel}</Pill> : undefined}
      />
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="WJEC unit papers">
        {mocks.map((mock) => {
          const { blueprint } = mock;
          const minutes = unitMockMinutes(blueprint, mock.totalMarks);
          const sampled = mock.topics.filter((topic) => topic.marks > 0);
          return (
            <li key={blueprint.paperSpecId} className="card card-2 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{blueprint.name}</p>
                <Pill>{blueprint.level}</Pill>
              </div>
              <p className="text-xs text-ink3">
                Real paper: {blueprint.durationMinutes} minutes · {blueprint.marks} marks · {blueprint.weightPercent}% of the A level
                {blueprint.calculatorAllowed ? " · calculator" : ""}
              </p>
              {mock.questionIds.length ? (
                <p className="text-xs text-ink2" role="status">
                  This mock: {mock.questionIds.length} questions · {mock.totalMarks} marks · {minutes} minutes, across {sampled.length} of {mock.topics.length} topics
                </p>
              ) : null}
              {mock.notes.length ? (
                <ul className="space-y-0.5 text-[11px] text-ink3 list-disc pl-4">
                  {mock.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <Button
                variant="primary"
                className="w-full"
                disabled={!mock.questionIds.length || savingUnit !== null}
                onClick={() => onStart(mock)}
              >
                {savingUnit === blueprint.unit ? "Saving…" : `Sit Unit ${blueprint.unit} mock`}
              </Button>
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
      {mocks[0]?.blueprint.sourceUrl ? (
        <p className="text-[11px] text-ink3">
          Paper times and marks are from the{" "}
          <a className="underline" href={mocks[0].blueprint.sourceUrl} target="_blank" rel="noreferrer">WJEC specification</a>.
        </p>
      ) : null}
    </Panel>
  );
}
