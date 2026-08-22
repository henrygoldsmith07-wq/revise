"use client";

import { useMemo } from "react";
import { seedQuestions } from "@/content";
import { runAdversarialMarkingBenchmark } from "@/domain/marking-adversarial";
import { Panel, SectionHeading } from "./ui";

// Live adversarial-marking ledger: hostile synthetic answers (fluent nonsense,
// keyword stuffing, contradictions, partial reasoning, notation variants,
// spelling noise) run through the shipped rubric marker. Deterministic — every
// visitor sees the same table computed from the same functions CI pins.
// Synthetic by design: external validation comes only from the double-marked
// human corpus, which this panel never claims to be.

const CATEGORY_HINTS: Record<string, string> = {
  "fluent-nonsense": "prose with zero scheme content",
  "irrelevant-but-fluent": "a fluent answer to a different question",
  "keyword-stuffing": "recited scheme wording",
  contradictory: "correct content, then retracted",
  "partially-correct": "half the scheme points",
  "alternative-notation": "equivalent fraction/decimal forms",
  "spelling-noise": "the model answer with typos",
};

export function AdversarialMarkingPanel() {
  const report = useMemo(
    () => runAdversarialMarkingBenchmark({ questions: seedQuestions }),
    [],
  );

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Adversarial marking"
        hint="Hostile answers through the shipped marker"
      />
      <Panel>
        <div className="overflow-auto nice-scroll rounded-[8px] border border-line">
          <table className="w-full text-xs">
            <thead className="bg-surface2 text-ink3">
              <tr>
                <th className="text-left px-2 py-1">category</th>
                <th className="text-right px-2 py-1">cases</th>
                <th className="text-right px-2 py-1">pass rate</th>
                <th className="text-right px-2 py-1">mean share of max</th>
                <th className="text-left px-2 py-1">fence</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((category) => (
                <tr key={category.id} className="border-t border-line">
                  <td className="px-2 py-1">
                    <span className="font-medium text-ink">{category.label}</span>
                    <span className="block text-[11px] text-ink3">{CATEGORY_HINTS[category.id] ?? ""}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{category.cases}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${category.failed ? "text-danger" : "text-success"}`}>
                    {Math.round(category.passRate * 100)}%
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {(category.meanShareOfMax * 100).toFixed(0)}%
                    {category.comparisonMean != null ? (
                      <span className="text-ink3"> vs {(category.comparisonMean * 100).toFixed(0)}% clean</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-ink2">{category.expectation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink3 mt-3">
          {report.totalCases} cases · {report.ok ? "all fences hold" : `${report.failedCases} fence failures`} ·{" "}
          synthetic fixtures generated deterministically from authored seeds ({seedQuestions.length} questions) — not
          human evidence. Source: <code className="font-mono">src/domain/marking-adversarial.ts</code>, pinned by{" "}
          <code className="font-mono">tests/marking-adversarial.test.ts</code>.
        </p>
      </Panel>
    </section>
  );
}
