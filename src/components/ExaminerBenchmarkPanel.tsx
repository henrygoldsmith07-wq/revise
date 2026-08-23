"use client";

import { useMemo } from "react";
import { HUMAN_MARKING_CORPUS } from "@/domain/human-marking-corpus";
import {
  buildExaminerBenchmark,
  PHASE_1_TARGET,
  PHASE_2_TARGET,
  type BenchmarkRow,
  type PairAgreement,
} from "@/domain/examiner-benchmark";
import { markQuestion } from "@/domain/marking";
import { Panel, SectionHeading } from "./ui";

// Examiner-benchmark status: Phase 1 (250 genuine answers) and Phase 2
// (1,000+) with four blind markers per answer — Examiner A, Examiner B,
// Revise rubric and Revise AI. The internal fixture corpus seeds the panel so
// the machinery is visible today; it is labelled as internal regression data,
// never as examiner validation.

function rowsFromInternalFixture(): BenchmarkRow[] {
  return HUMAN_MARKING_CORPUS.rows.map((row) => {
    const rubric = markQuestion(row.question, row.answers);
    return {
      id: row.id,
      questionId: row.question.id,
      subjectId: row.question.subjectId,
      qualificationLevel: "alevel" as const,
      tariffBand: (rubric.max >= 6 ? "6+" : rubric.max >= 3 ? "3-4" : "1-2") as "6+" | "3-4" | "1-2",
      questionKind: "other" as const,
      maxMarks: rubric.max,
      marks: {
        examinerA: row.humanAwards[0] ?? null,
        examinerB: null,
        reviseRubric: rubric.awarded,
        reviseAi: null,
      },
      confidence: {},
    };
  });
}

export function ExaminerBenchmarkPanel() {
  const report = useMemo(() => buildExaminerBenchmark(rowsFromInternalFixture()), []);
  const strataGaps = report.stratification.filter((s) => !s.met).length;

  return (
    <section className="space-y-3">
      <SectionHeading title="Examiner benchmark" hint="Four blind markers; the human ceiling is the yardstick" />
      <Panel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Rows marked</p>
            <p className="text-sm font-semibold tabular-nums">{report.n}</p>
          </div>
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Phase 1 · {PHASE_1_TARGET}</p>
            <p className="text-sm font-semibold tabular-nums">{Math.round(report.phase1Progress * 100)}%</p>
          </div>
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Phase 2 · {PHASE_2_TARGET}+</p>
            <p className="text-sm font-semibold tabular-nums">{Math.round(report.phase2Progress * 100)}%</p>
          </div>
          <div className="rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] text-ink3">Strata unmet</p>
            <p className="text-sm font-semibold tabular-nums">{strataGaps}</p>
          </div>
        </div>

        <table className="w-full text-xs mt-3">
          <thead className="text-ink3">
            <tr>
              <th className="text-left px-2 py-1">comparison</th>
              <th className="text-right px-2 py-1">n</th>
              <th className="text-right px-2 py-1">exact</th>
              <th className="text-right px-2 py-1">±1</th>
              <th className="text-right px-2 py-1">MAE</th>
              <th className="text-right px-2 py-1">weighted κ</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["Examiner A vs B", report.humanVsHuman],
              ["Rubric vs examiner A", report.rubricVsExaminerA],
              ["AI vs examiner A", report.aiVsExaminerA],
            ] as Array<[string, PairAgreement | null]>).map(([label, p]) => (
              <tr key={label} className="border-t border-line">
                <td className="px-2 py-1">{label}</td>
                <td className="text-right tabular-nums">{p?.n ?? 0}</td>
                <td className="text-right tabular-nums">{p ? `${Math.round(p.exactRate * 100)}%` : "—"}</td>
                <td className="text-right tabular-nums">{p ? `${Math.round(p.withinOneRate * 100)}%` : "—"}</td>
                <td className="text-right tabular-nums">{p ? p.mae.toFixed(2) : "—"}</td>
                <td className="text-right tabular-nums">
                  {p?.weightedKappaLinear != null ? p.weightedKappaLinear.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-[11px] text-ink3 mt-3">{report.headlineNote}</p>
        <p className="text-[11px] text-ink3">
          Current rows are the internal teacher-labelled regression fixture — synthetic provenance, not external
          validation. Phase 1 import tooling lands with the first cohort of genuine anonymised answers.
        </p>
      </Panel>
    </section>
  );
}
