"use client";

// Marks Ledger — two explicit tiers, never merged or summed.
//
// "Recovered on practice" vs "Proven on trusted unseen questions", with the
// plain-language reason behind the existing "Why?" disclosure.

import { useMemo } from "react";
import { buildMarksLedger } from "@/domain/marks-ledger";
import { useRecoveryEvidence } from "./recovery-evidence";
import { Panel, Pill, SectionHeading } from "./ui";

export function MarksLedger() {
  const { recovery } = useRecoveryEvidence();
  const ledger = useMemo(() => buildMarksLedger(recovery.items), [recovery.items]);
  if (!recovery.items.length) return null;
  return (
    <section aria-labelledby="marks-ledger-heading" className="space-y-4">
      <SectionHeading
        title="Marks ledger"
        hint="Two separate counts: early recovery on practice questions, and proof on trusted unseen questions."
      />
      <Panel className="space-y-3">
        <h2 id="marks-ledger-heading" className="sr-only">Marks ledger</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[8px] border border-line px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Recovered on practice</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {ledger.practice.marks} <span className="text-sm font-normal text-ink3">marks</span>
            </p>
            <p className="text-[11px] text-ink3 mt-0.5">
              {ledger.practice.count} in progress · unreviewed questions only, never proof
            </p>
          </div>
          <div className="rounded-[8px] border border-line px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Proven on trusted unseen</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {ledger.proven.marks} <span className="text-sm font-normal text-ink3">marks</span>
            </p>
            <p className="text-[11px] text-ink3 mt-0.5">
              {ledger.proven.count} proven · different reviewed question, unaided, after a delay
            </p>
          </div>
        </div>
        <p className="text-sm text-ink2" role="status">{ledger.statement}</p>
        <div className="flex flex-wrap items-center gap-2">
          {ledger.open.marks > 0 ? <Pill tone="danger">{ledger.open.marks} marks still open</Pill> : <Pill tone="success">Nothing open</Pill>}
        </div>
        <details>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Why?</summary>
          <p className="mt-2 text-sm leading-6 text-ink2">{ledger.explanation}</p>
        </details>
      </Panel>
    </section>
  );
}
