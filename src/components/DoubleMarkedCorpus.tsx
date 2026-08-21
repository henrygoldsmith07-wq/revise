"use client";

import { useMemo, useRef, useState } from "react";
import { DEMO_DOUBLE_MARKED_ANSWERS } from "@/content/double-marked-answer-corpus";
import {
  buildDoubleMarkedCorpusReport,
  parseDoubleMarkedCorpus,
  serialiseDoubleMarkedCorpus,
} from "@/domain/double-marked-corpus";
import type { CorpusRowStatus, DoubleMarkedAnswer, DoubleMarkedAnswerAnalysis } from "@/domain/double-marked-corpus";
import { subjectLabel } from "@/domain/curriculum";
import { Button, EmptyState, Panel, Pill, SectionHeading, StatTile, cx } from "./ui";

type DraftAdjudication = { awarded: string; note: string };

const STATUS_LABEL: Record<CorpusRowStatus, string> = {
  agreement: "Agree",
  disagreement: "Needs adjudication",
  adjudicated: "Adjudicated",
};

function statusTone(status: CorpusRowStatus): "success" | "review" | "accent" {
  return status === "agreement" ? "success" : status === "disagreement" ? "review" : "accent";
}

export function DoubleMarkedCorpus() {
  const [rows, setRows] = useState<DoubleMarkedAnswer[]>([]);
  const [subjectId, setSubjectId] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftAdjudication>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const report = useMemo(() => buildDoubleMarkedCorpusReport(rows), [rows]);
  const subjects = useMemo(
    () => [...new Set(rows.map((row) => row.subjectId))].sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b))),
    [rows],
  );
  const visibleAnalyses = report.analyses.filter((analysis) => subjectId === "all" || analysis.row.subjectId === subjectId);
  const pending = visibleAnalyses.filter((analysis) => analysis.status === "disagreement");
  const qualityLabel = report.quality === "empty" ? "No sample" : report.quality === "early" ? "Early sample" : report.quality === "usable" ? "Usable sample" : "Stable sample";
  const qualityTone = report.quality === "stable" || report.quality === "usable" ? "success" : report.quality === "early" ? "review" : "neutral";

  function loadDemo() {
    setRows(DEMO_DOUBLE_MARKED_ANSWERS.map((row) => ({ ...row })));
    setSubjectId("all");
    setDrafts({});
    setErrors([]);
    setNotice("Loaded synthetic demonstration rows. They are not teacher or examiner labels.");
  }

  async function importFile(file: File) {
    const result = parseDoubleMarkedCorpus(await file.text());
    setErrors(result.errors);
    if (result.rows.length) {
      setRows(result.rows);
      setSubjectId("all");
      setDrafts({});
      setNotice(`Imported ${result.rows.length} double-marked answer${result.rows.length === 1 ? "" : "s"}.`);
    } else if (result.errors.length) {
      setNotice("Nothing was imported. Fix the file errors and try again.");
    }
  }

  function exportCorpus() {
    if (!rows.length) return;
    const blob = new Blob([serialiseDoubleMarkedCorpus(rows)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "revise-double-marked-corpus.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} double-marked answer${rows.length === 1 ? "" : "s"}.`);
  }

  function draftFor(id: string): DraftAdjudication {
    return drafts[id] ?? { awarded: "", note: "" };
  }

  function updateDraft(id: string, patch: Partial<DraftAdjudication>) {
    setDrafts((previous) => ({ ...previous, [id]: { ...draftFor(id), ...patch } }));
  }

  function recordAdjudication(row: DoubleMarkedAnswer) {
    const draft = draftFor(row.id);
    const awarded = Number(draft.awarded);
    if (!Number.isInteger(awarded) || awarded < 0 || awarded > row.maxMarks) return;
    const note = draft.note.trim();
    setRows((previous) =>
      previous.map((candidate) =>
        candidate.id === row.id
          ? { ...candidate, adjudication: { awarded, note: note || undefined, resolvedAt: new Date().toISOString() } }
          : candidate,
      ),
    );
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[row.id];
      return next;
    });
    setNotice(`Adjudication recorded for ${row.id}. Export the corpus to keep this review outside the session.`);
  }

  return (
    <div className="space-y-7">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Double-Marked Answer Corpus</h1>
            <p className="text-sm text-ink3 mt-1 max-w-3xl">
              Compare two independent marks on the same answer before adjudication. This measures marker agreement;
              it does not turn synthetic examples into human evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={loadDemo}>Load demonstration rows</Button>
            <Button size="sm" onClick={() => inputRef.current?.click()}>Import JSON</Button>
            <Button size="sm" onClick={exportCorpus} disabled={!rows.length}>Export JSON</Button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Import double-marked corpus JSON"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
        {notice ? <p className="text-xs text-ink2 mt-3" role="status" aria-live="polite">{notice}</p> : null}
        {errors.length ? (
          <div className="mt-3 rounded-[8px] border border-review bg-reviewsoft p-3 text-xs text-ink2" role="alert">
            <p className="font-semibold">Import warnings</p>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              {errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}
            </ul>
            {errors.length > 5 ? <p className="mt-1 text-ink3">{errors.length - 5} more warning{errors.length - 5 === 1 ? "" : "s"} hidden.</p> : null}
          </div>
        ) : null}
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Answers" value={report.rows} sub="paired rows" />
        <StatTile label="Exact agreement" value={`${Math.round(report.exactAgreementRate * 100)}%`} sub={`${report.exactAgreement} rows`} tone={report.exactAgreementRate >= 0.8 ? "success" : report.rows ? "review" : undefined} />
        <StatTile label="Within 1 mark" value={`${Math.round(report.withinOneMarkRate * 100)}%`} sub={`${report.withinOneMark} rows`} tone={report.withinOneMarkRate >= 0.9 ? "success" : report.rows ? "review" : undefined} />
        <StatTile label="Mean mark gap" value={report.meanAbsoluteDifference.toFixed(2)} sub="absolute difference" />
        <StatTile label="Marker B bias" value={`${report.markerBias > 0 ? "+" : ""}${report.markerBias.toFixed(2)}`} sub="B − A marks" tone={Math.abs(report.markerBias) <= 0.25 ? "success" : report.rows ? "review" : undefined} />
      </section>

      {!rows.length ? (
        <EmptyState
          title="No double-marked answers loaded"
          body="Import a version-1 JSON corpus from two independent markers, or load the clearly labelled synthetic rows to inspect the workflow."
          action={<Button variant="primary" onClick={loadDemo}>Load demonstration rows</Button>}
        />
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionHeading title="Corpus quality" hint="Agreement is calculated from the two original marks; adjudication is reported separately." />
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink2">
                  <Pill tone={qualityTone}>{qualityLabel}</Pill>
                  <Pill>{report.disagreements} disagreement{report.disagreements === 1 ? "" : "s"}</Pill>
                  <Pill>{report.pendingAdjudication} pending adjudication</Pill>
                  <Pill>{report.adjudicatedRows} adjudicated</Pill>
                </div>
              </div>
              <div className="text-right text-[11px] text-ink3 max-w-xs">
                <p>{rows.every((row) => row.provenance === "synthetic-demo") ? "Source: synthetic demonstration" : "Source: imported corpus"}</p>
                <p>Keep the exported JSON with its marker provenance.</p>
              </div>
            </div>
          </Panel>

          <section className="space-y-3">
            <SectionHeading
              title="Review queue"
              hint="Resolve disagreements only after seeing both original marks and the answer text."
              action={
                <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="field field-inline text-xs" aria-label="Corpus subject">
                  <option value="all">All subjects</option>
                  {subjects.map((id) => <option key={id} value={id}>{subjectLabel(id)}</option>)}
                </select>
              }
            />
            {pending.length ? (
              <div className="space-y-3">
                {pending.map((analysis) => <AdjudicationRow key={analysis.row.id} analysis={analysis} draft={draftFor(analysis.row.id)} onDraft={updateDraft} onRecord={recordAdjudication} />)}
              </div>
            ) : (
              <Panel>
                <p className="text-sm text-ink2">No pending disagreements in this filter.</p>
                <p className="text-xs text-ink3 mt-1">That is useful evidence, but a larger corpus is still needed before calling agreement stable.</p>
              </Panel>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading title="All marked answers" hint="The original answer and both independent scores stay visible after adjudication." />
            <Panel className="p-0 overflow-hidden">
              <div className="overflow-x-auto nice-scroll">
                <table className="w-full text-xs min-w-[760px]">
                  <thead className="bg-surface2 text-ink3">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Answer</th>
                      <th className="text-right px-3 py-2 font-semibold">Marker A</th>
                      <th className="text-right px-3 py-2 font-semibold">Marker B</th>
                      <th className="text-right px-3 py-2 font-semibold">Gap</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAnalyses.map((analysis) => <CorpusTableRow key={analysis.row.id} analysis={analysis} />)}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setRows([]); setSubjectId("all"); setDrafts({}); setNotice("Corpus cleared from this review session."); }}>
              Clear session corpus
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AdjudicationRow({
  analysis,
  draft,
  onDraft,
  onRecord,
}: {
  analysis: DoubleMarkedAnswerAnalysis;
  draft: DraftAdjudication;
  onDraft: (id: string, patch: Partial<DraftAdjudication>) => void;
  onRecord: (row: DoubleMarkedAnswer) => void;
}) {
  const row = analysis.row;
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{subjectLabel(row.subjectId)} · {row.id}</p>
          <p className="text-sm text-ink mt-1">{row.prompt}</p>
          <details className="mt-2">
            <summary className="text-xs text-ink2 cursor-pointer select-none">Show answer and marker notes</summary>
            <div className="mt-2 space-y-2 text-xs text-ink2 whitespace-pre-wrap">
              <p className="card-2 p-2">{row.answer || "(blank answer)"}</p>
              <p><span className="font-semibold">{row.markerA.markerId}:</span> {row.markerA.awarded}/{row.maxMarks}{row.markerA.note ? ` — ${row.markerA.note}` : ""}</p>
              <p><span className="font-semibold">{row.markerB.markerId}:</span> {row.markerB.awarded}/{row.maxMarks}{row.markerB.note ? ` — ${row.markerB.note}` : ""}</p>
            </div>
          </details>
        </div>
        <Pill tone="review">{analysis.difference} mark{analysis.difference === 1 ? "" : "s"} apart</Pill>
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-line">
        <label className="text-xs text-ink2">
          <span className="block font-semibold mb-1">Adjudicated mark</span>
          <select value={draft.awarded} onChange={(event) => onDraft(row.id, { awarded: event.target.value })} className="field field-inline text-xs" aria-label={`Adjudicated mark for ${row.id}`}>
            <option value="">Choose</option>
            {Array.from({ length: row.maxMarks + 1 }, (_, mark) => <option key={mark} value={mark}>{mark}/{row.maxMarks}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[14rem] text-xs text-ink2">
          <span className="block font-semibold mb-1">Adjudication note</span>
          <input value={draft.note} onChange={(event) => onDraft(row.id, { note: event.target.value })} className="field text-xs" placeholder="Optional reason for the final mark" aria-label={`Adjudication note for ${row.id}`} />
        </label>
        <Button size="sm" variant="primary" disabled={draft.awarded === ""} onClick={() => onRecord(row)}>Record decision</Button>
      </div>
    </Panel>
  );
}

function CorpusTableRow({ analysis }: { analysis: DoubleMarkedAnswerAnalysis }) {
  const row = analysis.row;
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2.5 max-w-[34rem]">
        <p className="font-semibold text-ink">{subjectLabel(row.subjectId)}</p>
        <p className="text-ink2 mt-0.5">{row.prompt}</p>
        <details className="mt-1.5">
          <summary className="text-ink3 cursor-pointer select-none">Answer</summary>
          <p className="mt-1 whitespace-pre-wrap text-ink2">{row.answer || "(blank answer)"}</p>
        </details>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.markerA.awarded}/{row.maxMarks}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.markerB.awarded}/{row.maxMarks}</td>
      <td className={cx("px-3 py-2.5 text-right tabular-nums font-semibold", analysis.difference ? "text-review" : "text-success")}>
        {analysis.difference}
        {row.adjudication ? <span className="block text-[11px] text-ink3 font-normal">final {row.adjudication.awarded}</span> : null}
      </td>
      <td className="px-3 py-2.5"><Pill tone={statusTone(analysis.status)}>{STATUS_LABEL[analysis.status]}</Pill></td>
    </tr>
  );
}

