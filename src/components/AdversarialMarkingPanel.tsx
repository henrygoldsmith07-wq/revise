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
  "keywords-wrong-reasoning": "scheme terms, bogus causality",
  contradictory: "correct content, then retracted",
  "mixed-claims": "one reversed claim in a correct answer",
  "partially-correct": "half the scheme points",
  "alternative-method": "same working, different order",
  "alternative-notation": "equivalent fraction/decimal forms",
  "scientific-notation": "3.55 × 10^1 for 35.5",
  "significant-figures": "values over-rounded to 1 s.f.",
  "valid-method-wrong-answer": "right route, slipped final value",
  "unit-mistakes": "J for kJ, cm³ for m³…",
  "unusual-phrasing": "rhetorical synonym swaps",
  "grammar-errors": "dropped articles, content intact",
  "student-shorthand": "note-form abbreviations",
  "bullet-points": "same content as a list",
  rambling: "repetition and filler padding",
  "ambiguous-transcription": "OCR-style garbled words",
  "spelling-noise": "the model answer with typos",
  "diagram-reference": "'as shown on the diagram' only",
};

export function AdversarialMarkingPanel() {
  // Reduced per-category sample so the live table computes quickly in the
  // browser; CI pins the full-budget run over the whole seed bank.
  const report = useMemo(
    () => runAdversarialMarkingBenchmark({ questions: seedQuestions, maxCasesPerCategory: 10 }),
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
          {report.totalCases} cases (live sample of {Math.min(seedQuestions.length, 10)} questions per
          category; CI runs the full budget) · {report.ok ? "all fences hold" : `${report.failedCases} fence failures`} ·{" "}
          synthetic fixtures generated deterministically from authored seeds ({seedQuestions.length} questions) — not
          human evidence. Source: <code className="font-mono">src/domain/marking-adversarial.ts</code>, pinned by{" "}
          <code className="font-mono">tests/marking-adversarial.test.ts</code>.
        </p>
      </Panel>
    </section>
  );
}
