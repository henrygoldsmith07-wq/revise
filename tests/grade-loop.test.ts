import { describe, expect, it } from "vitest";
import {
  analyseGradeLoop,
  gradeConfidenceNarrative,
  pairPredictionsWithActuals,
  type ActualResultRecord,
  type GradePredictionRecord,
} from "@/domain/grade-loop";

// ---------------------------------------------------------------------------
// Grade-prediction loop — as-of pairing, metric formulas and honest narrative
// on fixtures where every number is hand-countable.
// ---------------------------------------------------------------------------

const SUBJECT = "wjec-alevel-physics";

function prediction(over: Partial<GradePredictionRecord>): GradePredictionRecord {
  return {
    id: `pred-${over.createdAt}`,
    anonId: "p1",
    subjectId: SUBJECT,
    predictedPercent: 76,
    lowerPercent: 71,
    upperPercent: 81,
    gradeLabel: "A",
    confidence: 0.6,
    evidenceShare: 0.4,
    createdAt: over.createdAt ?? "2026-03-01T00:00:00.000Z",
    examDate: "2026-05-15",
    ...over,
  };
}

function actual(over: Partial<ActualResultRecord>): ActualResultRecord {
  return {
    id: `act-${over.takenAt}`,
    anonId: "p1",
    subjectId: SUBJECT,
    percent: 74,
    kind: "mock",
    takenAt: over.takenAt ?? "2026-03-15T00:00:00.000Z",
    ...over,
  };
}

describe("pairPredictionsWithActuals", () => {
  it("pairs each actual with the latest prediction made before it", () => {
    const predictions = [
      prediction({ id: "p-mar1", createdAt: "2026-03-01T00:00:00.000Z", predictedPercent: 76 }),
      prediction({ id: "p-mar10", createdAt: "2026-03-10T00:00:00.000Z", predictedPercent: 78, lowerPercent: 73, upperPercent: 83 }),
    ];
    const actuals = [
      actual({ takenAt: "2026-03-15T00:00:00.000Z" }), // pairs with p-mar10
      actual({ id: "early", takenAt: "2026-03-05T00:00:00.000Z" }), // pairs with p-mar1
      actual({ id: "other-subject", subjectId: "wjec-alevel-biology", takenAt: "2026-03-15T00:00:00.000Z" }), // no predictions -> dropped
    ];
    const pairs = pairPredictionsWithActuals(predictions, actuals);
    expect(pairs).toHaveLength(2);
    const mar15 = pairs.find((p) => p.actualId === "act-2026-03-15T00:00:00.000Z")!;
    expect(mar15.predictionId).toBe("p-mar10");
    expect(mar15.error).toBe(-4); // actual − predicted
    expect(mar15.insideInterval).toBe(true);
  });

  it("never lets a later prediction fix an earlier miss (as-of join)", () => {
    const pairs = pairPredictionsWithActuals(
      [prediction({ id: "late-pred", createdAt: "2026-04-01T00:00:00.000Z", predictedPercent: 74 })],
      [actual({ takenAt: "2026-03-15T00:00:00.000Z" })],
    );
    expect(pairs).toHaveLength(0);
  });

  it("computes days before exam from the paired prediction's exam date", () => {
    const pairs = pairPredictionsWithActuals([prediction({})], [actual({})]);
    expect(pairs[0].daysBeforeExam).toBe(75); // Mar 1 → May 15: measured from prediction, not actual
  });
});

describe("analyseGradeLoop", () => {
  it("reports MAE, bias, interval coverage and calibration bins", () => {
    const predictions = [
      prediction({ id: "a", createdAt: "2026-03-01T00:00:00.000Z", predictedPercent: 76, lowerPercent: 71, upperPercent: 81 }),
      prediction({ id: "b", createdAt: "2026-03-02T00:00:00.000Z", predictedPercent: 60, lowerPercent: 55, upperPercent: 65 }),
      prediction({ id: "c", createdAt: "2026-03-03T00:00:00.000Z", predictedPercent: 70, lowerPercent: 66, upperPercent: 74 }),
      prediction({ id: "d", createdAt: "2026-03-04T00:00:00.000Z", predictedPercent: 80, lowerPercent: 76, upperPercent: 84 }),
      prediction({ id: "e", createdAt: "2026-03-05T00:00:00.000Z", predictedPercent: 72, lowerPercent: 68, upperPercent: 76 }),
    ].map((p, i) => ({
      ...p,
      subjectId: i === 4 ? "wjec-alevel-biology" : p.subjectId,
    }));
    const actuals: ActualResultRecord[] = [
      actual({ id: "r1", percent: 74 }), // vs a: error −2, inside CI
      actual({ id: "r2", takenAt: "2026-03-06T00:00:00.000Z", percent: 70 }), // vs b: +10, outside CI
      actual({ id: "r3", takenAt: "2026-03-07T00:00:00.000Z", percent: 69 }), // vs c: −1, inside
      actual({ id: "r4", takenAt: "2026-03-08T00:00:00.000Z", percent: 79 }), // vs d: −1, inside
      actual({ id: "r5", takenAt: "2026-03-09T00:00:00.000Z", subjectId: "wjec-alevel-biology", percent: 75 }), // vs e: +3, inside
    ];
    const report = analyseGradeLoop({ predictions, actuals });
    expect(report.pairs).toBe(5);
    // As-of join: prediction d (Mar 4) is the latest before EVERY actual,
    // so errors are −6, −10, −11, −1, +3 → MAE 6.2, bias −5.0 (over-predicts),
    // and only r4/r5 land inside their intervals.
    expect(report.mae).toBeCloseTo(6.2, 1);
    expect(report.bias).toBeCloseTo(-5.0, 1);
    expect(report.intervalCoverage).toBeCloseTo(0.4);

    // Every pair lands in exactly one predicted-decile bin.
    expect(report.calibration.reduce((acc, row) => acc + row.pairs, 0)).toBe(5);
    expect(report.bySubject.length).toBe(2);
    // All five actuals sit 31–90 days before the May exam date.
    expect(report.byDistance.days31to90.pairs).toBe(5);
    expect(report.byDistance.within30Days.pairs).toBe(0);
    expect(report.insufficientData).toBe(false);
  });

  it("breaks accuracy down by evidence amount at prediction time", () => {
    const lowEvidence = prediction({
      id: "low-ev",
      createdAt: "2026-03-01T00:00:00.000Z",
      evidenceShare: 0.18,
      confidence: 0.3,
      predictedPercent: 70,
    });
    const highEvidence = prediction({
      id: "high-ev",
      createdAt: "2026-03-02T00:00:00.000Z",
      subjectId: "wjec-alevel-biology",
      evidenceShare: 0.8,
      confidence: 0.9,
      predictedPercent: 70,
    });
    const report = analyseGradeLoop({
      predictions: [lowEvidence, highEvidence],
      actuals: [
        actual({ id: "lo", percent: 85, takenAt: "2026-03-20T00:00:00.000Z" }), // low-evidence badly wrong
        actual({ id: "hi", subjectId: "wjec-alevel-biology", percent: 71, takenAt: "2026-03-21T00:00:00.000Z" }),
      ],
    });
    expect(report.byEvidence.under25.mae).toBeGreaterThan(report.byEvidence.over60.mae!);
  });

  it("stays quiet below five pairs", () => {
    const report = analyseGradeLoop({
      predictions: [prediction({})],
      actuals: [actual({})],
    });
    expect(report.insufficientData).toBe(true);
    expect(report.note).toContain("five pairs");
    expect(report.mae).toBe(2); // raw value still shown, just flagged
  });
});

describe("gradeConfidenceNarrative", () => {
  it("says the quiet part loudly for thin evidence", () => {
    expect(
      gradeConfidenceNarrative({ gradeLabel: "B", confidence: 0.35, evidenceShare: 0.18 }),
    ).toBe(
      "Your predicted grade is currently B, but confidence is low because you've completed only 18% of assessed specification points.",
    );
  });

  it("marks building and high-confidence tiers without fake precision", () => {
    expect(
      gradeConfidenceNarrative({ gradeLabel: "A", confidence: 0.8, evidenceShare: 0.7 }),
    ).toContain("high confidence");
    expect(gradeConfidenceNarrative({ gradeLabel: "C", confidence: 0.6, evidenceShare: 0.45 })).toContain("building");
  });
});
