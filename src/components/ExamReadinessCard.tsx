"use client";

import Link from "next/link";
import { getSubject } from "@/domain/curriculum";
import type { ExamReadiness, ExamReadinessStatus, ReadinessAction, ReadinessSignalStatus } from "@/domain/exam-readiness";
import { useStore } from "@/state/store";
import { ButtonLink, Panel, Pill, ProgressBar, SectionHeading, StatTile, cx } from "./ui";

const STATUS_LABEL: Record<ExamReadinessStatus, string> = {
  ready: "Ready to prove",
  "nearly-ready": "Nearly ready",
  "at-risk": "At risk",
  "building-evidence": "Build evidence",
};

const SIGNAL_LABEL: Record<ReadinessSignalStatus, string> = {
  strong: "strong",
  watch: "watch",
  "at-risk": "gap",
  missing: "missing",
};

function statusTone(status: ExamReadinessStatus): "neutral" | "success" | "review" | "danger" {
  if (status === "ready") return "success";
  if (status === "at-risk") return "danger";
  if (status === "nearly-ready") return "review";
  return "neutral";
}
function signalTone(status: ReadinessSignalStatus): "neutral" | "success" | "review" | "danger" {
  if (status === "strong") return "success";
  if (status === "at-risk") return "danger";
  if (status === "watch") return "review";
  return "neutral";
}

function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}/100`;
}

function examCountdown(days: number | null): string {
  if (days == null) return "No exam date set";
  if (days === 0) return "Exam today";
  if (days === 1) return "Exam tomorrow";
  return `Exam in ${days} days`;
}

function actionHref(subjectId: string, action: ReadinessAction): string {
  const subject = encodeURIComponent(subjectId);
  switch (action) {
    case "review":
      return `/review?subject=${subject}`;
    case "timed":
      return `/practice?subject=${subject}&mode=practice`;
    case "transfer":
      return "/progress";
    case "practice":
      return `/practice?subject=${subject}`;
  }
}

function readinessSummaryText(summary: { subjectCount: number; readyCount: number; atRiskCount: number; confidence: number }): string {
  if (!summary.subjectCount) return "Choose a subject to start collecting evidence.";
  if (summary.confidence < 0.35) return "Early estimate — marked work will make this passport trustworthy.";
  if (summary.atRiskCount) return `${summary.atRiskCount} subject${summary.atRiskCount === 1 ? " is" : "s are"} carrying a clear exam-day risk.`;
  if (summary.readyCount === summary.subjectCount) return "Every selected subject has enough evidence to face a proof set.";
  return `${summary.readyCount}/${summary.subjectCount} subject${summary.subjectCount === 1 ? " has" : "s have"} enough evidence to face a proof set.`;
}

function SubjectReadiness({ row }: { row: ExamReadiness }) {
  const subject = getSubject(row.subjectId);
  const action = row.nextAction;
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink truncate">{subject?.name ?? row.subjectId}</h3>
            <Pill tone={statusTone(row.status)}>{STATUS_LABEL[row.status]}</Pill>
          </div>
          <p className="text-[11px] text-ink3 mt-0.5">
            {row.predictedGrade} predicted at {row.predictedPercent}%
            {row.targetGrade ? ` · ${row.targetGrade} target` : " · inferred next boundary"}
            {row.examDays != null ? ` · ${examCountdown(row.examDays)}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-semibold tabular-nums text-ink">{scoreLabel(row.score)}</p>
          <p className="text-[10px] uppercase tracking-wide text-ink3">readiness</p>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={row.score} label={`${subject?.name ?? row.subjectId} readiness`} tone={statusTone(row.status) === "danger" ? "danger" : statusTone(row.status) === "review" ? "review" : statusTone(row.status) === "success" ? "success" : "accent"} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
        {row.signals.map((signal) => (
          <div key={signal.key} className="rounded-[9px] bg-surface2 px-3 py-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-ink2 truncate">{signal.label}</p>
              <Pill tone={signalTone(signal.status)}>{SIGNAL_LABEL[signal.status]}</Pill>
            </div>
            <p className="text-[11px] text-ink3 mt-1 truncate" title={signal.evidence}>{signal.evidence}</p>
            <div className="mt-2">
              <ProgressBar value={signal.score} label={`${signal.label} score`} />
            </div>
          </div>
        ))}
      </div>

      {row.blockers.length ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">What is holding it back</p>
          <ul className="space-y-1.5">
            {row.blockers.slice(0, 3).map((blocker) => (
              <li key={`${row.subjectId}:${blocker.key}`} className="flex items-start gap-2 text-xs">
                <span className={cx("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", blocker.severity === "high" ? "bg-danger" : "bg-review")} aria-hidden />
                <span className="min-w-0 text-ink2"><span className="font-semibold">{blocker.title}.</span> {blocker.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-line">
        <p className="text-[11px] text-ink3">Evidence confidence {Math.round(row.confidence * 100)}% · {row.evidence.attempts} marked answers · {row.evidence.transferChecks} transfer checks</p>
        <ButtonLink href={actionHref(row.subjectId, action.action)} size="sm" variant={row.status === "at-risk" ? "primary" : "secondary"}>
          {action.label}
        </ButtonLink>
      </div>
    </li>
  );
}

export function ExamReadinessCard({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const rows = store.examReadiness;
  const summary = store.examReadinessSummary;
  const weakest = rows.length ? [...rows].sort((a, b) => a.score - b.score)[0] : null;
  const weakestSubject = weakest ? getSubject(weakest.subjectId) : null;

  if (compact) {
    return (
      <Panel className="relative overflow-hidden border-accent">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Pill tone="accent">USP · evidence</Pill>
              <Pill tone={statusTone(summary.status)}>{STATUS_LABEL[summary.status]}</Pill>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Exam Readiness Passport</h2>
            <p className="text-sm text-ink3 mt-0.5 max-w-2xl">Know whether your marks will hold when the paper is timed and unfamiliar.</p>
          </div>
          <Link href="/readiness" className="text-xs font-semibold text-ink2 hover:text-ink hover:underline shrink-0">Open passport →</Link>
        </div>
        <div className="mt-4 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-center">
          <div>
            <div className="flex items-baseline justify-between gap-3 text-xs mb-1.5">
              <span className="font-semibold text-ink2">{scoreLabel(summary.score)} overall readiness</span>
              <span className="text-ink3">{summary.subjectCount ? `${summary.readyCount}/${summary.subjectCount} ready` : "No subjects"}</span>
            </div>
            <ProgressBar value={summary.score} label="Overall exam readiness" tone={statusTone(summary.status) === "danger" ? "danger" : statusTone(summary.status) === "review" ? "review" : statusTone(summary.status) === "success" ? "success" : "accent"} />
            <p className="text-[11px] text-ink3 mt-2">{readinessSummaryText(summary)}</p>
          </div>
          {weakest ? (
            <div className="rounded-[9px] bg-surface2 px-3 py-2.5 sm:min-w-52">
              <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">Weakest passport</p>
              <p className="text-sm font-semibold text-ink truncate mt-0.5">{weakestSubject?.name ?? weakest.subjectId}</p>
              <p className="text-[11px] text-ink3 mt-0.5">{weakest.nextAction.label}</p>
            </div>
          ) : null}
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Pill tone="accent">Evidence, not vibes</Pill>
              <Pill tone={statusTone(summary.status)}>{STATUS_LABEL[summary.status]}</Pill>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Your exam readiness is {scoreLabel(summary.score)}</h2>
            <p className="text-sm text-ink3 mt-1 max-w-2xl">{readinessSummaryText(summary)} The passport separates outcome, knowledge, recall, pace and transfer so you can see exactly what still needs proof.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <StatTile label="Subjects" value={summary.subjectCount} sub={`${summary.readyCount} ready`} />
            <StatTile label="Evidence" value={`${Math.round(summary.confidence * 100)}%`} sub="confidence" tone={summary.confidence >= 0.65 ? "success" : summary.confidence >= 0.35 ? "review" : undefined} />
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar value={summary.score} label="Overall exam readiness" tone={statusTone(summary.status) === "danger" ? "danger" : statusTone(summary.status) === "review" ? "review" : statusTone(summary.status) === "success" ? "success" : "accent"} />
        </div>
      </Panel>

      {rows.length ? (
        <section>
          <SectionHeading title="Readiness by subject" hint="A subject is ready only when its forecast has enough proof behind it." />
          <ul className="card divide-y divide-line">
            {rows.map((row) => <SubjectReadiness key={row.subjectId} row={row} />)}
          </ul>
        </section>
      ) : (
        <Panel>
          <p className="text-sm font-semibold text-ink">Choose a subject to start your passport.</p>
          <p className="text-sm text-ink3 mt-1">Once Revise has a syllabus and a few marked answers, this page will show whether your grade survives timing and unfamiliar questions.</p>
          <ButtonLink href="/settings" size="sm" variant="primary" className="mt-3">Choose subjects</ButtonLink>
        </Panel>
      )}
    </div>
  );
}
