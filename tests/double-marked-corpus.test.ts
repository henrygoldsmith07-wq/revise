import { describe, expect, it } from "vitest";
import {
  analyseDoubleMarkedAnswer,
  buildDoubleMarkedCorpusReport,
  parseDoubleMarkedCorpus,
  serialiseDoubleMarkedCorpus,
} from "@/domain/double-marked-corpus";
import type { DoubleMarkedAnswer } from "@/domain/double-marked-corpus";

function row(overrides: Partial<DoubleMarkedAnswer> = {}): DoubleMarkedAnswer {
  return {
    id: "answer-1",
    questionId: "question-1",
    partId: "question-1:a",
    subjectId: "chemistry",
    prompt: "Explain the trend.",
    answer: "The trend increases because shielding is similar.",
    maxMarks: 2,
    markerA: { markerId: "marker-a", awarded: 2 },
    markerB: { markerId: "marker-b", awarded: 2 },
    provenance: "imported",
    ...overrides,
  };
}

describe("double-marked answer corpus", () => {
  it("keeps original disagreement visible even after adjudication", () => {
    const analysis = analyseDoubleMarkedAnswer(
      row({ markerA: { markerId: "marker-a", awarded: 1 }, markerB: { markerId: "marker-b", awarded: 2 }, adjudication: { awarded: 2 } }),
    );
    expect(analysis.status).toBe("adjudicated");
    expect(analysis.difference).toBe(1);
    expect(analysis.normalisedDifference).toBe(0.5);
  });

  it("reports exact agreement, tolerance, bias and pending review separately", () => {
    const report = buildDoubleMarkedCorpusReport([
      row(),
      row({ id: "answer-2", subjectId: "physics", markerA: { markerId: "marker-a", awarded: 1 }, markerB: { markerId: "marker-b", awarded: 2 } }),
      row({ id: "answer-3", markerA: { markerId: "marker-a", awarded: 0 }, markerB: { markerId: "marker-b", awarded: 1 }, adjudication: { awarded: 1 } }),
    ]);
    expect(report.rows).toBe(3);
    expect(report.exactAgreement).toBe(1);
    expect(report.exactAgreementRate).toBeCloseTo(1 / 3);
    expect(report.withinOneMark).toBe(3);
    expect(report.meanAbsoluteDifference).toBeCloseTo(2 / 3);
    expect(report.markerBias).toBeCloseTo(2 / 3);
    expect(report.disagreements).toBe(2);
    expect(report.pendingAdjudication).toBe(1);
    expect(report.adjudicatedRows).toBe(1);
    expect(report.bySubject[0]?.subjectId).toBe("chemistry");
  });

  it("parses valid rows, marks them as imported and reports malformed rows", () => {
    const result = parseDoubleMarkedCorpus(
      JSON.stringify({
        formatVersion: 1,
        rows: [
          { ...row({ id: "valid" }), answer: "" },
          { ...row({ id: "bad" }), markerA: { markerId: "same", awarded: 9 }, markerB: { markerId: "same", awarded: 0 } },
        ],
      }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.provenance).toBe("imported");
    expect(result.rows[0]?.answer).toBe("");
    expect(result.errors[0]).toContain("markerA.awarded");
  });

  it("round-trips the versioned export format", () => {
    const original = row({ adjudication: { awarded: 2, note: "Clear final mark." } });
    const result = parseDoubleMarkedCorpus(serialiseDoubleMarkedCorpus([original]));
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toEqual(original);
  });

  it("rejects a corpus where the two marker IDs are not independent", () => {
    const result = parseDoubleMarkedCorpus(JSON.stringify([{ ...row(), markerB: { markerId: "marker-a", awarded: 2 } }]));
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toContain("independent marker IDs");
  });
});

