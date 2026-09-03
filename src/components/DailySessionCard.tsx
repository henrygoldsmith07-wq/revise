"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildDailySessionPlan, MAX_SESSION_MINUTES } from "@/domain/daily-session";
import { useStore } from "@/state/store";
import { ButtonLink, Panel, Pill, cx } from "./ui";
import { PlayIcon, ICON_SIZE } from "./icons";

// The default daily session: one 18-minute memory session made of labelled
// blocks, driven entirely by the engine — the queue split comes from the
// scheduler's 25% new-card cap, the exam block targets today's weakest topic,
// and the fatigue lock is the planner's own diminishing-returns curve. The
// labelled blocks replace the pile of modes; the other modes still exist
// behind "More" on the study screen.

const PHASE_TONE: Record<string, string> = {
  warmup: "text-ink3",
  reviews: "text-ink",
  "exam-question": "text-ink",
  "mistake-repair": "text-danger",
};

export function DailySessionCard({ subjectIds }: { subjectIds: string[] }) {
  const store = useStore();
  const masteryByTopic = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of store.mastery) map.set(m.topicId, m.mastery);
    return map;
  }, [store.mastery]);

  const plan = useMemo(
    () =>
      buildDailySessionPlan({
        cards: store.cards,
        mistakes: store.mistakes,
        masteryByTopic,
        subjectIds,
      }),
    [store.cards, store.mistakes, masteryByTopic, subjectIds],
  );

  const requested = store.settings.sessionLengthMinutes;
  const capped = Math.min(Math.max(requested, 12), MAX_SESSION_MINUTES);
  const shapeLabel =
    plan.shape === "scaffolded" ? "Scaffolded" : plan.shape === "retrieval" ? "Retrieval" : "Balanced";

  return (
    <Panel className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Today&apos;s session</p>
          <p className="text-lg font-semibold text-ink">
            The {plan.totalMinutes}-minute memory session
          </p>
        </div>
        <Pill tone="accent">{shapeLabel}</Pill>
      </div>

      <ol className="space-y-2">
        {plan.phases.map((phase) => (
          <li key={phase.kind}>
            <Link
              href={phase.href}
              className={cx(
                "flex items-center gap-3 rounded-[8px] border border-line px-3 py-2 transition-colors hover:border-ink3",
              )}
            >
              <span className="tabular-nums text-sm font-semibold text-ink w-10 shrink-0 text-right">
                {phase.minutes}′
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-medium", PHASE_TONE[phase.kind] ?? "text-ink")}>
                  {phase.label}
                </span>
                <span className="block text-xs text-ink3">{phase.why}</span>
                {phase.detail ? <span className="block text-[11px] text-ink3">{phase.detail}</span> : null}
              </span>
              <span className="text-ink3 shrink-0">→</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          {plan.newCount} new, {plan.reviewCount} reviews
        </Pill>
        <Pill tone="accent">
          <PlayIcon size={ICON_SIZE.sm} /> {plan.totalMinutes} min
        </Pill>
        {capped > plan.totalMinutes ? <Pill>capped at {plan.totalMinutes} min</Pill> : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[11px] text-ink3">
          Ends on a question or a card, never on a notes page.
          {plan.totalMinutes >= MAX_SESSION_MINUTES ? ` ${plan.fatigue.message}` : ""}
        </p>
        <ButtonLink href="/review" variant="primary" className="shrink-0">
          Start
        </ButtonLink>
      </div>
    </Panel>
  );
}
