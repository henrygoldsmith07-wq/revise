import { describe, expect, it } from "vitest";
import {
  buildExaminerBenchmark,
  cohensKappa,
  stratificationReport,
  weightedKappa,
  type BenchmarkRow,
} from "@/domain/examiner-benchmark";

// ---------------------------------------------------------------------------
// Examiner benchmark — kappa math verified against hand-computed values, and
// the headline disagreement-ratio criterion (Revise vs examiner ≈ examiner vs
// examiner, target ratio <= 1).
// ---------------------------------------------------------------------------

describe("cohensKappa", () => {
  it("returns 1 for identical raters", () => {
    expect(cohensKappa([0, 1, 2, 1], [0, 1, 2, 1], 2)).toBe(1);
  });

  it("returns exactly 0 for the classic chance-agreement case", () => {
    // A=[0,1,0,1] B=[0,0,1,1]: po = pe = 0.5 → kappa = 0.
    expect(cohensKappa([0, 1, 0, 1], [0, 0, 1, 1], 1)).toBe(0);
  });

  it("matches the hand-computed value on an ordinal example", () => {
    // A=[0,1,1,2] B=[0,1,2,2], max=2:
    // po=0.75, pe=5/16 → kappa = 7/11 ≈ 0.6364
    const k = cohensKappa([0, 1, 1, 2], [0, 1, 2, 2], 2)!;
    expect(k).toBeCloseTo(0.6364, 3);
  });

  it("handles empty input", () => {
    expect(cohensKappa([], [], 3)).toBeNull();
  });
});

describe("weightedKappa", () => {
  const a = [0, 1, 1, 2];
  const b = [0, 1, 2, 2];

  it("matches hand-computed linear weighting (5/7 = 0.7143)", () => {
    // Cell-by-cell: pO = 0.875, pE = 9/16 → kappa = 0.3125/0.4375 = 5/7.
    expect(weightedKappa(a, b, 2, "linear")!).toBeCloseTo(0.7142857, 6);
  });

  it("matches hand-computed quadratic weighting (0.80)", () => {
    expect(weightedKappa(a, b, 2, "quadratic")!).toBeCloseTo(0.8, 6);
  });

  it("rewards near-misses: quadratic >= linear >= unweighted", () => {
    const unweighted = cohensKappa(a, b, 2)!;
    const lin = weightedKappa(a, b, 2, "linear")!;
    const quad = weightedKappa(a, b, 2, "quadratic")!;
    expect(quad).toBeGreaterThanOrEqual(lin);
    expect(lin).toBeGreaterThanOrEqual(unweighted);
  });
});

// --- fixtures ----------------------------------------------------------------

let rowCounter = 0;
function row(over: Partial<BenchmarkRow>): BenchmarkRow {
  rowCounter++;
  return {
    id: `bench-${rowCounter}`,
    questionId: `q-${rowCounter}`,
    subjectId: "wjec-alevel-physics",
    qualificationLevel: "alevel",
    tariffBand: "3-4",
    questionKind: "calculation",
    maxMarks: 3,
    marks: { examinerA: null, examinerB: null, reviseRubric: null, reviseAi: null },
    ...over,
  };
}

describe("buildExaminerBenchmark", () => {
  it("computes the human ceiling and the headline disagreement ratios", () => {
    const rows: BenchmarkRow[] = [
      // Examiners disagree by exactly one everywhere; rubric matches examinerA.
      row({ marks: { examinerA: 2, examinerB: 1, reviseRubric: 2, reviseAi: null }, maxMarks: 3 }),
      // AI sits on examinerB's mark: consistently one mark off examinerA.
      row({ marks: { examinerA: 1, examinerB: 2, reviseRubric: 1, reviseAi: 2 } }),
      row({ marks: { examinerA: 3, examinerB: 2, reviseRubric: 3, reviseAi: 2 } }),
      row({ marks: { examinerA: 0, examinerB: 1, reviseRubric: 0, reviseAi: null } }),
    ];
    const report = buildExaminerBenchmark(rows);

    expect(report.humanVsHuman!.mae).toBe(1);
    expect(report.rubricVsHuman!.mae).toBe(0);
    expect(report.disagreementRatioRubric).toBe(0);
    // AI copied examinerB's mark each time: one off examinerA on every row,
    // so its MAE equals the human ceiling and the ratio lands at target 1.
    expect(report.aiVsHuman!.mae).toBe(1);
    expect(report.disagreementRatioAi).toBe(1);
    // Weighted kappa vs the examiner consensus is reported for both raters.
    expect(report.rubricVsExaminerA!.weightedKappaLinear).not.toBeNull();
    expect(report.headlineNote).toContain("<=");
  });

  it("flags a marker worse than the human ceiling", () => {
    const rows: BenchmarkRow[] = [
      row({ marks: { examinerA: 2, examinerB: 2, reviseRubric: null, reviseAi: 0 }, maxMarks: 3 }),
      row({ marks: { examinerA: 3, examinerB: 3, reviseRubric: null, reviseAi: 0 } }),
    ];
    const report = buildExaminerBenchmark(rows);
    expect(report.humanVsHuman!.mae).toBe(0); // examiners agree perfectly...
    expect(report.aiVsHuman!.mae).toBeGreaterThan(0);
    expect(report.disagreementRatioAi).toBeNull(); // ...so no finite ratio exists yet
    expect(report.headlineNote).toContain("Awaiting");
  });

  it("reports confidence calibration bins against examiner consensus", () => {
    const rows: BenchmarkRow[] = [
      row({ marks: { examinerA: 2, examinerB: 2, reviseRubric: null, reviseAi: 2 }, confidence: { reviseAi: 0.95 } }),
      row({ marks: { examinerA: 2, examinerB: 2, reviseRubric: null, reviseAi: 0 }, confidence: { reviseAi: 0.55 } }),
    ];
    const report = buildExaminerBenchmark(rows);
    const high = report.calibration.ai[report.calibration.ai.length - 1]!;
    const low = report.calibration.ai[0]!;
    expect(high.n).toBe(1);
    expect(high.withinOneShare).toBe(1);
    expect(low.n).toBe(1);
    expect(low.withinOneShare).toBe(0); // two marks off consensus despite claimed certainty
  });
});

describe("stratificationReport", () => {
  it("tracks coverage against Phase-1 quotas and names gaps", () => {
    const rows: BenchmarkRow[] = [
      row({ subjectId: "wjec-gcse-biology", qualificationLevel: "gcse", tariffBand: "6+", questionKind: "practical", qualityBand: "weak" }),
      row({ subjectId: "wjec-gcse-biology", qualificationLevel: "gcse", tariffBand: "1-2", questionKind: "calculation", qualityBand: "borderline" }),
    ];
    const report = stratificationReport(rows);
    const biology = report.find((r) => r.key === "subject:biology")!;
    expect(biology.actual).toBe(2);
    expect(biology.met).toBe(false); // quota is 55 in Phase 1

    const gcseLevel = report.find((r) => r.key === "level:gcse")!;
    expect(gcseLevel.actual).toBe(2);

    const sixPlus = report.find((r) => r.key === "tariff:6+")!;
    expect(sixPlus.met).toBe(false);
    expect(report.every((r) => r.required > 0)).toBe(true);
  });
});
