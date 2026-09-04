"use client";

import { useEffect, useMemo, useState } from "react";
import { getSubject } from "@/domain/curriculum";
import { actualMarksForWindow, revisionTwinKey } from "@/domain/revision-twin";
import { activityHref } from "@/lib/activity";
import { useStore } from "@/state/store";
import { RevisionTwinCard, revisionSessionTitle, formatMarks } from "@/components/RevisionTwinCard";
import { Button, ButtonLink, Field, Panel, Pill, SectionHeading, StatTile, cx } from "@/components/ui";

function signedMarks(value: number): string {
  const mark = formatMarks(Math.abs(value));
  return value >= 0 ? `+${mark}` : `−${mark}`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function RevisionTwinPage() {
  const store = useStore();
  const report = store.revisionTwinReport;
  const active = report.activeSession;
  const [clock, setClock] = useState(() => Date.now());
  const [finishOpen, setFinishOpen] = useState(false);
  const [actualMarks, setActualMarks] = useState("");
  const [actualMinutes, setActualMinutes] = useState("45");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const elapsedMinutes = active
    ? Math.max(0, Math.floor((clock - new Date(active.startedAt).getTime()) / 60_000))
    : 0;
  const calibrationRows = useMemo(() => {
    const completed = report.completedSessions;
    return report.calibrations.map((calibration) => {
      const source = completed.find(
        (session) => revisionTwinKey(session.activity, session.subjectId, session.topicId) === calibration.key,
      );
      return { calibration, source };
    });
  }, [report.calibrations, report.completedSessions]);

  async function finish() {
    if (!active) return;
    const marks = Number(actualMarks);
    const minutes = Number(actualMinutes);
    if (!actualMarks.trim() || !Number.isFinite(marks) || marks < 0) {
      setError("Enter the marks earned in the check (zero is valid). ");
      return;
    }
    if (!actualMinutes.trim() || !Number.isFinite(minutes) || minutes < 1) {
      setError("Enter at least one minute of actual study time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.completeRevisionTwinSession(active.id, marks, minutes);
      const effective = actualMarksForWindow({ ...active, actualMarks: marks, actualMinutes: minutes });
      setNotice(`${signedMarks((effective ?? marks) - active.predictedMarks)} vs forecast — the twin has updated its next ranking.`);
      setFinishOpen(false);
      setActualMarks("");
      setActualMinutes("45");
    } catch {
      setError("Could not save this check. Your active block is still open.");
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await store.abandonRevisionTwinSession(active.id);
    } catch {
      setError("Could not close this block. Try again when you are online or keep revising.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Decision layer</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Revision Digital Twin</h1>
        <p className="text-sm text-ink3 mt-1 max-w-2xl">
          A falsifiable answer to “what should I revise next?” Pick one 45-minute block, run a marked check, and let the model learn whether its forecast was right.
        </p>
      </header>

      {notice ? (
        <div className="card border-success bg-successsoft px-4 py-3 flex items-start justify-between gap-3" role="status" aria-live="polite">
          <p className="text-sm text-ink"><span className="font-semibold">Prediction logged.</span> {notice}</p>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      ) : null}

      <RevisionTwinCard />

      {active ? (
        <Panel className="border-speak">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="speak">Block in progress</Pill>
                <Pill>{elapsedMinutes} min elapsed</Pill>
              </div>
              <h2 className="text-lg font-semibold tracking-tight mt-3">{revisionSessionTitle(active)}</h2>
              <p className="text-sm text-ink3 mt-0.5">
                Forecast: <span className="font-semibold text-ink">+{formatMarks(active.predictedMarks)} marks</span> from {active.plannedMinutes} minutes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href={activityHref(active.activity, active.subjectId, active.topicId)}
                variant="secondary"
                size="sm"
              >
                Open task
              </ButtonLink>
              <Button variant="primary" size="sm" onClick={() => setFinishOpen((open) => !open)}>
                {finishOpen ? "Hide check" : "Finish + check"}
              </Button>
            </div>
          </div>

          {finishOpen ? (
            <div className="mt-4 pt-4 border-t border-line grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <Field label="Marks from the check" hint="Use the marked score, not your confidence.">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={actualMarks}
                  onChange={(event) => setActualMarks(event.target.value)}
                  className="field text-sm"
                  inputMode="decimal"
                  aria-label="Marks from the check"
                  autoFocus
                />
              </Field>
              <Field label="Actual minutes" hint="Include the check itself.">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={actualMinutes}
                  onChange={(event) => setActualMinutes(event.target.value)}
                  className="field text-sm"
                  inputMode="numeric"
                  aria-label="Actual minutes"
                />
              </Field>
              <Button variant="primary" onClick={() => void finish()} disabled={busy}>
                {busy ? "Saving…" : "Update the twin"}
              </Button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-ink3">When you finish, record the score from a short marked check so the prediction can be tested.</p>
            <Button variant="ghost" size="sm" onClick={() => void abandon()} disabled={busy}>Abandon block</Button>
          </div>
          {error ? <p className="text-xs text-danger mt-2" role="alert">{error}</p> : null}
        </Panel>
      ) : null}

      <section>
        <SectionHeading title="Twin health" hint="How closely the last forecasts matched the checks you logged." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Checks" value={report.checks} sub={report.checks ? "closed blocks" : "none yet"} />
          <StatTile
            label="Mean error"
            value={report.meanAbsoluteError == null ? "—" : `${formatMarks(report.meanAbsoluteError)} marks`}
            sub="absolute difference"
            tone={report.meanAbsoluteError != null && report.meanAbsoluteError <= 1 ? "success" : report.checks ? "review" : undefined}
          />
          <StatTile
            label="Model bias"
            value={report.bias == null ? "—" : signedMarks(report.bias)}
            sub={report.bias == null ? "needs a check" : report.bias > 0.2 ? "usually under-forecast" : report.bias < -0.2 ? "usually over-forecast" : "well centred"}
            tone={report.bias != null && Math.abs(report.bias) <= 0.5 ? "success" : report.checks ? "review" : undefined}
          />
          <StatTile
            label="Within ½ mark"
            value={report.hitRate == null ? "—" : `${Math.round(report.hitRate * 100)}%`}
            sub="forecast hit rate"
            tone={report.hitRate != null && report.hitRate >= 0.6 ? "success" : report.checks ? "review" : undefined}
          />
        </div>
      </section>

      <section>
        <SectionHeading title="What the twin has learned" hint="Empirical multipliers are shrunk toward 1× until there is enough evidence." />
        {calibrationRows.length ? (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {calibrationRows.map(({ calibration, source }) => {
                const subject = source ? getSubject(source.subjectId) : null;
                const label = source ? revisionSessionTitle(source) : calibration.key;
                const change = calibration.multiplier - 1;
                return (
                  <li key={calibration.key} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{label}</p>
                      <p className="text-[11px] text-ink3 mt-0.5">{subject?.name ?? "Subject"} · {calibration.sampleSize} check{calibration.sampleSize === 1 ? "" : "s"} · MAE {formatMarks(calibration.mae)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cx("text-sm font-semibold tabular-nums", change >= 0 ? "text-success" : "text-review")}>
                        {calibration.multiplier.toFixed(2)}× forecast
                      </p>
                      <p className="text-[11px] text-ink3">{change >= 0 ? "return is higher" : "return is lower"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <Panel>
            <p className="text-sm font-semibold text-ink">The model starts neutral.</p>
            <p className="text-sm text-ink3 mt-1 max-w-2xl">Complete one block and enter the marks from its check. The next table will show whether this activity tends to return more or fewer marks than expected for you.</p>
          </Panel>
        )}
      </section>

      <section>
        <SectionHeading title="Prediction history" hint="Every closed block becomes evidence for the next decision." />
        {report.completedSessions.length ? (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {report.completedSessions.slice(0, 8).map((session) => {
                const actual = session.actualMarks ?? 0;
                const effective = actualMarksForWindow(session) ?? actual;
                const delta = effective - session.predictedMarks;
                return (
                  <li key={session.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{session.title}</p>
                      <p className="text-[11px] text-ink3 mt-0.5">{formatWhen(session.completedAt ?? session.startedAt)} · {session.actualMinutes ?? session.plannedMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className="text-[11px] text-ink3">forecast / 45m-equivalent</p>
                        <p className="text-sm tabular-nums text-ink">+{formatMarks(session.predictedMarks)} / +{formatMarks(effective)}</p>
                        {session.actualMinutes && session.actualMinutes !== session.plannedMinutes ? (
                          <p className="text-[10px] text-ink3">raw check +{formatMarks(actual)} in {session.actualMinutes}m</p>
                        ) : null}
                      </div>
                      <Pill tone={Math.abs(delta) <= 0.5 ? "success" : "review"}>{signedMarks(delta)}</Pill>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <Panel>
            <p className="text-sm text-ink3">No completed blocks yet. Start the top choice above, then come back with the marked check score.</p>
          </Panel>
        )}
      </section>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How the Digital Twin learns</summary>
        <div className="mt-3 space-y-2 text-sm text-ink3 max-w-3xl">
          <p>The base forecast comes from Revise&apos;s existing marks-per-hour model, normalised to the same 45-minute window for every choice.</p>
          <p>When you enter a marked check score, Revise compares actual marks with the forecast for that activity and topic. A conservative multiplier nudges future forecasts up or down; three neutral prior observations prevent one noisy session from taking over.</p>
          <p>That makes the recommendation measurable: the goal is not to sound intelligent, but to improve marks returned per hour of your revision time.</p>
        </div>
      </details>
    </div>
  );
}
