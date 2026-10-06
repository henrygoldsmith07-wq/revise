"use client";

// "What Revise has learned about how you learn": the learner-facing half of
// the intervention-effectiveness loop. Observations only appear once the
// domain has enough checked sessions behind them; the recent chains show each
// step from problem to outcome, with repeats marked as not counted.

import type { ChainStepStatus, InterventionChainView } from "@/domain/intervention-memory";
import { useInterventionMemory } from "./learner-model";
import { CreditedIcon, MissedIcon } from "./icons";
import { Panel, Pill } from "./ui";

const STATUS_TEXT: Record<ChainStepStatus, string> = {
  done: "Done",
  missed: "Missed",
  pending: "Still to come",
  "not-counted": "Not counted",
  "not-applicable": "Not part of this",
};

export function InterventionMemoryPanel() {
  const memory = useInterventionMemory();
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink flex-1">What Revise has learned about how you learn</h2>
        {memory.personalised ? <Pill tone="accent">Personalised</Pill> : null}
      </div>
      {memory.observations.length ? (
        <ul className="space-y-1.5 text-sm text-ink2">
          {memory.observations.map((o) => (
            <li key={o.text} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="min-w-0">{o.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink2">{memory.emptyLine}</p>
      )}
      {memory.personalised ? (
        <p className="text-xs text-ink3">These observations already shape which session Revise suggests next.</p>
      ) : null}
      {memory.recent.length ? (
        <details>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2 min-h-11 inline-flex items-center">Your recent sessions, step by step</summary>
          <ol className="mt-2 space-y-3">{memory.recent.map((chain) => <ChainRow key={chain.id} chain={chain} />)}</ol>
        </details>
      ) : null}
    </Panel>
  );
}

function ChainRow({ chain }: { chain: InterventionChainView }) {
  return (
    <li className="rounded-[10px] border border-line px-3 py-2.5">
      <p className="text-sm font-medium text-ink">{chain.steps[0]?.detail}</p>
      <ol className="mt-2 grid gap-1 sm:grid-cols-2" aria-label="Steps from problem to outcome">
        {chain.steps.slice(1).map((step) => (
          <li key={step.stage} className="flex items-start gap-2 text-xs text-ink2">
            {step.status === "done" ? <CreditedIcon size={14} aria-hidden className="mt-0.5 shrink-0 text-success" />
              : step.status === "missed" ? <MissedIcon size={14} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink3" aria-hidden="true" />}
            <span className="min-w-0"><span className="font-medium text-ink">{step.label}</span> <span className="sr-only">({STATUS_TEXT[step.status]})</span>: {step.detail}</span>
          </li>
        ))}
      </ol>
    </li>
  );
}
