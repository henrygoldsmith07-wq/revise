import { MIN_REVIEWS_FOR_RETENTION, retentionReport } from "./retention-analytics";
import type { Card, IsoDate, ReviewLog } from "./types";

// Retention mastery is deliberately measured, not predicted. It answers
// whether recalled material is surviving the gaps that spaced repetition is
// creating, and stays ungraded until there is enough real review evidence.

export const RETENTION_TARGET = 0.9;

export type RetentionMasteryBand = "secure" | "building" | "needs-work" | "not-enough-evidence";
export type RetentionTrend = "improving" | "steady" | "slipping" | "unknown";

export interface RetentionMasteryReport {
  band: RetentionMasteryBand;
  trend: RetentionTrend;
  measuredRetention: number | null;
  evidenceReviews: number;
  target: number;
  gapToTarget: number | null;
  checkpoints: ReturnType<typeof retentionReport>["checkpoints"];
  narrative: string;
  nextAction: string;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function retentionTrend(
  sevenDay: number | null | undefined,
  thirtyDay: number | null | undefined,
): RetentionTrend {
  if (sevenDay == null || thirtyDay == null) return "unknown";
  const change = sevenDay - thirtyDay;
  if (change >= 0.04) return "improving";
  if (change <= -0.04) return "slipping";
  return "steady";
}

function bandFor(retention: number | null): RetentionMasteryBand {
  if (retention == null) return "not-enough-evidence";
  if (retention >= RETENTION_TARGET) return "secure";
  if (retention >= 0.8) return "building";
  return "needs-work";
}

function nextActionFor(retention: number | null, evidenceReviews: number): string {
  if (retention == null) {
    const remaining = Math.max(0, MIN_REVIEWS_FOR_RETENTION - evidenceReviews);
    return remaining
      ? `Complete ${remaining} more reviews before judging your retention.`
      : "Keep reviews spread across several days before judging your retention.";
  }
  if (retention < 0.8) return "Review due cards daily and use Again honestly when recall fails.";
  if (retention < RETENTION_TARGET) return "Keep clearing due cards daily so the gaps can stabilise.";
  if (retention > 0.94) return "Try harder cards or longer gaps — you may be reviewing more often than needed.";
  return "Keep the same review rhythm — your intervals are doing their job.";
}

/** Build an evidence-gated retention mastery view from real review history. */
export function retentionMasteryReport(input: {
  reviewLogs: ReviewLog[];
  cards?: Card[];
  today?: IsoDate;
  now?: Date;
}): RetentionMasteryReport {
  const measured = retentionReport(input);
  const thirtyDay = measured.checkpoints.find((checkpoint) => checkpoint.checkpoint === 30);
  const sevenDay = measured.checkpoints.find((checkpoint) => checkpoint.checkpoint === 7);
  const evidenceReviews = thirtyDay?.reviews ?? 0;
  const retention = measured.overallRetention;

  return {
    band: bandFor(retention),
    trend: retentionTrend(sevenDay?.retention, thirtyDay?.retention),
    measuredRetention: retention,
    evidenceReviews,
    target: RETENTION_TARGET,
    gapToTarget: retention == null ? null : rounded(retention - RETENTION_TARGET),
    checkpoints: measured.checkpoints,
    narrative: measured.narrative,
    nextAction: nextActionFor(retention, evidenceReviews),
  };
}

export function retentionMasteryLabel(band: RetentionMasteryBand): string {
  if (band === "secure") return "Retention secure";
  if (band === "building") return "Building retention";
  if (band === "needs-work") return "Retention needs work";
  return "Evidence still building";
}
