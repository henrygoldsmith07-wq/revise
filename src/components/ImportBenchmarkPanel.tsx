"use client";

import { useMemo } from "react";
import {
  IMPORT_PHASE_1_PAPERS,
  IMPORT_REVIEW_THRESHOLD,
  importConfidence,
} from "@/domain/paper-import-benchmark";
import { Panel, SectionHeading } from "./ui";

// Paper-import trust ledger: Phase 1 (100 gold papers) progress plus a live
// demonstration of confidence-aware import — every imported question carries
// its own confidence, and anything below the review threshold routes to a
// human instead of silently joining the bank.

const EXAMPLES = [
  { label: "4b", topic: "Homeostasis", spec: "2.3.4", confidence: 0.94 },
  { label: "7c", topic: "Unmapped", spec: "—", confidence: 0.48 },
];

export function ImportBenchmarkPanel() {
  const demoConfidence = useMemo(
    () =>
      EXAMPLES.map((e) => ({
        ...e,
        c: importConfidence({
          marksParsed: e.confidence > 0.8,
          totalMarksParsed: e.confidence > 0.8,
          schemePaired: e.confidence > 0.8,
          topicTop1Score: e.confidence,
          specMappedCount: e.confidence > 0.8 ? 2 : 0,
          hasCommandWord: true,
        }),
        needsReview: importConfidence({
          marksParsed: e.confidence > 0.8,
          totalMarksParsed: e.confidence > 0.8,
          schemePaired: e.confidence > 0.8,
          topicTop1Score: e.confidence,
          specMappedCount: e.confidence > 0.8 ? 2 : 0,
          hasCommandWord: true,
        }) < IMPORT_REVIEW_THRESHOLD,
      })),
    [],
  );

  return (
    <section className="space-y-3">
      <SectionHeading title="Paper-import benchmark" hint="Segmentation F1, mapping accuracy, and confidence-aware import" />
      <Panel>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Phase 1 · {IMPORT_PHASE_1_PAPERS} papers</p>
            <p className="text-sm font-semibold tabular-nums">0 collected</p>
          </div>
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Phase 2 · 400+</p>
            <p className="text-sm font-semibold tabular-nums">planned</p>
          </div>
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Review threshold</p>
            <p className="text-sm font-semibold tabular-nums">{Math.round(IMPORT_REVIEW_THRESHOLD * 100)}%</p>
          </div>
        </div>

        <ul className="mt-3 text-xs text-ink2 space-y-1 list-disc list-inside">
          <li>Annotated per paper: question boundaries, subparts, mark values, figures, tables, scheme alignment, spec points, topics, command words.</li>
          <li>Metrics: segmentation F1 · subpart F1 · mark accuracy · scheme pairing · topic top-1/top-3 · spec-point P/R · diagram association.</li>
          <li>Markers are blind; annotations adjudicated before scoring.</li>
        </ul>

        <p className="text-xs text-ink2 mt-3 mb-1">Confidence-aware import in practice:</p>
        <ul className="text-xs space-y-1" data-testid="import-confidence-examples">
          {demoConfidence.map((ex) => (
            <li key={ex.label} className={`rounded-[8px] px-2.5 py-1.5 border ${ex.needsReview ? "border-danger bg-dangersoft" : "border-success bg-successsoft"}`}>
              <span className="font-semibold">Question {ex.label}</span> —{" "}
              <span className="tabular-nums">{Math.round(ex.c * 100)}% confident</span> · Topic: {ex.topic} · Spec:{" "}
              {ex.spec}
              {ex.needsReview ? <span className="text-danger"> · Review mapping</span> : null}
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-ink3 mt-3">
          Schema: <code className="font-mono">src/domain/paper-import-benchmark.ts</code>, pinned by{" "}
          <code className="font-mono">tests/paper-import-benchmark.test.ts</code>. Gold collection has not started — this
          panel reports honestly until it does.
        </p>
      </Panel>
    </section>
  );
}
