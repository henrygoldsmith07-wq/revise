"use client";

import { useMemo } from "react";
import { forgettingCurve, MASTERED_STABILITY_DAYS } from "@/domain/scheduling";
import { Pill } from "./ui";

// ---------------------------------------------------------------------------
// Forgetting-curve visualization.
//
// Mastery percentages are abstract; the decay curve is not. This renders the
// actual FSRS forgetting curve R(t) = (1 + 19/81 · t/S)^-0.5 as an SVG path so
// the student can *see* when their memory of a topic is predicted to fall
// below the recall line — turning the scheduler's maths into a visible,
// personal deadline ("you will forget most of this by Thursday").
//
// Pure render: every point is computed from card stability via the same
// forgettingCurve() the scheduler uses, so the picture can never disagree
// with the review queue.
// ---------------------------------------------------------------------------

/** Aggregated decay state for a set of cards (a topic or a whole subject). */
export interface CurveStats {
  /** Mean predicted retrievability right now (0–1). */
  retentionNow: number;
  /** Days from `now` until mean retention crosses the 90% recall line (null = already below). */
  daysTo90: number | null;
  /** Days until mean retention crosses 70% — the "get ahead of this" marker. */
  daysTo70: number | null;
  /** Mean stability in days (memory strength). */
  stability: number;
  cards: number;
}

export function curveStats(
  cards: { stability: number; lastReviewedAt: string | null }[],
  now: Date,
  horizonDays = 30,
): CurveStats {
  const reviewed = cards.filter((c) => c.lastReviewedAt && c.stability > 0);
  if (!reviewed.length) {
    return { retentionNow: 0, daysTo90: null, daysTo70: null, stability: 0, cards: cards.length };
  }
  const start = now.getTime();
  // Mean retention over the horizon, sampled daily.
  const sample = (days: number) =>
    reviewed.reduce((acc, c) => {
      const elapsed = (start - new Date(c.lastReviewedAt!).getTime()) / 86_400_000 + days;
      return acc + forgettingCurve(Math.max(0, elapsed), c.stability);
    }, 0) / reviewed.length;
  const retentionNow = sample(0);
  let daysTo90: number | null = null;
  let daysTo70: number | null = null;
  for (let d = 0; d <= horizonDays; d++) {
    const r = sample(d);
    if (daysTo90 == null && r < 0.9) daysTo90 = d;
    if (daysTo70 == null && r < 0.7) {
      daysTo70 = d;
      break;
    }
  }
  const stability = reviewed.reduce((a, c) => a + c.stability, 0) / reviewed.length;
  return { retentionNow, daysTo90, daysTo70, stability, cards: cards.length };
}

const W = 320;
const H = 120;
const PAD_L = 30;
const PAD_B = 20;

interface CurveProps {
  stats: CurveStats;
  /** Cards feeding the curve — the render path samples their aggregate. */
  cards: { stability: number; lastReviewedAt: string | null }[];
  now: Date;
  horizonDays?: number;
  /** Rendered width via viewBox scaling; the layout decides the box. */
  className?: string;
}

export function ForgettingCurveChart({ stats, cards, now, horizonDays = 30, className }: CurveProps) {
  const { path, areaPath, y90, y70 } = useMemo(() => {
    const reviewed = cards.filter((c) => c.lastReviewedAt && c.stability > 0);
    const sample = (days: number) =>
      reviewed.length
        ? reviewed.reduce((acc, c) => {
            const elapsed = (now.getTime() - new Date(c.lastReviewedAt!).getTime()) / 86_400_000 + days;
            return acc + forgettingCurve(Math.max(0, elapsed), c.stability);
          }, 0) / reviewed.length
        : 0;
    const pts: [number, number][] = [];
    for (let d = 0; d <= horizonDays; d++) {
      const r = sample(d);
      const x = PAD_L + (d / horizonDays) * (W - PAD_L - 8);
      const y = PAD_L / 2 + (1 - r) * (H - PAD_B - PAD_L / 2);
      pts.push([x, y]);
    }
    const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${pts[pts.length - 1][0].toFixed(1)},${H - PAD_B} L${pts[0][0].toFixed(1)},${H - PAD_B} Z`;
    const yOf = (r: number) => PAD_L / 2 + (1 - r) * (H - PAD_B - PAD_L / 2);
    return { path, areaPath, y90: yOf(0.9), y70: yOf(0.7) };
  }, [cards, now, horizonDays]);

  if (!cards.some((c) => c.lastReviewedAt && c.stability > 0)) {
    return (
      <p className="text-sm text-ink3">
        No reviews yet — the curve appears once you have reviewed cards in this {stats.cards ? "topic" : "subject"}.
      </p>
    );
  }

  const day90X = stats.daysTo90 != null ? PAD_L + (stats.daysTo90 / horizonDays) * (W - PAD_L - 8) : null;
  const day70X = stats.daysTo70 != null ? PAD_L + (stats.daysTo70 / horizonDays) * (W - PAD_L - 8) : null;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Forgetting curve: ${Math.round(stats.retentionNow * 100)}% recall now, falling to 70% in ${stats.daysTo70 ?? "more than"} days`}>
        {/* Recall thresholds */}
        <line x1={PAD_L} y1={y90} x2={W - 8} y2={y90} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" strokeWidth={1} />
        <line x1={PAD_L} y1={y70} x2={W - 8} y2={y70} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" strokeWidth={1} />
        <text x={2} y={y90 + 3} fontSize={8} fill="currentColor" fillOpacity={0.45}>90%</text>
        <text x={2} y={y70 + 3} fontSize={8} fill="currentColor" fillOpacity={0.45}>70%</text>

        {/* Drop-off zones */}
        {day90X != null ? <line x1={day90X} y1={PAD_L / 2} x2={day90X} y2={H - PAD_B} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} /> : null}
        {day70X != null ? <line x1={day70X} y1={PAD_L / 2} x2={day70X} y2={H - PAD_B} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} /> : null}

        {/* The curve */}
        <path d={areaPath} fill="currentColor" fillOpacity={0.06} stroke="none" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />

        {/* Now marker */}
        <circle cx={PAD_L} cy={PAD_L / 2 + (1 - stats.retentionNow) * (H - PAD_B - PAD_L / 2)} r={3.5} fill="currentColor" />
      </svg>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <Pill tone={stats.retentionNow >= 0.9 ? "success" : stats.retentionNow >= 0.7 ? "review" : "danger"}>
          {Math.round(stats.retentionNow * 100)}% recall now
        </Pill>
        <Pill>
          {stats.daysTo90 == null
            ? "already below 90% — review today"
            : stats.daysTo90 === 0
              ? "drops below 90% today"
              : `90% recall until +${stats.daysTo90}d`}
        </Pill>
        <Pill tone="review">
          {stats.daysTo70 == null
            ? "stays above 70% this month"
            : `70% around ${new Date(now.getTime() + stats.daysTo70 * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
        </Pill>
        <Pill>avg stability {stats.stability.toFixed(1)}d{stats.stability >= MASTERED_STABILITY_DAYS ? " — mastered range" : ""}</Pill>
      </div>
    </div>
  );
}
