"use client";

import { useMemo } from "react";
import { cardStats, deckStats, retentionVerdict } from "@/domain/card-stats";
import type { Card, ReviewLog } from "@/domain/types";
import { Panel, Pill, ProgressBar, StatTile, cx } from "./ui";

// Statistics that answer a question rather than filling a dashboard: is this
// card worth keeping, and are my intervals right?

const STATE_TONE: Record<string, "success" | "review" | "danger" | undefined> = {
  mastered: "success",
  review: undefined,
  learning: "review",
  leech: "danger",
  new: undefined,
  suspended: undefined,
  buried: "review",
};

const GRADE_COLOUR: Record<string, string> = {
  again: "bg-danger",
  hard: "bg-review",
  good: "bg-accent",
  easy: "bg-success",
};

export function CardStatsPanel({ card, logs }: { card: Card; logs: ReviewLog[] }) {
  const stats = useMemo(() => cardStats(card, logs), [card, logs]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Ease" value={stats.ease.toFixed(2)} sub={`difficulty ${stats.difficulty.toFixed(1)}/10`} />
        <StatTile
          label="Lapses"
          value={stats.lapses}
          sub={stats.lapses >= 4 ? "leech — rewrite it" : "times forgotten"}
          tone={stats.lapses >= 4 ? "danger" : undefined}
        />
        <StatTile label="Reviews" value={stats.reps} sub={`interval ${stats.intervalDays}d`} />
        <StatTile
          label="Recall now"
          value={`${Math.round(stats.retention * 100)}%`}
          sub={`stability ${stats.stability.toFixed(1)}d`}
          tone={stats.retention < 0.7 ? "review" : "success"}
        />
      </div>

      <Panel className="card-2">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Pill tone={STATE_TONE[stats.state]}>{stats.state}</Pill>
          {stats.trueRetention != null ? (
            <Pill>{Math.round(stats.trueRetention * 100)}% recalled on this card</Pill>
          ) : null}
          {stats.medianSeconds != null ? <Pill>{stats.medianSeconds.toFixed(1)}s typical</Pill> : null}
        </div>

        {stats.history.length ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
              Review history · oldest first
            </p>
            <div className="flex gap-0.5 flex-wrap">
              {stats.history.map((entry, i) => (
                <span
                  key={i}
                  title={`${new Date(entry.reviewedAt).toLocaleString("en-GB")} — ${entry.grade} (${entry.seconds.toFixed(1)}s)`}
                  className={cx("h-5 w-2 rounded-[2px]", GRADE_COLOUR[entry.grade])}
                />
              ))}
            </div>
            <p className="text-[11px] text-ink3 mt-2">
              First seen {new Date(stats.firstReviewedAt!).toLocaleDateString("en-GB")} ·{" "}
              {Math.round(stats.totalSeconds)}s spent in total
            </p>
          </>
        ) : (
          <p className="text-sm text-ink3">Never reviewed, so there is nothing to measure yet.</p>
        )}
      </Panel>
    </div>
  );
}

export function DeckStatsPanel({ cards, logs }: { cards: Card[]; logs: ReviewLog[] }) {
  const stats = useMemo(() => deckStats(cards, logs), [cards, logs]);
  const mix = stats.gradeMix;
  const totalGrades = mix.again + mix.hard + mix.good + mix.easy;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatTile label="Cards" value={stats.total} sub={`${stats.due} due now`} />
        <StatTile
          label="True retention"
          value={stats.trueRetention == null ? "—" : `${Math.round(stats.trueRetention * 100)}%`}
          sub={`${stats.reviewsTotal} reviews`}
          tone={
            stats.trueRetention == null ? undefined : stats.trueRetention >= 0.87 ? "success" : "review"
          }
        />
        <StatTile label="Average ease" value={stats.averageEase.toFixed(2)} sub={`stability ${stats.averageStability}d`} />
        <StatTile
          label="Leeches"
          value={stats.leeches}
          sub={stats.leeches ? "forgotten 4+ times" : "none"}
          tone={stats.leeches ? "danger" : undefined}
        />
      </div>

      <Panel>
        <p className="text-sm text-ink2">{retentionVerdict(stats.trueRetention, stats.reviewsTotal)}</p>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Card states</p>
          {(
            [
              ["Mastered", stats.mastered, "success"],
              ["In review", stats.review, "accent"],
              ["Learning", stats.learning, "review"],
              ["New", stats.new, "accent"],
              ["Suspended", stats.suspended, "danger"],
              ["Buried", stats.buried, "review"],
            ] as const
          ).map(([label, value, tone]) =>
            value > 0 ? (
              <div key={label}>
                <div className="flex justify-between text-xs text-ink3 mb-0.5">
                  <span>{label}</span>
                  <span className="tabular-nums">{value}</span>
                </div>
                <ProgressBar value={stats.total ? value / stats.total : 0} tone={tone} />
              </div>
            ) : null,
          )}
        </div>

        {totalGrades > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">
              How you graded · {stats.hoursStudied}h studied
            </p>
            <div className="flex h-2 rounded-full overflow-hidden">
              {(["again", "hard", "good", "easy"] as const).map((grade) =>
                mix[grade] ? (
                  <span
                    key={grade}
                    className={GRADE_COLOUR[grade]}
                    style={{ width: `${(mix[grade] / totalGrades) * 100}%` }}
                    title={`${grade}: ${mix[grade]}`}
                  />
                ) : null,
              )}
            </div>
            <div className="flex gap-3 mt-1.5 text-[11px] text-ink3">
              {(["again", "hard", "good", "easy"] as const).map((grade) => (
                <span key={grade}>
                  {grade} {Math.round((mix[grade] / totalGrades) * 100)}%
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
