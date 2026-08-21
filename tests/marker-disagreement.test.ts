import { describe, expect, it } from "vitest";
import { markQuestion } from "@/domain/marking";
import { HUMAN_MARKING_CORPUS } from "@/domain/human-marking-corpus";
import {
  scoreMarkerDisagreement,
  trackMarkerDisagreement,
} from "@/domain/marker-disagreement";

describe("marker disagreement tracking", () => {
  it("tracks per-part disagreement and marker bias", () => {
    const report = trackMarkerDisagreement([
      {
        rowId: "row-1",
        questionId: "question-1",
        label: "mixed awards",
        awards: {
          human: [2, 1],
          rubric: [1, 1],
          ai: [2, 0],
        },
      },
      {
        rowId: "row-2",
        questionId: "question-2",
        label: "blank",
        awards: {
          human: [0],
          rubric: [0],
          ai: [1],
        },
      },
    ]);

    const humanRubric = report.metrics.find((metric) => metric.pair === "human-vs-rubric")!;
    expect(humanRubric.comparedRows).toBe(2);
    expect(humanRubric.comparedParts).toBe(3);
    expect(humanRubric.disagreementCount).toBe(1);
    expect(humanRubric.partAgreement).toBeCloseTo(2 / 3);
    expect(humanRubric.meanAbsoluteDifference).toBeCloseTo(1 / 3);
    expect(humanRubric.signedBias).toBeCloseTo(-1 / 3);
    expect(humanRubric.totalAgreement).toBeCloseTo(0.5);
    expect(humanRubric.maxAbsoluteDifference).toBe(1);

    const firstRow = report.rows[0]!;
    expect(firstRow.pairs["human-vs-rubric"]!.meanAbsoluteDifference).toBeCloseTo(0.5);
    expect(firstRow.pairs["human-vs-rubric"]!.signedBias).toBeCloseTo(-0.5);
  });

  it("leaves unavailable marker pairs explicitly unmeasured", () => {
    const report = trackMarkerDisagreement([
      {
        rowId: "row-1",
        questionId: "question-1",
        label: "rubric only",
        awards: { human: [1], rubric: [0] },
      },
    ]);

    const humanAi = report.metrics.find((metric) => metric.pair === "human-vs-ai")!;
    expect(humanAi.comparedRows).toBe(0);
    expect(humanAi.comparedParts).toBe(0);
    expect(humanAi.partAgreement).toBeNull();
    expect(humanAi.meanAbsoluteDifference).toBeNull();
    expect(humanAi.signedBias).toBeNull();
    expect(report.rows[0]!.awards.ai).toBeUndefined();
    expect(report.rows[0]!.pairs["human-vs-ai"]).toBeUndefined();
  });

  it("scores corpus rows against the available rubric marker", () => {
    const report = scoreMarkerDisagreement(HUMAN_MARKING_CORPUS, {
      rubric: (question, answers) => markQuestion(question, answers),
    });

    const humanRubric = report.metrics.find((metric) => metric.pair === "human-vs-rubric")!;
    const humanAi = report.metrics.find((metric) => metric.pair === "human-vs-ai")!;

    expect(report.corpusId).toBe(HUMAN_MARKING_CORPUS.id);
    expect(report.corpusVersion).toBe(HUMAN_MARKING_CORPUS.version);
    expect(humanRubric.comparedRows).toBe(HUMAN_MARKING_CORPUS.rows.length);
    expect(humanRubric.comparedParts).toBe(18);
    expect(humanRubric.meanAbsoluteDifference).toBeCloseTo(6 / 18);
    expect(humanRubric.totalAgreement).toBeCloseTo(7 / 12);
    expect(humanAi.comparedRows).toBe(0);
  });
});
