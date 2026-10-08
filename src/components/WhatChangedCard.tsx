"use client";

// "What changed?" after a meaningful session: before, this session, the next
// proof, and the full chain one tap away. Pure presentation of buildWhatChanged.

import type { WhatChanged } from "@/domain/what-changed";
import { CreditedIcon, MissedIcon } from "./icons";

export function WhatChangedCard({ change, subjectName, topicTitle }: { change: WhatChanged; subjectName: string; topicTitle: string }) {
  return (
    <section aria-labelledby="what-changed-heading" className="card p-4 sm:p-5 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.13em] text-ink3 font-bold">What changed</p>
        <h2 id="what-changed-heading" className="mt-1 text-lg font-semibold tracking-tight text-ink">{change.headline}</h2>
        <p className="mt-0.5 text-sm text-ink3">{subjectName} · {topicTitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold sm:pt-0.5">Before</p>
        <p className="text-sm text-ink">{change.before.focus}: <span className="text-ink2">{change.before.state}</span></p>

        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold sm:pt-0.5">This session</p>
        {change.thisSession.length ? (
          <ul className="space-y-1">
            {change.thisSession.map((line, index) => (
              <li key={`${index}-${line.text}`} className="flex items-start gap-2 text-sm text-ink">
                {line.ok
                  ? <CreditedIcon size={16} aria-hidden className="mt-0.5 shrink-0 text-success" />
                  : <MissedIcon size={16} aria-hidden className="mt-0.5 shrink-0 text-danger" />}
                <span className="min-w-0"><span className="sr-only">{line.ok ? "Done: " : "Not yet: "}</span>{line.text}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink2">No answers were recorded, so nothing about this topic has changed.</p>}

        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold sm:pt-0.5">Next proof</p>
        <p className="text-sm text-ink">{change.nextProof}</p>
      </div>

      {change.caveat ? <p className="text-xs text-ink3 border-l-2 border-line pl-3">{change.caveat}</p> : null}

      <details>
        <summary className="cursor-pointer select-none text-sm font-medium text-ink2 min-h-11 inline-flex items-center">From problem to proof</summary>
        <ol className="mt-2 space-y-1.5" aria-label="Problem to outcome">
          {change.chain.map((step) => (
            <li key={step.stage} className="flex items-start gap-2 text-sm text-ink2">
              {step.status === "done" ? <CreditedIcon size={15} aria-hidden className="mt-0.5 shrink-0 text-success" />
                : step.status === "missed" ? <MissedIcon size={15} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink3" aria-hidden="true" />}
              <span className="min-w-0"><span className="font-medium text-ink">{step.label}:</span> {step.detail}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
