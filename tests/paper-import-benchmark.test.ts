import { describe, expect, it } from "vitest";
import {
  IMPORT_REVIEW_THRESHOLD,
  diagramAssociationAccuracy,
  importConfidence,
  markExtractionAccuracy,
  markSchemePairingAccuracy,
  segmentationF1,
  specPointPR,
  subpartDetectionF1,
  topicMappingAccuracy,
  type GoldPaper,
  type ImportedQuestionPrediction,
} from "@/domain/paper-import-benchmark";

// ---------------------------------------------------------------------------
// Paper-import benchmark — metric math on fixtures where every count is
// hand-checkable, plus the confidence model that routes low-confidence
// imports to human review.
// ---------------------------------------------------------------------------

const goldQ = {
  label: "4",
  startChar: 100,
  endChar: 900,
  totalMarks: 6,
  hasTable: false,
  parts: [
    { label: "(a)", marks: 2, commandWord: "State", schemeLineIndices: [3], specPointIds: ["s.sp-01"], topics: ["homeostasis"] },
    { label: "(b)", marks: 4, commandWord: "Explain", schemeLineIndices: [4, 5], specPointIds: ["s.sp-02"], topics: ["homeostasis"] },
  ],
  figures: [{ figureId: "fig-1", attachedTo: ["(b)"] }],
};

const goldPaper: GoldPaper = {
  paperId: "gold-1",
  board: "wjec",
  qualificationLevel: "alevel",
  subjectId: "wjec-alevel-biology",
  year: 2023,
  series: "Summer 2023",
  sourceText: "…",
  markSchemeText: "…",
  questions: [goldQ],
  annotators: [
    { role: "examiner", id: "ex-a" },
    { role: "teacher", id: "t-b" },
  ],
  adjudicated: true,
};

const perfectImport: ImportedQuestionPrediction[] = [
  {
    label: "4",
    startChar: 120,
    endChar: 850,
    totalMarks: 6,
    hasTable: false,
    attachedFigureIds: [],
    parts: [
      { label: "(a)", marks: 2, commandWord: "State", schemeLineIndices: [3], specPointIds: ["s.sp-01"], topics: [{ id: "homeostasis", score: 0.9 }] },
      { label: "(b)", marks: 4, commandWord: "Explain", schemeLineIndices: [4, 5], specPointIds: ["s.sp-02"], topics: [{ id: "homeostasis", score: 0.85 }] },
    ],
  },
];

describe("segmentationF1", () => {
  it("scores perfect import at F1 1", () => {
    expect(segmentationF1(perfectImport, goldPaper.questions)).toMatchObject({ tp: 1, fp: 0, fn: 0, f1: 1 });
  });

  it("penalises a missed boundary and a spurious one", () => {
    const pred: ImportedQuestionPrediction[] = [
      { ...perfectImport[0] }, // matches
      { ...perfectImport[0], label: "5", startChar: 950 }, // hallucinated question 5 (no gold)
    ];
    // Gold also contains an unimported question:
    const goldTwo = {
      ...goldPaper,
      questions: [...goldPaper.questions, { ...goldQ, label: "6", startChar: 1000, endChar: 1500 }],
    };
    const r = segmentationF1(pred, goldTwo.questions);
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(1);
    expect(r.f1).toBeCloseTo(0.5);
  });
});

describe("subpart / mark / pairing / topic / spec metrics", () => {
  it("detects subparts by normalised labels", () => {
    const pred: ImportedQuestionPrediction[] = [
      {
        ...perfectImport[0],
        parts: [
          perfectImport[0].parts[0],
          { ...perfectImport[0].parts[1], label: "b" }, // same part, different formatting
        ],
      },
    ];
    expect(subpartDetectionF1(pred[0], goldQ).f1).toBe(1);
  });

  it("mark extraction requires exact values per part and total", () => {
    const good = markExtractionAccuracy(perfectImport, goldPaper.questions);
    expect(good.partAccuracy).toBe(1);
    expect(good.totalAccuracy).toBe(1);

    const wrong = markExtractionAccuracy(
      [
        {
          ...perfectImport[0],
          totalMarks: 7,
          parts: [perfectImport[0].parts[0], { ...perfectImport[0].parts[1], marks: 3 }],
        },
      ],
      goldPaper.questions,
    );
    expect(wrong.partAccuracy).toBe(0);
    expect(wrong.totalAccuracy).toBe(0);
  });

  it("pairs mark-scheme lines by index", () => {
    const paired = markSchemePairingAccuracy(perfectImport, goldPaper.questions);
    const misaligned = markSchemePairingAccuracy(
      [
        {
          ...perfectImport[0],
          parts: [
            perfectImport[0].parts[0],
            { ...perfectImport[0].parts[1], schemeLineIndices: [99] },
          ],
        },
      ],
      goldPaper.questions,
    );
    expect(paired).toBe(1);
    expect(misaligned).toBe(0.5); // (a) aligned, (b) not
  });

  it("reports topic top-1 and top-3 separately", () => {
    const withRanking: ImportedQuestionPrediction[] = [
      {
        ...perfectImport[0],
        parts: [
          perfectImport[0].parts[0],
          {
            ...perfectImport[0].parts[1],
            topics: [
              { id: "enzymes", score: 0.6 },
              { id: "respiration", score: 0.3 },
              { id: "homeostasis", score: 0.1 },
            ],
          },
        ],
      },
    ];
    const r = topicMappingAccuracy(withRanking, goldPaper.questions);
    expect(r.top1).toBeCloseTo(0.5); // part (a) still ranks homeostasis first
    expect(r.top3).toBe(1); // …but homeostasis is inside the top three
  });

  it("computes spec-point precision and recall over sets", () => {
    const partial: ImportedQuestionPrediction[] = [
      {
        ...perfectImport[0],
        parts: [
          { ...perfectImport[0].parts[0], specPointIds: ["s.sp-01", "s.sp-99"] },
          { ...perfectImport[0].parts[1], specPointIds: [] },
        ],
      },
    ];
    const pr = specPointPR(partial, goldPaper.questions);
    expect(pr.tp).toBe(1);
    expect(pr.fp).toBe(1);
    expect(pr.fn).toBe(1);
    expect(pr.precision).toBe(0.5);
    expect(pr.recall).toBe(0.5);
  });

  it("associates diagrams to the right parts", () => {
    const withFigure: ImportedQuestionPrediction[] = [
      {
        ...perfectImport[0],
        attachedFigureIds: ["fig-1"],
        parts: [
          perfectImport[0].parts[0],
          { ...perfectImport[0].parts[1], attachedFigureIds: ["fig-1"] },
        ],
      },
    ];
    const r = diagramAssociationAccuracy(withFigure, goldPaper.questions);
    expect(r.correct).toBe(1);
    expect(r.fn).toBe(0);

    const missing = diagramAssociationAccuracy(perfectImport, goldPaper.questions);
    expect(missing.fn).toBe(1);
  });
});

describe("confidence model", () => {
  it("full signals reach ~0.95 and clear the review threshold", () => {
    const c = importConfidence({
      marksParsed: true,
      totalMarksParsed: true,
      schemePaired: true,
      topicTop1Score: 1,
      specMappedCount: 2,
      hasCommandWord: true,
    });
    expect(c).toBeGreaterThan(IMPORT_REVIEW_THRESHOLD);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("routes unparsed marks and unmapped specs to review", () => {
    const c = importConfidence({
      marksParsed: false,
      totalMarksParsed: false,
      schemePaired: false,
      topicTop1Score: 0.2,
      specMappedCount: 0,
      hasCommandWord: false,
    });
    expect(c).toBeLessThan(IMPORT_REVIEW_THRESHOLD);
    expect(c >= 0).toBe(true);
  });
});
