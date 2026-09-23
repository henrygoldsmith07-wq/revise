"use client";

import { useMemo } from "react";
import { useStore } from "@/state/store";
import { analyseFunnel } from "@/domain/funnel";
import { Panel, SectionHeading } from "./ui";

// Revision-funnel health: the six preregistered goals plus per-step
// conversion. Computed live from local funnel events and the attempt log —
// the same pure analysis the tests pin. Thin denominators show "—" rather
// than a percentage nobody should trust.

function goalTone(meets: boolean | null): string {
  if (meets == null) return "text-ink3";
  return meets ? "text-success" : "text-danger";
}

export function FunnelPanel() {
  const store = useStore();

  const report = useMemo(() => {
    const userId = store.userId;
    const attempts = store.attempts.map((a) => ({
      anonId: a.userId,
      questionId: a.questionId,
      topicIds: a.topicIds,
      mode: a.mode,
      awarded: a.awarded,
      max: a.max,
      elapsedMs: a.elapsedMs ?? 0,
      createdAt: a.createdAt,
      retestMistakeId: a.retestMistakeId ?? null,
    }));
    const mistakes = store.mistakes.map((m) => ({
      anonId: m.userId,
      id: m.id,
      createdAt: m.createdAt,
    }));
    return analyseFunnel({
      anonId: userId,
      events: store.funnelEvents,
      attempts,
      mistakes,
    });
  }, [store.attempts, store.funnelEvents, store.mistakes, store.userId]);

  return (
    <section className="space-y-3">
      <SectionHeading title="Revision funnel" hint="Is the basic loop getting easier or harder to use?" />
      <Panel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {report.goals.map((goal) => (
            <div key={goal.label} className="rounded-[8px] border border-line px-2.5 py-2" data-testid={`funnel-${goal.label}`}>
              <p className="text-[11px] text-ink3">{goal.label}</p>
              <p className={`text-sm font-semibold tabular-nums mt-0.5 ${goalTone(goal.meets)}`}>
                {goal.value == null
                  ? "—"
                  : /%$/.test(goal.goal)
                    ? `${Math.round((goal.value ?? 0) * 100)}%`
                    : `${goal.value}s`}
              </p>
              <p className="text-[11px] text-ink3 mt-0.5">
                goal {goal.goal} · {goal.detail}
              </p>
            </div>
          ))}
        </div>

        <table className="w-full text-xs mt-3">
          <thead className="text-ink3">
            <tr>
              <th className="text-left px-2 py-1">step</th>
              <th className="text-right px-2 py-1">entered</th>
              <th className="text-right px-2 py-1">advanced</th>
              <th className="text-right px-2 py-1">rate</th>
            </tr>
          </thead>
          <tbody>
            {report.steps.map((step) => (
              <tr key={step.step} className="border-t border-line">
                <td className="px-2 py-1">{step.step}</td>
                <td className="text-right tabular-nums px-2">{step.entered}</td>
                <td className="text-right tabular-nums px-2">{step.advanced}</td>
                <td className="text-right tabular-nums px-2">{step.rate == null ? "—" : `${Math.round(step.rate * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-[11px] text-ink3 mt-3" role="status">
          {report.sessions} sessions · {report.note}
        </p>
      </Panel>
    </section>
  );
}
