import { describe, expect, it } from "vitest";
import { aiVsHumanMetrics, humanAgreementMetrics } from "@/domain/double-marking-agreement";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

function rec(id: string, max: number, h1: number | null, h2: number | null, adj: number | null): AnswerCorpusRecord {
  return {
    id,
    questionId: `q-${id}`,
    subject: "subj",
    specification: "A200QS",
    topic: "subj.topic",
    questionText: "q",
    markScheme: Array.from({ length: max }, (_, i) => `p${i}`),
    maximumMarks: max,
    commandWord: "explain",
    difficulty: 3,
    questionTypeTags: ["explain"],
    studentAnswer: "ans",
    humanMark1: h1,
    humanMark2: h2,
    adjudicatedMark: adj,
    humanFeedback: null,
    identifiedMisconceptions: [],
    source: "teacher-reviewed",
    reviewStatus: "double-marked",
    provenance: "test",
    benchmarkVersion: "v1",
    createdAt: new Date().toISOString(),
  };
}

describe("double-marking and human agreement", () => {
  it("calculates exact, within±1, weighted agreement, disagreement & adjudication rates", () => {
    const records = [
      rec("1", 4, 4, 4, 4), // exact, adjudicated
      rec("2", 4, 2, 3, 3), // within1, adjudicated
      rec("3", 4, 1, 3, null), // gap 2, pending
      rec("4", 2, 0, 0, null), // exact, no adjudication yet? still double-marked
    ];
    const m = humanAgreementMetrics(records);
    expect(m.pairs).toBe(4);
    expect(m.exactAgreement).toBe(2);
    expect(m.exactAgreementRate).toBeCloseTo(0.5);
    expect(m.withinOneAgreement).toBe(3);
    expect(m.withinOneRate).toBeCloseTo(0.75);
    expect(m.disagreementRate).toBeCloseTo(0.5);
    expect(m.adjudicationRate).toBeCloseTo(0.5);
    expect(m.weightedAgreement).toBeGreaterThan(0.5);
    expect(m.meanAbsoluteDifference).toBeCloseTo(0.75);
  });

  it("separately calculates AI vs marker A / B / consensus", () => {
    const records = [
      rec("1", 4, 2, 2, 2),
      rec("2", 4, 1, 3, 2),
      rec("3", 4, 0, 0, 0),
    ];
    const aiMark = (r: AnswerCorpusRecord) => {
      if (r.id === "1") return 2;
      if (r.id === "2") return 3; // matches B but not A
      return 0;
    };
    const m = aiVsHumanMetrics(records, aiMark);
    expect(m.vsMarkerA.exact).toBeLessThan(1);
    expect(m.vsMarkerB.exact).toBe(1);
    expect(m.vsConsensus.exact).toBeCloseTo(2 / 3, 2);
    expect(m.aiLabelled).toBe(3);
  });

  it("returns zeros when no double-marked pairs", () => {
    const m = humanAgreementMetrics([rec("1", 2, 1, null, null)]);
    expect(m.pairs).toBe(0);
    expect(m.exactAgreementRate).toBe(0);
  });
});
