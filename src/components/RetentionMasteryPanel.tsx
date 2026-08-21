"use client";

import Link from "next/link";
import { useMemo } from "react";
import { retentionMasteryLabel, retentionMasteryReport } from "@/domain/retention-mastery";
import type { RetentionMasteryBand, RetentionTrend } from "@/domain/retention-mastery";
import { useStore } from "@/state/store";
import { Button, Panel, Pill, ProgressBar, SectionHeading, cx } from "./ui";

const CHECKPOINT_LABELS = new Map([[1, "1 day"], [7, "7 days"], [30, "30 days"]]);

export function RetentionMasteryPanel() {
  const store = useStore();
  const report = useMemo(() => {
    const subjectIds = new Set(store.settings.subjectIds);
    const cards = store.cards.filter((card) => subjectIds.has(card.subjectId));
    const cardIds = new Set(cards.map((card) => card.id));
    const reviewLogs = store.reviewLogs.filter((log) => cardIds.has(log.cardId));
    return retentionMasteryReport({ reviewLogs, cards });
  }, [store.cards, store.reviewLogs, store.settings.subjectIds]);

  const tone = bandTone(report.band);
  const trend = trendLabel(report.trend);

  return (
    <Panel>
      <SectionHeading
        title="Retention mastery"
        hint="Measured recall from your real review history — not predicted mastery."
        action={
          <Link href="/review">
            <Button size="sm">Review due cards</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-semibold tabular-nums text-ink">
              {report.measuredRetention == null ? "—" : `${Math.round(report.measuredRetention * 100)}%`}
            </p>
            <Pill tone={tone}>{retentionMasteryLabel(report.band)}</Pill>
          </div>
          <p className="text-xs text-ink3 mt-1">
            {report.evidenceReviews} reviews in the 30-day window · target {Math.round(report.target * 100)}%
          </p>
        </div>
        {report.measuredRetention != null ? (
          <p className={cx("text-xs font-semibold", report.gapToTarget != null && report.gapToTarget < 0 ? "text-review" : "text-success")}>
            {report.gapToTarget != null && report.gapToTarget >= 0 ? "+" : ""}
            {report.gapToTarget == null ? "" : `${Math.round(report.gapToTarget * 100)}pp vs target`}
          </p>
        ) : null}
      </div>

      {report.measuredRetention != null ? (
        <div className="mt-4">
          <ProgressBar
            value={report.measuredRetention}
            label="Measured recall"
            tone={report.band === "secure" ? "success" : report.band === "needs-work" ? "danger" : "review"}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] bg-surface2 px-3 py-2.5 text-xs text-ink2">
          Retention becomes a useful measure after 20 reviews in the last 30 days. Until then, the dashboard will not
          turn a small sample into a score.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        {report.checkpoints.map((checkpoint) => (
          <div key={checkpoint.checkpoint} className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
              {CHECKPOINT_LABELS.get(checkpoint.checkpoint)}
            </p>
            <p className="text-lg font-semibold tabular-nums text-ink mt-1">
              {checkpoint.retention == null ? "—" : `${Math.round(checkpoint.retention * 100)}%`}
            </p>
            <p className="text-[11px] text-ink3">
              {checkpoint.reviews} {checkpoint.reviews === 1 ? "review" : "reviews"}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink2 mt-4">{report.narrative}</p>
      <p className="text-xs text-ink3 mt-1">Next: {report.nextAction}{trend ? ` · ${trend}` : ""}</p>
    </Panel>
  );
}

function bandTone(band: RetentionMasteryBand): "success" | "review" | "danger" | "neutral" {
  if (band === "secure") return "success";
  if (band === "needs-work") return "danger";
  if (band === "building") return "review";
  return "neutral";
}

function trendLabel(trend: RetentionTrend): string {
  if (trend === "improving") return "7-day recall is improving";
  if (trend === "slipping") return "7-day recall is slipping";
  if (trend === "steady") return "7-day recall is steady";
  return "";
}
