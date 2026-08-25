"use client";

import { useMemo } from "react";
import { useStore } from "@/state/store";
import { analyseExperiment, type ExperimentAnalysis } from "@/domain/recommendation-experiment";
import { computeEfficacyEvidence, formatEfficacyEffect } from "@/domain/efficacy-evidence";
import { Panel, SectionHeading } from "./ui";

// Live efficacy evidence: marks gained per revision hour per arm. This is
// the number that proves or disproves Revise's central claim. Rendered on
// Progress so the student can watch the study fill up.

function fmtRate(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export function EfficacyPanel() {
  const store = useStore();

  const analysis: ExperimentAnalysis | null = useMemo(() => {
    const arm = store.experimentArm;
    if (!arm) return null;
    const userId = store.userId;
    const assignments = [{ anonId: userId, arm: arm.arm, assignedAt: arm.assignedAt ?? new Date().toISOString(), version: 1 as const }];
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
  }, [store.experimentArm, store.attempts, store.reviewLogs, store.mastery, store.userId]);

  if (!store.experimentArm) return null;

  const evidence = analysis ? computeEfficacyEvidence(analysis) : null;
  const headline = evidence ? formatEfficacyEffect(evidence) : null;

  return (
    <section className="space-y-3">
      <SectionHeading title="Efficacy evidence" hint="Does Revise choose better revision?" />
      <Panel>
        {headline ? (
          <p className="text-lg font-semibold text-success mb-2">
            {headline} vs self-directed revision
          </p>
        ) : (
          <p className="text-sm text-ink3 mb-2">{evidence?.note ?? "Study enrolling."}</p>
        )}

        {evidence ? (
          <table className="w-full text-xs mt-2">
            <thead className="text-ink3">
              <tr>
                <th className="text-left px-2 py-1">arm</th>
                <th className="text-right px-2 py-1">n</th>
                <th className="text-right px-2 py-1">hours</th>
                <th className="text-right px-2 py-1">marks/hour</th>
                <th className="text-right px-2 py-1">retention</th>
              </tr>
            </thead>
            <tbody>
              {evidence.arms.map((a) => (
                <tr key={a.arm} className={`border-t border-line ${a.arm === store.experimentArm?.arm ? "font-semibold" : ""}`}>
                  <td className="px-2 py-1">{a.label}</td>
                  <td className="text-right tabular-nums px-2">{a.participants}</td>
                  <td className="text-right tabular-nums px-2">{a.hours.toFixed(1)}</td>
                  <td className="text-right tabular-nums px-2">{a.marksPerHour != null ? a.marksPerHour.toFixed(2) : "—"}</td>
                  <td className="text-right tabular-nums px-2">{fmtRate(a.delayedRetention)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <p className="text-[11px] text-ink3 mt-3">
          Four-arm prospective design · preregistered metrics · efficacy claim requires all arms populated + delayed
          retention + unseen transfer + final assessments.
        </p>
      </Panel>
    </section>
  );
}
