"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { useStoreFields } from "@/state/store";
import { Panel, Pill, ProgressBar, SectionHeading, StatTile } from "../ui";
import { EmptyHint } from "./shared";

export function PaperSimulationCard() {
  const store = useStoreFields("previewPaper", "questions", "settings");
  const subjects = store.settings.subjectIds.map((id) => {
    const s = getSubject(id);
    return s ? { id: s.id, name: s.name, papers: s.papers } : null;
  }).filter(Boolean) as Array<{ id: string; name: string; papers: { id: string; name: string; durationMinutes: number }[] }>;
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [paperSpecId, setPaperSpecId] = useState(subjects[0]?.papers[0]?.id ?? "");
  const subject = subjects.find((s) => s.id === subjectId);
  const questions = store.questions.filter((q) => q.subjectId === subjectId);
  const simulation = useMemo(() => {
    if (!subjectId || !paperSpecId || !questions.length) return null;
    // Simulate against a full-paper-sized slice (up to 40 marks worth)
    const slice: string[] = [];
    let marks = 0;
    for (const q of questions) {
      slice.push(q.id);
      marks += q.totalMarks;
      if (marks >= 40) break;
    }
    return store.previewPaper(subjectId, paperSpecId, slice);
  }, [store, subjectId, paperSpecId, questions]);

  if (!subjects.length) return null;

  return (
    <Panel>
      <SectionHeading title="Exam-paper simulation" hint="Predicted marks for a timed paper, with calibration for your optimism." />
      <div className="flex flex-wrap gap-2 mb-3">
        <select aria-label="Subject for exam-paper simulation" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); const s = subjects.find((x) => x.id === e.target.value); setPaperSpecId(s?.papers[0]?.id ?? ""); }} className="field field-inline text-sm">
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Paper for exam-paper simulation" value={paperSpecId} onChange={(e) => setPaperSpecId(e.target.value)} className="field field-inline text-sm">
          {(subject?.papers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.durationMinutes}m</option>)}
        </select>
      </div>
      {!simulation ? <EmptyHint>Need at least one question in this subject to simulate a paper.</EmptyHint> : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatTile label="Predicted" value={`${simulation.predictedMarks}/${simulation.totalMarks}`} sub={`Grade ${simulation.predictedGrade}`} tone={simulation.predictedMarks / Math.max(1, simulation.totalMarks) >= 0.7 ? "success" : "review"} />
            <StatTile label="Time allowed" value={`${simulation.timeMinutes}m`} sub={subject?.papers.find((p) => p.id === paperSpecId)?.name ?? ""} />
            <StatTile label="Recoverable" value={`+${simulation.recoverableMarks}`} sub="with 1h per weak topic" tone="success" />
          </div>
          <div>
            <ProgressBar value={simulation.totalMarks ? simulation.predictedMarks / simulation.totalMarks : 0} tone={simulation.predictedMarks / Math.max(1, simulation.totalMarks) >= 0.7 ? "success" : "review"} />
          </div>
          {simulation.marksByTopic.length ? (
            <ul className="mt-3 space-y-1">
              {simulation.marksByTopic.slice(0, 8).map((row) => (
                <li key={row.topicId} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2 truncate">{getTopic(row.topicId)?.title ?? row.topicId}</span>
                  <span className="tabular-nums shrink-0">{row.expected}/{row.available} expected</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-ink3 mt-3">
            Provisional estimate from trusted questions only{simulation.untrustedCount ? ` · ${simulation.untrustedCount} unreviewed question${simulation.untrustedCount === 1 ? "" : "s"} excluded` : ""}. Uses your current topic mastery, re-weighted by calibration (see below). <Link href="/papers" className="underline">Sit a real paper</Link> to tighten the prediction.
          </p>
        </>
      )}
    </Panel>
  );
}

export function CalibrationCard() {
  const store = useStoreFields("calibrations");
  const rows = [...store.calibrations.values()].filter((c) => c.sampleSize > 0);
  return (
    <Panel>
      <SectionHeading title="Actual vs predicted — calibration" hint="How honest the predictions are. Needs three sat papers per subject." />
      {!rows.length ? (
        <EmptyHint>Sit three papers in the same subject and the calibration appears here — bias, slope and mean error are then shown per subject.</EmptyHint>
      ) : (
        <ul className="divide-y divide-line card overflow-hidden">
          {rows.map((c) => {
            const subject = getSubject(c.subjectId);
            return (
              <li key={c.subjectId} className="px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-ink min-w-[7rem]">{subject?.name ?? c.subjectId}</span>
                <Pill>n={c.sampleSize}</Pill>
                <span className="text-ink2">bias {c.bias >= 0 ? "+" : ""}{c.bias.toFixed(1)}</span>
                <span className="text-ink2">slope {c.slope.toFixed(2)}</span>
                <span className="text-ink3">MAE {c.mae.toFixed(1)}</span>
                {Math.abs(c.bias) < 1 && Math.abs(c.slope - 1) < 0.15 ? <Pill tone="success">Well calibrated</Pill> : <Pill tone="review">Drifting</Pill>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
