"use client";

import { useEffect, useMemo, useState } from "react";
import { getSubject } from "@/domain/curriculum";
import {
  eligibleRevisionTwinProofAttempts,
  observedGainForWindow,
  revisionTwinKey,
} from "@/domain/revision-twin";
import { activityHref } from "@/lib/activity";
import { useStore } from "@/state/store";
import { RevisionTwinCard, revisionSessionTitle, formatMarks } from "@/components/RevisionTwinCard";
import { Button, ButtonLink, Panel, Pill, SectionHeading, StatTile, cx } from "@/components/ui";

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
  const proofCandidates = useMemo(
    () => active ? eligibleRevisionTwinProofAttempts(active, store.attempts, store.questions).slice(0, 3) : [],
    [active, store.attempts, store.questions],
  );
  const calibrationRows = useMemo(() => {
    const completed = report.completedSessions;
    return report.calibrations.map((calibration) => {
      const source = completed.find(
        (session) => revisionTwinKey(session.activity, session.subjectId, session.topicId) === calibration.key,
      );
      return { calibration, source };
    });
  }, [report.calibrations, report.completedSessions]);

  async function finishWithProof(attemptId: string) {
    if (!active) return;
    const candidate = proofCandidates.find((row) => row.attempt.id === attemptId);
    if (!candidate) return;
    const minutes = Math.max(1, elapsedMinutes || active.plannedMinutes);
    setBusy(true);
    setError(null);
    try {
      await store.completeRevisionTwinSessionFromAttempt(active.id, attemptId, minutes);
      const effective = observedGainForWindow({
        ...active,
        observedGainMarks: candidate.proof.observedGainMarks,
        actualMinutes: minutes,
        outcomeSource: "trusted-attempt",
      });
      setNotice(`${signedMarks((effective ?? candidate.proof.observedGainMarks) - active.predictedMarks)} vs forecast from a trusted before/after check.`);
      setFinishOpen(false);
    } catch {
      setError("Could not attach that marked check. Your active block is still open.");
    } finally {
      setBusy(false);
    }
  }

  async function finishWithoutProof() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await store.finishRevisionTwinSession(active.id, Math.max(1, elapsedMinutes || active.plannedMinutes));
      setNotice("Block saved without calibration evidence. The forecast was not changed.");
      setFinishOpen(false);
    } catch {
      setError("Could not close this block. Your active block is still open.");
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
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Calibration layer</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Revision Digital Twin</h1>
        <p className="text-sm text-ink3 mt-1 max-w-2xl">
          Today chooses the topic. The Twin audits that decision on the same learning window and only updates its forecast from canonical marked Revise attempts with a trusted pre-block baseline.
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
                {finishOpen ? "Hide proof" : "Finish block"}
              </Button>
            </div>
          </div>

          {finishOpen ? (
            <div className="mt-4 pt-4 border-t border-line space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">Attach trusted proof</p>
                <p className="text-xs text-ink3 mt-0.5 max-w-2xl">
                  Revise will only calibrate from an independent marked attempt completed after this block when it can also find a trusted pre-block attempt on the same target. Typed scores are not accepted as learning evidence.
                </p>
              </div>
              {proofCandidates.length ? (
                <ul className="space-y-2" aria-label="Eligible marked checks">
                  {proofCandidates.map(({ attempt, proof }) => (
                    <li key={attempt.id} className="rounded-[10px] border border-line bg-surface2 px-3 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{proof.actualMarks}/{proof.actualMax} marked</p>
                        <p className="text-[11px] text-ink3 mt-0.5">
                          Baseline {Math.round(proof.baselineAccuracy * 100)}% → {Math.round(proof.observedAccuracy * 100)}% · observed {signedMarks(proof.observedGainMarks)} marks
                        </p>
                      </div>
                      <Button size="sm" variant="primary" onClick={() => void finishWithProof(attempt.id)} disabled={busy}>
                        {busy ? "Saving…" : "Use this check"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[10px] bg-surface2 px-3 py-3">
                  <p className="text-sm text-ink2">No eligible trusted before/after check yet.</p>
                  <p className="text-[11px] text-ink3 mt-1">Open the task and complete a marked question. If there is no comparable trusted baseline, Revise will keep the block in history without changing the forecast.</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => void finishWithoutProof()} disabled={busy}>
                  {busy ? "Saving…" : "Finish without calibration"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-ink3">A completed block is history; only trusted before/after marked evidence changes calibration.</p>
            <Button variant="ghost" size="sm" onClick={() => void abandon()} disabled={busy}>Abandon block</Button>
          </div>
          {error ? <p className="text-xs text-danger mt-2" role="alert">{error}</p> : null}
        </Panel>
      ) : null}

      <section>
        <SectionHeading title="Twin health" hint="How closely forecasts matched trusted before/after evidence." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Trusted checks" value={report.checks} sub={report.unverifiedCompleted ? `${report.unverifiedCompleted} blocks excluded` : report.checks ? "calibration evidence" : "none yet"} />
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
            <p className="text-sm text-ink3 mt-1 max-w-2xl">Complete blocks normally. Calibration starts only when Revise can pair a trusted post-block marked attempt with a trusted pre-block baseline on the same target.</p>
          </Panel>
        )}
      </section>

      <section>
        <SectionHeading title="Prediction history" hint="Closed blocks are retained; only trusted proof changes the forecast." />
        {report.completedSessions.length ? (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {report.completedSessions.slice(0, 8).map((session) => {
                const effective = observedGainForWindow(session);
                const delta = effective == null ? null : effective - session.predictedMarks;
                return (
                  <li key={session.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{session.title}</p>
                      <p className="text-[11px] text-ink3 mt-0.5">{formatWhen(session.completedAt ?? session.startedAt)} · {session.actualMinutes ?? session.plannedMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className="text-[11px] text-ink3">forecast / observed gain</p>
                        <p className="text-sm tabular-nums text-ink">
                          +{formatMarks(session.predictedMarks)} / {effective == null ? "—" : signedMarks(effective)}
                        </p>
                        <p className="text-[10px] text-ink3">
                          {session.outcomeSource === "trusted-attempt" ? "trusted before/after attempt" : "not calibration evidence"}
                        </p>
                      </div>
                      {delta == null ? <Pill>history only</Pill> : <Pill tone={Math.abs(delta) <= 0.5 ? "success" : "review"}>{signedMarks(delta)}</Pill>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <Panel>
            <p className="text-sm text-ink3">No completed blocks yet. Start the aligned task above and finish it with a marked Revise check when possible.</p>
          </Panel>
        )}
      </section>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How the Digital Twin learns</summary>
        <div className="mt-3 space-y-2 text-sm text-ink3 max-w-3xl">
          <p>The base forecast comes from the same recommendation evidence that feeds Today, normalised to the same bounded learning window rather than a separate 45-minute planner.</p>
          <p>A post-block score is not automatically “marks gained”. Revise requires a canonical independent marked attempt plus a trusted pre-block baseline on the same target, then records the before/after accuracy change on the post-check denominator.</p>
          <p>Manual or unsupported results remain visible in history but cannot change calibration. Trusted observations are still shrunk toward the neutral prior so one noisy question cannot take over the next ranking.</p>
        </div>
      </details>
    </div>
  );
}
