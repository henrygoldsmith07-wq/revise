"use client";

import Link from "next/link";
import { useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import type { ResponseTimeStatus, ResponseTimeSubjectSummary } from "@/domain/response-time-calibration";
import { useStore, useSubjects } from "@/state/store";
import { Button, EmptyState, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

const STATUS_LABEL: Record<ResponseTimeStatus, string> = {
  "insufficient-data": "Need more data",
  rushed: "Rushing",
  calibrated: "On target",
  overthinking: "Overthinking",
};

function statusTone(status: ResponseTimeStatus): "neutral" | "success" | "review" | "danger" {
  if (status === "calibrated") return "success";
  if (status === "rushed") return "danger";
  if (status === "overthinking") return "review";
  return "neutral";
}

function seconds(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}s`;
}

function ratio(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function StatusPill({ status }: { status: ResponseTimeStatus }) {
  return <Pill tone={statusTone(status)}>{STATUS_LABEL[status]}</Pill>;
}

function CalibrationStats({ row }: { row: ResponseTimeSubjectSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile label="Measured answers" value={row.attempts} sub={`${row.quality} evidence`} />
      <StatTile
        label="Actual pace"
        value={`${seconds(row.actualSecondsPerMark)}/mark`}
        sub={`Exam budget ${seconds(row.targetSecondsPerMark)}/mark`}
        tone={row.status === "rushed" ? "danger" : row.status === "overthinking" ? "review" : row.status === "calibrated" ? "success" : undefined}
      />
      <StatTile
        label="Accuracy"
        value={row.accuracy == null ? "—" : `${Math.round(row.accuracy * 100)}%`}
        sub={`${row.lostMarks} marks lost in timed answers`}
        tone={row.accuracy != null && row.accuracy >= 0.7 ? "success" : row.accuracy != null ? "review" : undefined}
      />
      <StatTile
        label="Pace ratio"
        value={ratio(row.ratio)}
        sub={`${row.rushedAttempts} rushed · ${row.slowAttempts} slow`}
        tone={statusTone(row.status) === "danger" ? "danger" : statusTone(row.status) === "review" ? "review" : statusTone(row.status) === "success" ? "success" : undefined}
      />
    </div>
  );
}

function SubjectList({ rows, selectedId, onSelect }: { rows: ResponseTimeSubjectSummary[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <ul className="card divide-y divide-line">
      {rows.map((row) => (
        <li key={row.subjectId}>
          <button
            type="button"
            onClick={() => onSelect(row.subjectId)}
            aria-pressed={selectedId === row.subjectId}
            className={`w-full text-left px-4 py-3 transition-colors ${selectedId === row.subjectId ? "bg-surface2" : "hover:bg-surface2"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink truncate">{getSubject(row.subjectId)?.name ?? row.subjectId}</span>
              <StatusPill status={row.status} />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-ink3">
              <span>{row.attempts ? `${row.attempts} measured answers` : "No timed answers yet"}</span>
              <span className="tabular-nums">{ratio(row.ratio)} of exam pace</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={row.ratio == null ? 0 : Math.min(1, row.ratio / 2)} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Detail({ row }: { row: ResponseTimeSubjectSummary }) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Selected subject</p>
          <h3 className="text-base font-semibold text-ink mt-1">{getSubject(row.subjectId)?.name ?? row.subjectId}</h3>
        </div>
        <StatusPill status={row.status} />
      </div>

      <CalibrationStats row={row} />

      <div className="border-t border-line pt-3">
        <p className="text-sm font-semibold text-ink">What to do next</p>
        <p className="text-sm text-ink2 mt-1">{row.recommendation}</p>
        <p className="text-[11px] text-ink3 mt-2">
          Rushed means below 75% of the mark budget; overthinking means above 135%. The target is weighted by paper duration when a question came from an uploaded paper, otherwise it uses 90 seconds per mark.
        </p>
      </div>

      {row.attempts ? (
        <div>
          <SectionHeading title="Topic timing" hint="The largest pace mismatches appear first." />
          <ul className="card divide-y divide-line">
            {row.topics.slice(0, 6).map((topic) => (
              <li key={topic.topicId} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{getTopic(topic.topicId)?.title ?? topic.topicId}</p>
                  <p className="text-[11px] text-ink3">
                    {topic.attempts} answer{topic.attempts === 1 ? "" : "s"} · {topic.accuracy == null ? "—" : `${Math.round(topic.accuracy * 100)}% accuracy`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm tabular-nums text-ink">{seconds(topic.actualSecondsPerMark)}/mark</p>
                  <p className="text-[11px] text-ink3 tabular-nums">{ratio(topic.ratio)} of target</p>
                </div>
                <StatusPill status={topic.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href={`/practice?subject=${encodeURIComponent(row.subjectId)}`}>
        <Button variant="primary" size="sm">Practise timed questions</Button>
      </Link>
    </Panel>
  );
}

export function ResponseTimeCalibrationPanel({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const subjects = useSubjects();
  const rows = store.responseTimeCalibration.rows;
  const [selectedId, setSelectedId] = useState(subjects[0]?.id ?? "");
  const activeId = subjects.some((subject) => subject.id === selectedId) ? selectedId : subjects[0]?.id ?? "";
  const selected = rows.find((row) => row.subjectId === activeId) ?? rows[0];
  const overall = store.responseTimeCalibration.overall;

  if (compact) {
    return (
      <Panel>
        <SectionHeading
          title="Response-time calibration"
          hint="Are you spending the right amount of time for the marks?"
          action={<Link href="/response-time" className="text-xs text-ink2 underline">Open calibration</Link>}
        />
        {overall.attempts < 3 ? (
          <p className="text-sm text-ink3">Complete three marked questions with timing recorded to see whether speed is helping or hiding marks.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={overall.status} />
            <span className="text-sm text-ink2">{seconds(overall.actualSecondsPerMark)}/mark against {seconds(overall.targetSecondsPerMark)} allowed</span>
            <span className="text-xs text-ink3">{overall.accuracy == null ? "—" : `${Math.round(overall.accuracy * 100)}% accuracy`} · {overall.attempts} answers</span>
          </div>
        )}
      </Panel>
    );
  }

  if (!subjects.length) {
    return <EmptyState title="No subjects selected" body="Choose a subject in Settings before calibrating response time." />;
  }

  return (
    <div className="space-y-5">
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Your pace, measured honestly</p>
            <p className="text-xs text-ink3 mt-0.5">Every result comes from marked answers already saved on this device.</p>
          </div>
          <label className="block min-w-52">
            <span className="text-xs font-semibold text-ink2">Subject</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="field field-inline text-sm w-full mt-1" aria-label="Response-time subject">
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-ink3" aria-live="polite">
          {overall.attempts} of {store.responseTimeCalibration.totalAttempts} attempts have a usable elapsed time. Idle time remains included because it is part of exam behaviour.
        </p>
      </Panel>

      {selected ? <Detail row={selected} /> : null}

      <section>
        <SectionHeading title="Calibration by subject" hint="Select a subject to inspect its timing leaks and accuracy." />
        <SubjectList rows={rows} selectedId={selected?.subjectId ?? activeId} onSelect={setSelectedId} />
      </section>
    </div>
  );
}
