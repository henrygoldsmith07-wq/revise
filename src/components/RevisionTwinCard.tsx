"use client";

import Link from "next/link";
import { useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { ACTIVITY_LABEL } from "@/domain/recommender";
import { REVISION_TWIN_MINUTES, type RevisionTwinChoice } from "@/domain/revision-twin";
import { useStore } from "@/state/store";
import type { ActivityKind } from "@/domain/types";
import { Button, ButtonLink, Panel, Pill, cx } from "./ui";

function formatMarks(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1);
}

export function revisionChoiceTitle(choice: Pick<RevisionTwinChoice, "activity" | "subjectId" | "topicId">): string {
  const subject = getSubject(choice.subjectId);
  const topic = choice.topicId ? getTopic(choice.topicId) : null;
  if (topic) return `${subject?.name ?? choice.subjectId} · ${topic.title}`;
  return `${subject?.name ?? choice.subjectId} · ${ACTIVITY_LABEL[choice.activity]}`;
}

export function revisionSessionTitle(session: { activity: ActivityKind; subjectId: string; topicId?: string; title: string }): string {
  if (session.title && session.title !== "Revision block") return session.title;
  return revisionChoiceTitle(session);
}

function activityHint(activity: ActivityKind): string {
  switch (activity) {
    case "flashcards":
      return "spaced retrieval";
    case "recall":
      return "active recall";
    case "practice":
      return "exam questions";
    case "paper":
      return "timed paper";
    case "mistakes":
      return "mistake repair";
    case "learn":
      return "first pass";
  }
}

function confidenceCopy(sampleSize: number): { label: string; tone: "neutral" | "success" | "review" } {
  if (sampleSize >= 5) return { label: "Calibrated", tone: "success" };
  if (sampleSize >= 2) return { label: "Learning", tone: "review" };
  return { label: "Early estimate", tone: "neutral" };
}

function ChoiceList({ compact }: { compact: boolean }) {
  const store = useStore();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = store.revisionTwinReport.activeSession;
  const choices = store.revisionTwinChoices.slice(0, 4);

  async function start(choice: RevisionTwinChoice) {
    if (active || starting) return;
    setStarting(choice.key);
    setError(null);
    try {
      await store.startRevisionTwinSession(choice, revisionChoiceTitle(choice));
    } catch {
      setError("Could not start this block. Your existing revision data is still safe.");
    } finally {
      setStarting(null);
    }
  }

  if (!choices.length) {
    return (
      <div className="rounded-[10px] bg-surface2 px-4 py-4 text-sm text-ink2">
        Set an exam date or complete a marked question and the twin will have enough evidence to rank your next block.
      </div>
    );
  }

  return (
    <div>
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-3 pb-2 text-[10px] uppercase tracking-wide text-ink3 font-semibold">
        <span>Choice</span>
        <span>Predicted benefit</span>
        <span className="sr-only">Action</span>
      </div>
      <ol className="space-y-2" aria-label={`${REVISION_TWIN_MINUTES}-minute revision choices`}>
        {choices.map((choice, index) => {
          const confidence = confidenceCopy(choice.sampleSize);
          const title = revisionChoiceTitle(choice);
          const disabled = Boolean(active) || starting !== null;
          return (
            <li key={choice.key} className="rounded-[10px] border border-line bg-surface px-3 py-3 sm:px-3.5">
              <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-surface2 text-ink3 grid place-items-center text-xs font-semibold tabular-nums shrink-0" aria-hidden>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{title}</p>
                    <p className="text-[11px] text-ink3 mt-0.5">
                      {activityHint(choice.activity)} · {choice.sampleSize ? `${choice.sampleSize} checked` : "no checks yet"}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right pl-9 sm:pl-0">
                  <p className="text-base sm:text-lg font-semibold tabular-nums text-ink">+{formatMarks(choice.predictedMarks)}</p>
                  <p className="text-[10px] text-ink3">expected marks</p>
                </div>
                <Button
                  size="sm"
                  variant={index === 0 ? "primary" : "secondary"}
                  onClick={() => void start(choice)}
                  disabled={disabled}
                  aria-label={`Start ${title} for ${REVISION_TWIN_MINUTES} minutes`}
                  className="w-full sm:w-auto"
                >
                  {starting === choice.key ? "Starting…" : active ? "Block active" : "Start"}
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-2 pl-9 sm:pl-9">
                <Pill tone={confidence.tone}>{confidence.label}</Pill>
                <span className="text-[11px] text-ink3 tabular-nums">+{formatMarks(choice.marksPerHour)}/h {choice.sampleSize ? "calibrated" : "baseline"}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {error ? <p className="text-xs text-danger mt-2" role="alert">{error}</p> : null}
      {!compact && store.revisionTwinReport.activeSession ? (
        <p className="text-xs text-ink3 mt-3">Finish the active block below before starting another choice.</p>
      ) : null}
    </div>
  );
}

export function RevisionTwinCard({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const active = store.revisionTwinReport.activeSession;
  const checks = store.revisionTwinReport.checks;

  return (
    <Panel className={cx("relative overflow-hidden", compact && "border-ink3")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Pill tone="accent">Decision system</Pill>
            <Pill>{REVISION_TWIN_MINUTES} min</Pill>
            {checks ? <Pill tone="success">{checks} check{checks === 1 ? "" : "s"} logged</Pill> : null}
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">Revision Digital Twin</h2>
          <p className="text-sm text-ink3 mt-0.5 max-w-2xl">
            You have {REVISION_TWIN_MINUTES} minutes. Spend them where the model expects the most assessment marks back.
          </p>
        </div>
        <Link href="/twin" className="text-xs font-semibold text-ink2 hover:text-ink hover:underline shrink-0">
          Open full twin →
        </Link>
      </div>

      {active ? (
        <div className="mt-4 rounded-[10px] border border-speak bg-speaksoft px-3.5 py-3 flex flex-wrap items-center justify-between gap-3" role="status" aria-live="polite">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-speak font-semibold">Block in progress</p>
            <p className="text-sm font-semibold text-ink truncate mt-0.5">{revisionSessionTitle(active)}</p>
            <p className="text-[11px] text-ink3 mt-0.5">Predicted +{formatMarks(active.predictedMarks)} marks · log the check when you finish.</p>
          </div>
          <ButtonLink href="/twin" size="sm" variant="secondary">Finish block</ButtonLink>
        </div>
      ) : null}

      <div className="mt-4">
        <ChoiceList compact={compact} />
      </div>

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink3">
          {checks ? "Each check tightens the next ranking." : "After revision, record the check score so the twin can learn."}
        </p>
        <Link href="/twin" className="text-[11px] font-semibold text-ink2 hover:text-ink hover:underline">
          See prediction history →
        </Link>
      </div>
    </Panel>
  );
}

export { formatMarks };
