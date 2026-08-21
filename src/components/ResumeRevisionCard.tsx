"use client";

import { revisionActivityLabel } from "@/domain/revision-checkpoint";
import { useStore } from "@/state/store";
import { Button, ButtonLink, Panel, Pill, ProgressBar } from "@/components/ui";

export function ResumeRevisionCard() {
  const store = useStore();
  const checkpoint = store.revisionCheckpoint;

  if (!checkpoint) return null;

  const next = Math.min(checkpoint.total, checkpoint.position + 1);
  const progress = checkpoint.total ? checkpoint.position / checkpoint.total : 0;
  const progressLabel = checkpoint.activity === "review"
    ? `${checkpoint.position} of ${checkpoint.total} reviewed`
    : `Position ${next} of ${checkpoint.total}`;

  return (
    <Panel className="border-accent/40 bg-accentsoft/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">Interrupted</Pill>
            <span className="text-xs text-ink3">{revisionActivityLabel(checkpoint.activity)}</span>
          </div>
          <h2 className="text-sm font-semibold text-ink mt-2">Resume interrupted revision</h2>
          <p className="text-sm text-ink2 mt-0.5 truncate">{checkpoint.title}</p>
          <p className="text-[11px] text-ink3 mt-1">
            {checkpoint.total ? `Continue at ${next} of ${checkpoint.total}` : "Continue where you stopped"} · last active {lastActive(checkpoint.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ButtonLink href={checkpoint.href} size="sm">Resume</ButtonLink>
          <Button size="sm" variant="ghost" onClick={() => void store.clearRevisionCheckpoint()}>
            Dismiss
          </Button>
        </div>
      </div>
      {checkpoint.total ? <ProgressBar value={progress} label={progressLabel} /> : null}
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
