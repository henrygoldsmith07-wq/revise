"use client";

import { getTopic } from "@/domain/curriculum";
import type { PaperAutopsy } from "@/domain/paper-autopsy";
import { BreakdownList, type BreakdownRow } from "./BreakdownList";
import { PaperRecoveryPanel } from "./PaperRecoveryPanel";
import { Button, ButtonLink, Panel, Pill, SectionHeading, StatTile } from "./ui";

const asRows = (rows: PaperAutopsy["byTopic"]): BreakdownRow[] =>
  rows.map((row) => ({ key: row.key, label: row.label, marks: row.marksLost, share: row.share }));

export function autopsyHref(runId: string, step?: string): string {
  const params = new URLSearchParams({ autopsy: runId });
  if (step) params.set("step", step);
  return `/practice?${params.toString()}`;
}

/**
 * Where a paper sitting lost its marks, the repair plan, and the equivalent retest.
 * `onNavigate` lets a host that must save state first (the paper runner) take over the links.
 */
export function PaperAutopsyPanel({ autopsy, onNavigate }: { autopsy: PaperAutopsy; onNavigate?: (href: string) => void }) {
  const runId = autopsy.paperRunId;
  const action = (href: string, label: string, variant: "primary" | "secondary") =>
    onNavigate ? (
      <Button size="sm" variant={variant} className="shrink-0" onClick={() => onNavigate(href)}>{label}</Button>
    ) : (
      <ButtonLink href={href} size="sm" variant={variant} className="shrink-0">{label}</ButtonLink>
    );
  if (!autopsy.hasEvidence) {
    return (
      <section aria-label="Paper autopsy">
        <Panel>
          <p className="text-sm font-semibold text-ink">Paper autopsy</p>
          <p className="text-xs text-ink3 mt-1">No trusted marked answers from this sitting yet, so there is nothing to break down.</p>
        </Panel>
      </section>
    );
  }
  const retest = autopsy.equivalentRetest;

  return (
    <section aria-labelledby="paper-autopsy-heading" className="space-y-4">
      <SectionHeading title="Paper autopsy" hint="Exactly where this paper lost marks, and the plan to win them back." />
      <Panel className="space-y-5">
        <h2 id="paper-autopsy-heading" className="sr-only">Paper autopsy: {autopsy.title}</h2>
        {autopsy.headline.lines.length ? (
          <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3 flex flex-wrap items-center justify-between gap-3">
            <ul className="min-w-0 space-y-0.5 text-sm text-ink">
              {autopsy.headline.lines.map((line, index) => <li key={line} className={index === 0 ? "font-semibold" : "text-ink2"}>{line}</li>)}
            </ul>
            {autopsy.headline.next && runId ? action(autopsyHref(runId, autopsy.headline.next.stepId), `Recover the next ${autopsy.headline.next.marks} mark${autopsy.headline.next.marks === 1 ? "" : "s"}`, "primary") : null}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Scored" value={`${autopsy.marksGained}/${autopsy.marksAvailable}`} sub={autopsy.accuracy !== null ? `${Math.round(autopsy.accuracy * 100)}%` : undefined} />
          <StatTile label="Marks lost" value={autopsy.marksLost} tone={autopsy.marksLost ? "danger" : "success"} />
          <StatTile label="Questions with losses" value={autopsy.lostQuestions.length} />
        </div>
        {autopsy.paperId ? <PaperRecoveryPanel paperId={autopsy.paperId} title={autopsy.title} withMission /> : null}

        {autopsy.marksLost ? (
          <div className="grid gap-5 md:grid-cols-2">
            <BreakdownList title="By topic" rows={asRows(autopsy.byTopic)} />
            <BreakdownList title="By skill" rows={asRows(autopsy.bySkill)} />
            <BreakdownList title="By error type" rows={asRows(autopsy.byErrorType)} />
            <BreakdownList title="By question type" rows={asRows(autopsy.byQuestionType)} />
          </div>
        ) : null}

        {autopsy.repairPlan.length ? (
          <div>
            <h3 className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Repair plan</h3>
            <ol className="space-y-2">
              {autopsy.repairPlan.map((step, index) => (
                <li key={step.id} className="card card-2 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {index + 1}. {getTopic(step.topicId)?.title ?? step.topicId}
                    </p>
                    <p className="text-[11px] text-ink3 mt-0.5">
                      {step.marksToRecover} marks to recover · {step.resitIds.length} re-sit{step.resitIds.length === 1 ? "" : "s"}
                      {step.freshIds.length ? ` + ${step.freshIds.length} new` : ""} · about {step.minutes} min
                    </p>
                    {step.focus.length ? <p className="text-xs text-ink2 mt-1">Missed: {step.focus.join("; ")}</p> : null}
                  </div>
                  {runId ? action(autopsyHref(runId, step.id), "Start repair", "secondary") : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {autopsy.marksLost ? (
          <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">Equivalent retest</p>
                <Pill tone={retest.available ? "accent" : "neutral"}>{retest.available ? `${retest.questionIds.length} questions · ${retest.totalMarks} marks` : "Not ready"}</Pill>
              </div>
              <p className="text-xs text-ink2 mt-1">{retest.summary}</p>
              {retest.available ? <p className="text-[11px] text-ink3 mt-1">Different questions matched on topic, marks and difficulty. Sit it after the repair steps, ideally a couple of days later.</p> : null}
            </div>
            {retest.available && runId ? action(autopsyHref(runId, "retest"), "Start retest", "primary") : null}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
