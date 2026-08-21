import { describe, expect, it } from "vitest";
import { buildMarkingValidationReport, humanVsAiAgreement } from "@/domain/marking-validation";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

function rec(id: string, subject: string, command: AnswerCorpusRecord["commandWord"], difficulty: 1 | 2 | 3 | 4 | 5, max: number, type: string[], h1: number | null, h2: number | null, adj: number | null): AnswerCorpusRecord {
  return {
    id,
    questionId: `q-${id}`,
    subject,
    specification: "A200QS",
    topic: `${subject}.topic`,
    questionText: "prompt",
    markScheme: Array.from({ length: max }, (_, i) => `point ${i}`),
    maximumMarks: max,
    commandWord: command as AnswerCorpusRecord["commandWord"],
    difficulty,
    questionTypeTags: type as AnswerCorpusRecord["questionTypeTags"],
    studentAnswer: "answer",
    humanMark1: h1,
    humanMark2: h2,
    adjudicatedMark: adj,
    humanFeedback: null,
    identifiedMisconceptions: [],
    source: "teacher-reviewed",
    reviewStatus: adj != null ? "adjudicated" : h2 != null ? "double-marked" : "single-marked",
    provenance: "test",
    benchmarkVersion: "2026.08.v2",
    createdAt: new Date().toISOString(),
  };
}

describe("marking validation dashboard", () => {
  it("computes exact/within1/mae/median/over/under/major per spec", () => {
    const records = [
      rec("1", "wjec-alevel-physics", "calculate", 2, 2, ["calculation"], 2, null, null), // consensus 2
      rec("2", "wjec-alevel-physics", "calculate", 2, 2, ["calculation"], 1, 1, 1), // consensus 1
      rec("3", "aqa-gcse-biology", "evaluate", 4, 6, ["evaluate","6plus-extended"], 4, 4, 4), // consensus 4
      rec("4", "aqa-gcse-biology", "evaluate", 4, 6, ["evaluate"], 2, 2, 2), // consensus 2
    ];
    // ai perfect on 1,2, off by 2 on 3, off by -1 on 4
    const ai = (r: AnswerCorpusRecord) => {
      if (r.id === "1") return 2;
      if (r.id === "2") return 1;
      if (r.id === "3") return 6; // over by 2 -> major
      if (r.id === "4") return 1; // under by 1
      return 0;
    };
    const report = buildMarkingValidationReport({ records, aiMark: ai, provenance: "internal-regression" });
    expect(report.summary.total).toBe(4);
    expect(report.summary.exactAgreement).toBe(2);
    expect(report.summary.exactAgreementRate).toBeCloseTo(0.5);
    expect(report.summary.withinOneAgreement).toBe(3);
    expect(report.summary.meanAbsoluteError).toBeCloseTo(0.75);
    expect(report.summary.overMarkingRate).toBeCloseTo(0.25);
    expect(report.summary.underMarkingRate).toBeCloseTo(0.25);
    expect(report.summary.majorErrorRate).toBeCloseTo(0.25);
    expect(report.internalVsExternalWarning).toContain("Internal regression");
    expect(report.summary.medianAbsoluteError).toBeDefined();
  });

  it("breaks down by subject/topic/command/mark total/type/difficulty", () => {
    const records = [
      rec("1", "subj-a", "calculate", 1, 1, ["calculation"], 1, null, null),
      rec("2", "subj-a", "explain", 3, 3, ["explain"], 2, null, null),
      rec("3", "subj-b", "calculate", 1, 1, ["calculation"], 0, null, null),
    ];
    const report = buildMarkingValidationReport({ records, aiMark: () => 0, provenance: "external-human" });
    expect(report.bySubject.length).toBe(2);
    expect(report.byCommandWord.find((g) => g.key === "calculate")?.total).toBe(2);
    expect(report.byMarkTotal.find((g) => g.key === "1")?.total).toBe(2);
    expect(report.byDifficulty.find((g) => g.key === "1")?.total).toBe(2);
    expect(report.byQuestionType.length).toBeGreaterThan(0);
    expect(report.internalVsExternalWarning).toBeNull();
  });

  it("keeps internal vs external separate and warns on internal", () => {
    const r = rec("1", "subj", "state", 1, 1, ["state"], 1, null, null);
    const internal = buildMarkingValidationReport({ records: [r], aiMark: () => 1, provenance: "internal-regression" });
    const external = buildMarkingValidationReport({ records: [r], aiMark: () => 1, provenance: "external-human" });
    expect(internal.internalVsExternalWarning).not.toBeNull();
    expect(external.internalVsExternalWarning).toBeNull();
  });

  it("humanVsAiAgreement reports both human-human and AI-consensus", () => {
    const records = [
      rec("1", "subj", "calculate", 2, 2, ["calculation"], 2, 2, 2),
      rec("2", "subj", "explain", 2, 2, ["explain"], 1, 2, 2), // disagree by 1, adjudicated to 2
    ];
    const res = humanVsAiAgreement(records, (rr) => rr.adjudicatedMark ?? rr.humanMark1 ?? 0);
    expect(res.humanHumanExact).toBeCloseTo(0.5);
    expect(res.aiVsConsensusExact).toBeCloseTo(1);
  });
});
