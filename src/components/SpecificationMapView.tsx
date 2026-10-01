"use client";

import { useMemo, useState } from "react";
import { getTopic } from "@/domain/curriculum";
import {
  buildSpecificationMap,
  ESTABLISHED_QUESTIONS,
  STATUS_LABELS,
  type SpecPointEvidence,
  type SpecRollup,
  type SpecStatus,
} from "@/domain/specification-evidence";
import { useStoreFields, useSubjects } from "@/state/store";
import { ButtonLink, EmptyState, Panel, Pill, SectionHeading, StatTile } from "./ui";

const TONE: Record<SpecStatus, "neutral" | "success" | "review" | "danger"> = {
  "no-evidence": "neutral",
  insufficient: "neutral",
  weak: "danger",
  developing: "review",
  secure: "success",
  stale: "review",
};

function evidenceLine(point: SpecPointEvidence): string {
  if (!point.attempts) {
    return point.questionsAvailable
      ? `Not tested yet · ${point.questionsAvailable} question${point.questionsAvailable === 1 ? "" : "s"} available`
      : "No question in the bank tests this statement yet";
  }
  const when = point.daysSinceTested === null ? "" : point.daysSinceTested === 0 ? " · today" : ` · ${point.daysSinceTested}d ago`;
  return `${point.distinctQuestions} question${point.distinctQuestions === 1 ? "" : "s"} · ${point.marksGained}/${point.marksAvailable} marks${when}`;
}

function RollupPills({ rollup }: { rollup: SpecRollup }) {
  const parts: Array<[SpecStatus, number]> = (["secure", "stale", "developing", "weak", "insufficient", "no-evidence"] as const)
    .map((status) => [status, rollup.byStatus[status]] as [SpecStatus, number])
    .filter(([, count]) => count > 0);
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map(([status, count]) => (
        <Pill key={status} tone={TONE[status]}>{count} {STATUS_LABELS[status].toLowerCase()}</Pill>
      ))}
    </span>
  );
}

export function SpecificationMapView() {
  const store = useStoreFields("attempts", "questions");
  const subjects = useSubjects();
  const [subjectId, setSubjectId] = useState(() => subjects[0]?.id ?? "");
  const map = useMemo(
    () => (subjectId ? buildSpecificationMap({ subjectId, attempts: store.attempts, questions: store.questions }) : null),
    [store.attempts, store.questions, subjectId],
  );
  const thinnest = map?.thinnestTopic ? getTopic(map.thinnestTopic.topicId) : undefined;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Proof layer</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Specification evidence</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          Every specification statement, with how well it is going and how much evidence says so. One correct answer is not mastery: a statement is secure only after {ESTABLISHED_QUESTIONS}+ different questions, unaided, and recent retrieval.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="spec-subject" className="text-xs text-ink3">Subject</label>
        <select id="spec-subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="field field-inline text-sm">
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>{subject.name}</option>
          ))}
        </select>
      </div>

      {!map || !map.rollup.total ? (
        <EmptyState title="No specification statements for this subject" body="This subject has no statement-level specification data yet, so there is nothing to show evidence against." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Statements" value={map.rollup.total} />
            <StatTile label="Secure" value={map.rollup.byStatus.secure} tone="success" sub={map.rollup.byStatus.stale ? `+${map.rollup.byStatus.stale} stale` : undefined} />
            <StatTile label="Real evidence" value={map.rollup.evidenced} sub="building or established" />
            <StatTile label="No evidence" value={map.rollup.byStatus["no-evidence"]} tone={map.rollup.byStatus["no-evidence"] ? "review" : "success"} sub={`${map.rollup.total - map.rollup.withQuestions} have no question yet`} />
          </div>

          <section aria-label="Specification map" className="space-y-3">
            <SectionHeading title="Unit → topic → statement" hint="Open a unit to see its topics, and a topic to see each statement's evidence." />
            {map.units.map((unit, unitIndex) => (
              <details key={unit.unit.id} className="card p-4" open={unitIndex === 0}>
                <summary className="cursor-pointer select-none flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{unit.unit.title}</span>
                  <RollupPills rollup={unit.rollup} />
                </summary>
                <div className="mt-3 space-y-2">
                  {unit.topics.map((topic) => (
                    <details key={topic.topic.id} className="rounded-[8px] border border-line px-3 py-2">
                      <summary className="cursor-pointer select-none flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-ink">{topic.topic.title}</span>
                        <RollupPills rollup={topic.rollup} />
                      </summary>
                      <ul className="mt-2 divide-y divide-line">
                        {topic.points.map((point) => (
                          <li key={point.specPointId} className="py-2 flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-ink2"><span className="text-ink3 tabular-nums mr-1.5">{point.ref}</span>{point.text}</p>
                              <p className="text-[11px] text-ink3 mt-0.5">{evidenceLine(point)}</p>
                            </div>
                            <Pill tone={TONE[point.status]} className="shrink-0">{STATUS_LABELS[point.status]}</Pill>
                          </li>
                        ))}
                      </ul>
                      <ButtonLink href={`/practice?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topic.topic.id)}`} size="sm" className="mt-2">
                        Practise {topic.topic.title}
                      </ButtonLink>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </section>

          {thinnest && map.thinnestTopic ? (
            <Panel className="border-accent">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Next best action</p>
              <p className="text-sm font-semibold text-ink mt-1">Build evidence in {thinnest.title}</p>
              <p className="text-xs text-ink2 mt-0.5">{map.thinnestTopic.lacking} of its statements still lack real evidence.</p>
              <ButtonLink href={`/practice?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(thinnest.id)}`} variant="primary" size="sm" className="mt-3">
                Practise {thinnest.title}
              </ButtonLink>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
