"use client";

import { useMemo } from "react";
import { runTournament, type ParticipantTrajectory } from "@/domain/recommender-tournament";
import { Panel, SectionHeading } from "./ui";

// Recommender tournament ledger: ten selection policies replayed over
// trajectories, ranked by unseen marks per hour with completion, immediate
// score and 7-day retention alongside. The demo trajectories here are clearly
// synthetic; real learner replays slot in through the same pure runner.

/** Synthetic but structurally realistic: two topics, spaced touches, weak-topic drift. */
function demoTrajectories(n = 3): ParticipantTrajectory[] {
  const out: ParticipantTrajectory[] = [];
  for (let p = 0; p < n; p++) {
    const events = [];
    let strongDay = 1 + p;
    let weakDay = 1.5 + p;
    for (let i = 0; i < 14; i++) {
      events.push({
        anonId: `demo-${p}`,
        at: new Date(new Date("2026-08-01T09:00:00Z").getTime() + strongDay * 86_400_000).toISOString(),
        topicId: "demo.strong",
        questionId: `sq-${p}-${i}`,
        awarded: 3,
        max: 3,
        durationMinutes: 12,
      });
      events.push({
        anonId: `demo-${p}`,
        at: new Date(new Date("2026-08-01T09:00:00Z").getTime() + weakDay * 86_400_000).toISOString(),
        topicId: "demo.weak",
        questionId: `wk-${p}-${i}`,
        awarded: i % 3 === 0 ? 1 : 2,
        max: 3,
        durationMinutes: 15,
      });
      strongDay += 21;
      weakDay += 19;
    }
    out.push({
      anonId: `demo-${p}`,
      subjectWeights: { demo: 0.8 },
      events,
      finalAssessment: [
        { questionId: `fa-s-${p}`, topicId: "demo.strong", awarded: 3, max: 3 },
        { questionId: `fa-w-${p}`, topicId: "demo.weak", awarded: 1, max: 3 },
      ],
    });
  }
  return out;
}

export function TournamentPanel() {
  const outcomes = useMemo(() => runTournament(demoTrajectories(4), [], { seed: 20260822 }), []);

  return (
    <section className="space-y-3">
      <SectionHeading title="Recommender tournament" hint="Ten policies replayed over trajectories" />
      <Panel>
        <table className="w-full text-xs">
          <thead className="text-ink3">
            <tr>
              <th className="text-left px-2 py-1">policy</th>
              <th className="text-right px-2 py-1">decisions</th>
              <th className="text-right px-2 py-1">completion</th>
              <th className="text-right px-2 py-1">immediate score</th>
              <th className="text-right px-2 py-1">7-day retention</th>
              <th className="text-right px-2 py-1">unseen marks/hour</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.policyId} className="border-t border-line">
                <td className="px-2 py-1">
                  {o.label}
                  {o.policyId === "revise" ? <span className="ml-1 text-[10px] text-accent">production</span> : null}
                  {o.policyId === "bandit" || o.policyId === "learned" ? (
                    <span className="ml-1 text-[10px] text-ink3">candidate</span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{o.decisionPoints}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmt(o.completionRate, true)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmt(o.immediateScore)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmt(o.retention7d, true)}</td>
                <td className="px-2 py-1 text-right tabular-nums font-semibold">
                  {fmt(o.unseenMarksPerHour)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-ink3 mt-3">
          Ranked by unseen marks per hour on held-out final assessments. Demo trajectories are SYNTHETIC — no efficacy
          claim is attached to this table. The production heuristic stays in place unless a challenger beats it on real
          learner replays. Source: <code className="font-mono">src/domain/recommender-tournament.ts</code>.
        </p>
      </Panel>
    </section>
  );
}

function fmt(value: number | null, asPercent = false): string {
  if (value == null) return "—";
  return asPercent ? `${Math.round(value * 100)}%` : value.toFixed(2);
}
