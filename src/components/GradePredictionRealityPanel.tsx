"use client";

import { useMemo, useState } from "react";
import { getSubject } from "@/domain/curriculum";
import {
  analyseGradeLoop,
  pairPredictionsWithActuals,
  type ActualResultRecord,
  type PredictionOutcome,
} from "@/domain/grade-loop";
import { useStore } from "@/state/store";
import { Button, Field, Panel, Pill, SectionHeading, StatTile } from "./ui";

const RESULT_KIND_LABEL: Record<ActualResultRecord["kind"], string> = {
  mock: "Mock",
  paper: "Timed paper",
  final: "Final exam",
};

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function percentLabel(value: number | null): string {
  return value == null ? "—" : String(Math.round(value * 10) / 10) + "%";
}

function biasLabel(bias: number | null): string {
  if (bias == null) return "No pairs";
  if (Math.abs(bias) < 0.5) return "Near neutral";
  return bias > 0
    ? String(Math.round(bias * 10) / 10) + " pts low"
    : String(Math.round(Math.abs(bias) * 10) / 10) + " pts high";
}

function biasExplanation(bias: number | null): string {
  if (bias == null) return "Record an outcome after a saved forecast.";
  if (Math.abs(bias) < 0.5) return "Forecasts and outcomes are centred closely.";
  return bias > 0
    ? "Actual results are higher than Revise predicted."
    : "Actual results are lower than Revise predicted.";
}

function outcomeByActualId(outcomes: PredictionOutcome[]): Map<string, PredictionOutcome> {
  return new Map(outcomes.map((row) => [row.actualId, row] as const));
}

export function GradePredictionRealityPanel() {
  const store = useStore();
  const ownPredictions = useMemo(
    () => store.gradePredictionLog.filter((row) => row.anonId === store.userId),
    [store.gradePredictionLog, store.userId],
  );
  const ownActuals = useMemo(
    () => store.gradeActuals.filter((row) => row.anonId === store.userId),
    [store.gradeActuals, store.userId],
  );
  const report = useMemo(
    () => analyseGradeLoop({ predictions: ownPredictions, actuals: ownActuals }),
    [ownPredictions, ownActuals],
  );
  const outcomes = useMemo(
    () => pairPredictionsWithActuals(ownPredictions, ownActuals),
    [ownPredictions, ownActuals],
  );
  const matchedByActual = useMemo(() => outcomeByActualId(outcomes), [outcomes]);

  const [subjectId, setSubjectId] = useState(() => store.settings.subjectIds[0] ?? "");
  const [kind, setKind] = useState<ActualResultRecord["kind"]>("mock");
  const [percent, setPercent] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const numericPercent = Number(percent);
  const percentValid =
    percent.trim() !== "" &&
    Number.isFinite(numericPercent) &&
    numericPercent >= 0 &&
    numericPercent <= 100;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayLocal();
  const canSave = Boolean(subjectId) && percentValid && dateValid && !saving;

  const recentActuals = useMemo(
    () => [...ownActuals].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 8),
    [ownActuals],
  );

  async function saveResult() {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const takenAt = new Date(date + "T00:00:00").toISOString();
      await store.recordGradeActual({
        subjectId,
        percent: numericPercent,
        kind,
        takenAt,
        label: label.trim() || undefined,
      });
      setPercent("");
      setLabel("");
      setMessage("Result saved and matched only against forecasts that existed before it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that result.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="prediction-reality-heading" className="space-y-4">
      <SectionHeading
        title="Prediction reality check"
        hint="Close the loop with real mocks, timed papers and final results. Revise only compares an outcome with a forecast that existed before you sat it."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <Panel className="space-y-4">
          <div>
            <p id="prediction-reality-heading" className="text-sm font-semibold text-ink">Record a real result</p>
            <p className="text-xs text-ink3 mt-1">
              Use the date you actually sat the assessment, not the day you type it in. That keeps later forecasts from retroactively making an older prediction look better.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject">
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="field text-sm">
                {store.settings.subjectIds.map((id) => (
                  <option key={id} value={id}>{getSubject(id)?.name ?? id}</option>
                ))}
              </select>
            </Field>
            <Field label="Assessment type">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ActualResultRecord["kind"])}
                className="field text-sm"
              >
                <option value="mock">Mock</option>
                <option value="paper">Timed paper</option>
                <option value="final">Final exam</option>
              </select>
            </Field>
            <Field label="Score (%)" hint="Use the actual percentage, not a grade boundary estimate.">
              <input
                inputMode="decimal"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="field text-sm"
                placeholder="72"
              />
            </Field>
            <Field label="Date sat">
              <input
                type="date"
                value={date}
                max={todayLocal()}
                onChange={(e) => setDate(e.target.value)}
                className="field text-sm"
              />
            </Field>
          </div>

          <Field label="Label" hint="Optional, e.g. Unit 2 mock or June Paper 1.">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="field text-sm"
              placeholder="Unit 2 mock"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!canSave} onClick={() => void saveResult()}>
              {saving ? "Saving…" : "Record result"}
            </Button>
            {message ? <p className="text-xs text-ink3" role="status">{message}</p> : null}
          </div>
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Forecast accuracy</p>
              <p className="text-[11px] text-ink3">{report.note}</p>
            </div>
            <Pill tone={report.insufficientData ? "review" : "accent"}>
              {report.insufficientData ? "Building evidence" : "Measured"}
            </Pill>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Closed loops" value={report.pairs} sub={String(report.predictionsStored) + " forecasts stored"} />
            <StatTile
              label="Mean error"
              value={report.mae == null ? "—" : String(Math.round(report.mae * 10) / 10) + " pts"}
              sub="absolute error"
            />
            <StatTile label="Bias" value={biasLabel(report.bias)} sub={biasExplanation(report.bias)} />
            <StatTile
              label="Inside range"
              value={report.intervalCoverage == null ? "—" : String(Math.round(report.intervalCoverage * 100)) + "%"}
              sub="prediction interval coverage"
            />
          </div>

          <p className="text-[11px] text-ink3 leading-relaxed">
            Five matched outcomes are required before Revise treats these aggregate percentages as meaningful. Individual pairs remain visible before then.
          </p>
        </Panel>
      </div>

      {recentActuals.length ? (
        <Panel className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold text-ink">Recorded outcomes</p>
            <p className="text-[11px] text-ink3 mt-0.5">
              Each row shows the last forecast saved before the assessment date. Results with no earlier forecast stay unpaired instead of being back-filled.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {recentActuals.map((actual) => {
              const matched = matchedByActual.get(actual.id);
              const subject = getSubject(actual.subjectId);
              const delta = matched ? actual.percent - matched.predictedPercent : null;
              return (
                <li key={actual.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{subject?.name ?? actual.subjectId}</p>
                      <Pill>{RESULT_KIND_LABEL[actual.kind]}</Pill>
                    </div>
                    <p className="text-[11px] text-ink3 mt-0.5">
                      {actual.label ? actual.label + " · " : ""}
                      {new Date(actual.takenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-4 text-right">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-ink3">Actual</p>
                      <p className="text-sm font-semibold tabular-nums text-ink">{percentLabel(actual.percent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-ink3">Forecast</p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {matched ? percentLabel(matched.predictedPercent) : "No prior forecast"}
                      </p>
                    </div>
                    {delta != null ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-ink3">Difference</p>
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {delta > 0 ? "+" : ""}{Math.round(delta * 10) / 10} pts
                        </p>
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!window.confirm("Remove this recorded result?")) return;
                        void store.removeGradeActual(actual.id).then(() => setMessage("Recorded result removed."));
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm font-semibold text-ink">No real outcomes recorded yet.</p>
          <p className="text-xs text-ink3 mt-1">
            Add a mock, timed paper or final result above. The first matched result starts turning predicted grades from a model claim into something you can audit.
          </p>
        </Panel>
      )}

      {report.bySubject.some((row) => row.pairs > 0) ? (
        <Panel>
          <p className="text-sm font-semibold text-ink">Accuracy by subject</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.bySubject.map((row) => (
              <div key={row.key} className="rounded-[9px] bg-surface2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink truncate">{getSubject(row.key)?.name ?? row.key}</p>
                  <Pill>{row.pairs} pair{row.pairs === 1 ? "" : "s"}</Pill>
                </div>
                <p className="text-[11px] text-ink3 mt-1">
                  Mean absolute error {Math.round(row.mae * 10) / 10} points · {biasLabel(row.bias)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </section>
  );
}
