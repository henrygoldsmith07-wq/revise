"use client";

import { useMemo } from "react";
import { missionContinuation } from "@/domain/mission-session";
import { checkpointReviewedCount, revisionActivityLabel } from "@/domain/revision-checkpoint";
import { useStoreFields } from "@/state/store";
import { Button, ButtonLink, Panel, Pill, ProgressBar } from "@/components/ui";
import { captureProductEvent } from "@/lib/product-telemetry";

/**
 * The interrupted run. Full size it leads Today (the day it was left);
 * `compact` is the line beneath the day's recommendation on a later day.
 */
export function ResumeRevisionCard({ compact = false }: { compact?: boolean } = {}) {
  const store = useStoreFields("attempts", "clearRevisionCheckpoint", "reviewLogs", "revisionCheckpoint");
  const checkpoint = store.revisionCheckpoint;
  // A mission step saved mid-way reopens the same questions and support at its first unanswered one.
  const mission = useMemo(() => missionContinuation(checkpoint, store.attempts), [checkpoint, store.attempts]);

  if (!checkpoint) return null;

  const next = mission ? mission.position + 1 : Math.min(checkpoint.total, checkpoint.position + 1);
  const progress = mission ? mission.position / mission.total : checkpoint.total ? checkpoint.position / checkpoint.total : 0;
  const progressLabel = mission ? `${mission.position} of ${mission.total} answered` : checkpoint.activity === "review"
    ? `${Math.min(checkpoint.total, checkpointReviewedCount(checkpoint, store.reviewLogs))} of ${checkpoint.total} reviewed`
    : checkpoint.activity === "adaptive"
      // Adaptive positions count whole steps (a step can hold several cards),
      // so say "step" — "Position 1 of 3" read as if finished cards were lost.
      ? `${checkpoint.position} of ${checkpoint.total} steps done`
      : `Position ${next} of ${checkpoint.total}`;

  const resumeLabel = mission ? "Continue mission" : "Resume";
  const actions = (
    <div className="flex items-center gap-2 shrink-0">
      <ButtonLink
        href={checkpoint.href}
        size="sm"
        onClick={() => captureProductEvent("session.returned", { kind: checkpoint.activity })}
      >
        {resumeLabel}
      </ButtonLink>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          captureProductEvent("session.abandoned", { kind: checkpoint.activity });
          void store.clearRevisionCheckpoint();
        }}
      >
        Dismiss
      </Button>
    </div>
  );

  if (compact) {
    const when = lastActive(checkpoint.updatedAt);
    return (
      <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="resume-later">
        <p className="min-w-56 flex-1 text-sm text-ink2">
          <span className="font-medium text-ink">Left unfinished {/ago$|now$/.test(when) ? when : `on ${when}`}:</span>{" "}
          {mission ? "an exam mission step" : revisionActivityLabel(checkpoint.activity).toLowerCase()}
          {mission || checkpoint.total ? `, ${progressLabel.charAt(0).toLowerCase()}${progressLabel.slice(1)}` : ""}.
        </p>
        {actions}
      </div>
    );
  }

  return (
    <Panel className="border-accent/40 bg-accentsoft/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* min-w-56 (not min-w-0): at 360px the buttons wrap below the text instead of squeezing it to one word per line. */}
        <div className="min-w-56 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">{mission ? "Mission in progress" : "Interrupted"}</Pill>
            <span className="text-xs text-ink3">{mission ? `Exam mission${mission.stage ? ` · ${mission.stage.replace(/-/g, " ")}` : ""}` : revisionActivityLabel(checkpoint.activity)}</span>
          </div>
          <h2 className="text-sm font-semibold text-ink mt-2">{mission ? "Continue mission" : "Resume interrupted revision"}</h2>
          <p className="text-sm text-ink2 mt-0.5 truncate">{checkpoint.title}</p>
          <p className="text-[11px] text-ink3 mt-1">
            {mission
              ? `Same questions and hints, from question ${next} of ${mission.total}`
              : checkpoint.total
              ? `Continue at ${checkpoint.activity === "adaptive" ? "step " : ""}${next} of ${checkpoint.total}`
              : "Continue where you stopped"} · last active {lastActive(checkpoint.updatedAt)}
          </p>
        </div>
        {actions}
      </div>
      {mission || checkpoint.total ? <ProgressBar value={progress} label={progressLabel} /> : null}
    </Panel>
  );
}

function lastActive(iso: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
}
