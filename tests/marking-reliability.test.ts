import { describe, expect, it } from "vitest";
import { buildMarkingValidationReport, validateBenchmarkIngestion } from "@/domain/marking-validation";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

function rec(id: string, tags: string[], max: number, h: number, ai: number, extra: Partial<AnswerCorpusRecord> = {}): AnswerCorpusRecord {
  return {
    id,
    questionId: `q-${id}`,
    subject: "wjec-alevel-physics",
    specification: "A200QS",
    topic: "wjec-alevel-physics.topic",
    questionText: "prompt",
    markScheme: Array.from({ length: max }, (_, i) => `point ${i}`),
    maximumMarks: max,
    commandWord: "explain",
    difficulty: 3,
    questionTypeTags: tags as AnswerCorpusRecord["questionTypeTags"],
    studentAnswer: "answer",
    humanMark1: h,
    humanMark2: null,
    adjudicatedMark: null,
    humanFeedback: null,
    identifiedMisconceptions: [],
    source: "teacher-reviewed",
    reviewStatus: "single-marked",
    provenance: "test",
    benchmarkVersion: "2026.09.v1",
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

describe("marking reliability benchmark workflow", () => {
  it("separately measures partial credit, alternative methods and error classes", () => {
    const records = [
      rec("ecf", ["error-carried-forward", "calculation"], 3, 2, 2),
      rec("contra", ["contradictory"], 2, 0, 0),
      rec("alt", ["equivalent-algebra", "method-marks"], 2, 2, 1),
      rec("border", ["borderline-explanation"], 3, 1, 2),
      rec("long", ["6plus-extended", "evaluate"], 6, 4, 4),
    ];
    const marks: Record<string, number> = { ecf: 2, contra: 0, alt: 1, border: 2, long: 4 };
    const report = buildMarkingValidationReport({
      records,
      aiMark: (r) => marks[r.id] ?? 0,
      provenance: "external-human",
    });
    expect(report.summary.total).toBe(5);
    expect(report.byErrorClass.find((g) => g.key === "error-carried-forward")?.total).toBe(1);
    expect(report.byErrorClass.find((g) => g.key === "contradictory")?.total).toBe(1);
    expect(report.summary.partialCreditAgreement).not.toBeNull();
    expect(report.summary.alternativeMethodExactRate).toBeCloseTo(0);
    expect(report.byErrorClass.length).toBeGreaterThan(0);
  });

  it("measures escalation rather than confident wrong marks", () => {
    const records = [
      rec("ok", ["calculation"], 2, 2, 2),
      rec("wrong", ["calculation"], 2, 0, 2),
      rec("border", ["borderline-explanation"], 2, 1, 1),
    ];
    const marks: Record<string, number> = { ok: 2, wrong: 2, border: 1 };
    const report = buildMarkingValidationReport({
      records,
      aiMark: (r) => marks[r.id] ?? 0,
      aiConfidence: (r) => r.id === "wrong"
        ? { confidence: 0.2, escalated: true }
        : { confidence: 0.9, escalated: false },
      provenance: "external-human",
    });
    expect(report.summary.escalationRate).toBeCloseTo(1 / 3, 2);
    expect(report.summary.escalationPrecision).toBe(1);
    expect(report.byConfidence.find((g) => g.key === "escalated")?.total).toBe(1);
  });

  it("ingestion guard blocks synthetic rows from external claims and warns on small samples", () => {
    const synthetic = rec("s1", ["calculation"], 2, 2, 2, { source: "internally authored" });
    const warnings = validateBenchmarkIngestion([synthetic], "external-human");
    expect(warnings.some((w) => w.includes("synthetic"))).toBe(true);
    const empty = validateBenchmarkIngestion([], "external-human");
    expect(empty.length).toBeGreaterThan(0);
    // Real reviewer-labelled rows with independence pass without synthetic warnings.
    const real = rec("r1", ["calculation"], 2, 1, 1, {
      source: "examiner-reviewed",
      reviewStatus: "adjudicated",
      humanMark1: 1,
      humanMark2: 1,
      adjudicatedMark: 1,
      marker1Meta: { markerId: "m1", independentlyMarked: true },
      marker2Meta: { markerId: "m2", independentlyMarked: true },
    });
    const clean = validateBenchmarkIngestion([real], "external-human");
    expect(clean.some((w) => w.includes("synthetic"))).toBe(false);
  });

  it("does not invent human labels: rows without marks are excluded", () => {
    const unmarked = rec("u1", ["calculation"], 2, 2, 2, { humanMark1: null, humanMark2: null, adjudicatedMark: null });
    const report = buildMarkingValidationReport({ records: [unmarked], aiMark: () => 2, provenance: "external-human" });
    expect(report.summary.total).toBe(0);
    expect(report.ingestionWarnings.some((w) => w.includes("no human mark"))).toBe(true);
  });
});
