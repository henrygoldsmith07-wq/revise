import Link from "next/link";
import type { ReactNode } from "react";
import type { PostSessionClosure as Closure } from "@/domain/post-session-closure";
import { Button, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "./ui";

const NEXT_ACTIONS = {
  mistakes: { href: "/review?mode=mistakes", label: "Review mistakes", tone: "danger" as const },
  practice: { href: "/practice", label: "Practise questions", tone: "success" as const },
  today: { href: "/", label: "Back to today", tone: "accent" as const },
};

export function PostSessionClosure({
  closure,
  title = "Session complete",
  hint,
  secondary = { href: "/", label: "Back to today" },
  extra,
  actions,
}: {
  closure: Closure;
  title?: string;
  hint?: string;
  secondary?: { href: string; label: string };
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  const next = NEXT_ACTIONS[closure.nextAction];
  const scoreTone = closure.scorePercent == null ? undefined : closure.scorePercent >= 85 ? "success" : closure.scorePercent >= 70 ? "review" : "danger";

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div role="status" aria-live="polite">
        <SectionHeading title={title} hint={hint} />
        <Pill tone={next.tone}>{closure.headline}</Pill>
      </div>

      <Panel className="space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile label="Completed" value={`${closure.attempted}/${closure.total}`} sub={`${closure.completionPercent}% of session`} />
          {closure.scorePercent == null ? (
            <StatTile label="Time" value={`${closure.minutes}m`} sub="focused work" />
          ) : (
            <StatTile label="Score" value={`${closure.scorePercent}%`} sub={`${closure.awardedMarks}/${closure.availableMarks} marks`} tone={scoreTone} />
          )}
          <StatTile label="Next" value={next.label} sub={closure.missedMarks ? `${closure.missedMarks} marks to repair` : "keep the gain"} />
        </div>

        <ProgressBar value={closure.completionPercent / 100} label="Session completion" tone={closure.completionPercent === 100 ? "success" : "review"} />

        <div className="rounded-[10px] bg-accentsoft border border-accent/15 px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-accent font-semibold">Close the loop</p>
          <p className="text-sm text-ink2 mt-1">{closure.detail}</p>
        </div>
      </Panel>

      {extra ? <div className="text-xs text-ink3">{extra}</div> : null}

      {actions ?? (
        <div className="flex gap-2">
          <Link href={next.href} className="flex-1">
            <Button variant="primary" className="w-full">
              {next.label}
            </Button>
          </Link>
          <Link href={secondary.href} className="flex-1">
            <Button className="w-full">{secondary.label}</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
