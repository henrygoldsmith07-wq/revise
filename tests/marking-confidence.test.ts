import { describe, expect, it } from "vitest";
import {
  assessDeterministicMark,
  assessMarkConfidence,
  markAssessmentLabel,
  markAssessmentRecord,
} from "@/domain/marking-confidence";
import { LOW_CONFIDENCE_MARK_THRESHOLD, assessLowConfidenceMark } from "@/domain/mark-escalation";
import type { MarkedPart, Question } from "@/domain/types";

const question: Pick<Question, "kind" | "parts"> = {
  kind: "short",
  parts: [
    {
      id: "a",
      label: "(a)",
      prompt: "Explain why the current decreases.",
      marks: 2,
      markScheme: ["resistance increases as temperature rises", "current is inversely proportional to resistance"],
      modelAnswer: "",
    },
    {
      id: "b",
      label: "(b)",
      prompt: "State the unit of resistance.",
      marks: 1,
      markScheme: ["ohm"],
      modelAnswer: "",
    },
  ],
};

const answers = {
  a: "The resistance increases as temperature rises, so the current falls because current is inversely proportional to resistance.",
  b: "ohm",
};

const goodMarks: MarkedPart[] = [
  {
    partId: "a",
    awarded: 2,
    max: 2,
    creditedPoints: ["resistance increases as temperature rises", "current is inversely proportional to resistance"],
    missedPoints: [],
    comment: "",
  },
  { partId: "b", awarded: 1, max: 1, creditedPoints: ["ohm"], missedPoints: [], comment: "" },
];

describe("confidence-aware marking — AI interpretation checked deterministically", () => {
  it("a consistent, confident AI mark is AI-checked and not provisional", () => {
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks, confidence: 0.9 }, tier: "ai", rubric: goodMarks });
    expect(result.authority).toBe("ai-checked");
    expect(result.provisional).toBe(false);
    expect(result.level).toBe("high");
    expect(result.failedChecks).toEqual([]);
    expect(result.label).toContain("checked against the mark scheme");
  });

  it("a missing model confidence makes the mark provisional and low", () => {
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks }, tier: "ai", rubric: goodMarks });
    expect(result.provisional).toBe(true);
    expect(result.level).toBe("low");
    expect(result.failedChecks).toContain("model-confidence");
    expect(result.score).toBeLessThan(LOW_CONFIDENCE_MARK_THRESHOLD);
  });

  it("corrects impossible marks deterministically and never shows them", () => {
    const inflated: MarkedPart[] = [
      { ...goodMarks[0]!, awarded: 5, max: 5 },
      { ...goodMarks[1]! },
    ];
    const result = assessMarkConfidence({ question, answers, mark: { marked: inflated, confidence: 0.95 }, tier: "ai", rubric: goodMarks });
    expect(result.marked[0]!.awarded).toBe(2);
    expect(result.marked[0]!.max).toBe(2);
    expect(result.failedChecks).toContain("tariff");
    expect(result.provisional).toBe(true);
    expect(result.score).toBeLessThanOrEqual(0.4);
  });

  it("removes credit for a blank answer", () => {
    const result = assessMarkConfidence({
      question,
      answers: { a: answers.a, b: "   " },
      mark: { marked: goodMarks, confidence: 0.9 },
      tier: "ai",
      rubric: goodMarks,
    });
    expect(result.marked.find((m) => m.partId === "b")!.awarded).toBe(0);
    expect(result.failedChecks).toContain("blank-answer");
    expect(result.provisional).toBe(true);
  });

  it("fills a part the model skipped from the deterministic rubric and flags it", () => {
    const rubric: MarkedPart[] = [goodMarks[0]!, { ...goodMarks[1]!, comment: "rubric" }];
    const result = assessMarkConfidence({ question, answers, mark: { marked: [goodMarks[0]!], confidence: 0.9 }, tier: "ai", rubric });
    expect(result.marked.map((m) => m.partId)).toEqual(["a", "b"]);
    expect(result.marked[1]!.comment).toBe("rubric");
    expect(result.failedChecks).toContain("part-coverage");
  });

  it("flags credit for points that are not in the mark scheme, and more marks than credited points", () => {
    const invented: MarkedPart[] = [
      { ...goodMarks[0]!, creditedPoints: ["mentions electrons drifting faster"] },
      goodMarks[1]!,
    ];
    const result = assessMarkConfidence({ question, answers, mark: { marked: invented, confidence: 0.9 }, tier: "ai", rubric: goodMarks });
    expect(result.failedChecks).toEqual(expect.arrayContaining(["points-in-scheme", "credit-count"]));
    expect(result.provisional).toBe(true);
  });

  it("flags disagreement with the deterministic rubric", () => {
    const rubric: MarkedPart[] = [
      { ...goodMarks[0]!, awarded: 0, creditedPoints: [] },
      { ...goodMarks[1]!, awarded: 0, creditedPoints: [] },
    ];
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks, confidence: 0.9 }, tier: "ai", rubric });
    expect(result.failedChecks).toContain("rubric-agreement");
    expect(result.provisional).toBe(true);
  });

  it("treats cache and on-device model grades as AI interpretations too", () => {
    for (const tier of ["cache", "local"] as const) {
      const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks }, tier, rubric: goodMarks });
      expect(result.authority).toBe("ai-provisional");
    }
  });

  it("feeds the escalation queue: a provisional low mark requests review", () => {
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks, confidence: 0.4 }, tier: "ai", rubric: goodMarks });
    expect(assessLowConfidenceMark({ markedBy: "ai", confidence: result.score }).escalate).toBe(true);
  });
});

describe("confidence-aware marking — deterministic marks stay authoritative", () => {
  it("an answer-key (MCQ) mark is deterministic, high and final", () => {
    const result = assessDeterministicMark({ marked: [goodMarks[1]!], rubricConfidence: null });
    expect(result).toMatchObject({ authority: "deterministic", level: "high", provisional: false });
  });

  it("a rubric mark with weak evidence is provisional, never presented as definitive", () => {
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks }, tier: "fallback", rubric: null, rubricConfidence: 0.4 });
    expect(result.authority).toBe("deterministic");
    expect(result.provisional).toBe(true);
    expect(result.label).toContain("Provisional");
  });

  it("stores a durable record and relabels it on reload", () => {
    const result = assessMarkConfidence({ question, answers, mark: { marked: goodMarks }, tier: "ai", rubric: goodMarks });
    const record = markAssessmentRecord(result);
    expect(Object.keys(record).sort()).toEqual(["authority", "failedChecks", "level", "modelConfidence", "provisional", "version"]);
    expect(markAssessmentLabel(record)).toBe(result.label);
  });
});
