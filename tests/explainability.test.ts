import { describe, expect, it } from "vitest";
import { explainMark, explainRecommendation } from "@/domain/explainability";
import type { MarkEvidence, Recommendation } from "@/domain/types";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

describe("explainability", () => {
  it("marking — which points earned/missing/ambiguous and why", () => {
    const evidence: MarkEvidence[] = [
      { point: "Uses E=hc/lambda", status: "credited", evidence: "E=hc/lambda", evidenceStrength: "strong", confidence: 0.9, explanation: "Awarded" },
      { point: "Correct units", status: "missed", evidence: null, evidenceStrength: "none", confidence: 0, explanation: "Not awarded" },
      { point: "Final answer", status: "missed", evidence: "approx 5e-19", evidenceStrength: "partial", confidence: 0.4, explanation: "Not awarded: partial" },
    ];
    const mockRecord = {} as AnswerCorpusRecord;
    const verdicts = explainMark(mockRecord, evidence);
    expect(verdicts.find((v) => v.point.includes("E=hc"))?.status).toBe("clearly-earned");
    expect(verdicts.find((v) => v.point.includes("Correct units"))?.status).toBe("missing");
    expect(verdicts.find((v) => v.point.includes("Final answer"))?.status).toBe("ambiguous");
    expect(verdicts.every((v) => v.reason.length > 0)).toBe(true);
  });

  it("recommendations — weakness, evidence, action, expected benefit", () => {
    const rec: Recommendation = {
      activity: "practice",
      subjectId: "subj",
      topicId: "t1",
      minutes: 20,
      reason: "Weak topic",
      score: 42,
      explanation: { recoverableMarks: 4, marksPerHour: 12, lastEvidencePercent: 35, daysSinceRetrieval: 7, daysToExam: 14, paperLabel: "Paper 1", factors: { examGain: 4, urgency: 1.4, weakness: 1.6, forgetting: 1.2, uncertainty: 1.3 } },
      factors: { examGain: 4, urgency: 1.4, weakness: 1.6, forgetting: 1.2, uncertainty: 1.3 },
    };
    const exp = explainRecommendation(rec);
    expect(exp.identifiedWeakness).toContain("t1");
    expect(exp.supportingEvidence.length).toBeGreaterThan(0);
    expect(exp.recommendedAction).toContain("exam-style");
    expect(exp.expectedBenefit).toContain("4");
    expect(exp.confidenceNote).toBeDefined();
  });

  it("low confidence note when uncertainty high", () => {
    const rec: Recommendation = {
      activity: "learn",
      subjectId: "subj",
      topicId: "t2",
      minutes: 15,
      reason: "New topic",
      score: 10,
      explanation: { recoverableMarks: 2, marksPerHour: null, lastEvidencePercent: null, daysSinceRetrieval: null, daysToExam: null, paperLabel: null, factors: { examGain: 2, urgency: 1, weakness: 1.6, forgetting: 1.1, uncertainty: 1.4 } },
      factors: { examGain: 2, urgency: 1, weakness: 1.6, forgetting: 1.1, uncertainty: 1.4 },
    };
    const exp = explainRecommendation(rec);
    expect(exp.confidenceNote.toLowerCase()).toContain("low");
  });
});
