"use client";

import { useMemo } from "react";
import { useStore } from "@/state/store";
import { analyseExperiment } from "@/domain/recommendation-experiment";
import { Panel, SectionHeading } from "./ui";

// Live view of the prospective recommendation experiment for the enrolled
// profile. Every number is computed from locally recorded attempts, reviews
// and shown/rejected events â€” the same pure analysis CI pins. Until all four
// arms have real participants the panel refuses to headline an effect.

const ARM_LABELS: Record<string, string> = {
  revise: "Revise recommendations",
  "baseline-mastery": "Weakest-topic-first",
  "baseline-overdue": "Most-overdue-first",
  control: "Self-directed (control)",
};

const METRIC_LABELS: Array<[string, keyof import("@/domain/recommendation-experiment").ArmOutcome]> = [
  ["Practice hours", "hoursPractised"],
  ["Marks earned", "marksEarned"],
  ["Marks per hour", "practiceMarksPerHour"],
  ["Marks per activity", "marksPerActivity"],
  ["Delayed retention (7d+)", "delayedRetention"],
  ["Unseen-question share", "unseenExposureShare"],
  ["Mastery calibration error", "masteryCalibrationError"],
  ["Recommendation completion", "completionRate"],
  ["Recommendation rejection", "rejectionRate"],
  ["Median time-to-begin", "medianSecondsToBegin"],
  ["Dropout", "dropoutRate"],
  ["Final mock performance", "finalPerformancePercent"],
];

function formatValue(key: string, value: unknown): string {
  if (value == null) return "â€”";
  if (typeof value !== "number") return String(value);
  if (/rate|share|retention|error|dropout/i.test(key)) return `${Math.round(value * 100)}%`;
  if (/begin/i.test(key)) return value < 90 ? `${Math.round(value)}s` : `${Math.round(value / 60)} min`;
  if (/hour/i.test(key)) return value.toFixed(2);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ExperimentPanel() {
  const store = useStore();
  const arm = store.experimentArm;

  const analysis = useMemo(() => {
    const userId = store.userId;
    const assignments = arm ? [{ anonId: userId, arm: arm.arm, assignedAt: arm.assignedAt, version: 1 as const }] : [];
    const attempts = store.attempts.map((a) => ({
      anonId: a.userId,
      topicIds: a.topicIds,
      questionId: a.questionId,
      awarded: a.awarded,
      max: a.max,
      elapsedMs: a.elapsedMs ?? 0,
      createdAt: a.createdAt,
    }));
    const reviews = store.reviewLogs.map((r) => ({
      anonId: r.userId,
      cardId: r.cardId,
      reviewedAt: r.reviewedAt,
      grade: r.grade,
    }));
    const masteryByTopic = new Map(store.mastery.map((m) => [m.topicId, m.mastery]));
    return analyseExperiment({ assignments, events: [], attempts, reviews, masteryByTopic });
  }, [arm, store.attempts, store.reviewLogs, store.mastery, store.userId]);

  if (!arm) return null;
  const mine = analysis.arms.find((a) => a.arm === arm.arm);

  return (
    <section className="space-y-3">
      <SectionHeading title="Effectiveness study" hint="Does the recommendation actually beat you?" />
      <Panel>
        <p className="text-xs text-ink2">
          Enrolled arm: <strong className="text-ink">{ARM_LABELS[arm.arm] ?? arm.arm}</strong>. Metrics below are your
          live contribution; cross-arm comparison appears once other arms have participants.
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs" data-testid="experiment-metrics">
          {METRIC_LABELS.map(([label, key]) => (
            <div key={String(key)} className="rounded-[8px] border border-line px-2.5 py-2">
              <p className="text-[11px] text-ink3">{label}</p>
              <p className="text-sm font-semibold tabular-nums text-ink mt-0.5">
                {mine ? formatValue(String(key), mine[key]) : "â€”"}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink3 mt-3" role="status">{analysis.note}</p>
      </Panel>
    </section>
  );
}
