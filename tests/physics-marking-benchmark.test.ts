import { describe, expect, it } from "vitest";
import { wjecPhysicsQualityExpansionQuestions } from "@/content/questions/wjec-physics-quality-expansion";
import { evaluatePhysicsAnswerCorpus, REQUIRED_PHYSICS_BENCHMARK_CASES } from "@/domain/physics-marking-benchmark";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

const question = wjecPhysicsQualityExpansionQuestions[0]!;
const part = question.parts[0]!;

function record(id: string, overrides: Partial<AnswerCorpusRecord> = {}): AnswerCorpusRecord {
  return {
    id,
    questionId: question.id,
    partId: part.id,
    subject: "wjec-alevel-physics",
    specification: "A200QS",
    specificationVersion: "2024-1.0",
    topic: question.topicIds[0]!,
    questionText: part.prompt,
    markScheme: part.markScheme,
    maximumMarks: part.marks,
    commandWord: "explain",
    difficulty: question.difficulty,
    questionTypeTags: ["2-4-mark", "misconception", ...REQUIRED_PHYSICS_BENCHMARK_CASES],
    studentAnswer: part.modelAnswer,
    humanMark1: part.marks,
    humanMark2: part.marks,
    adjudicatedMark: part.marks,
    humanFeedback: "Complete response.",
    identifiedMisconceptions: [],
    source: "teacher-reviewed",
    reviewStatus: "adjudicated",
    provenance: "Test-only anonymised marker row",
    benchmarkVersion: "test-v1",
    marker1Meta: { markerId: "marker-1", role: "teacher", boardFamiliarity: "WJEC", independentlyMarked: true },
    marker2Meta: { markerId: "marker-2", role: "examiner", boardFamiliarity: "WJEC", independentlyMarked: true },
    adjudicatorMeta: { markerId: "adjudicator", role: "senior-examiner", boardFamiliarity: "WJEC" },
    createdAt: "2026-09-08T00:00:00Z",
    ...overrides,
  };
}

describe("Physics human-marker benchmark", () => {
  it("compares deterministic marks with adjudicated human labels and exposes first-error evidence", () => {
    const report = evaluatePhysicsAnswerCorpus({ records: [record("exact")], questions: [question] });
    expect(report.evaluatedRecords).toBe(1);
    expect(report.goldRecords).toBe(1);
    expect(report.exactAgreementRate).toBe(1);
    expect(report.humanMarkerExactAgreementRate).toBe(1);
    expect(report.records[0]?.firstIncorrectStep).toBeNull();
    expect(report.usableForCalibration).toBe(false);
  });

  it("does not call a small or incomplete corpus calibration-ready", () => {
    const rows = Array.from({ length: 20 }, (_, index) => record(`row-${index}`, {
      humanMark2: index === 0 ? Math.max(0, part.marks - 1) : part.marks,
      adjudicatedMark: index === 0 ? part.marks : part.marks,
    }));
    const report = evaluatePhysicsAnswerCorpus({ records: rows, questions: [question] });
    expect(report.evaluatedRecords).toBe(20);
    expect(report.usableForCalibration).toBe(true);
    expect(report.humanMarkerPairs).toBe(20);
    expect(report.humanMarkerExactAgreementRate).toBeLessThan(1);
    expect(report.qualifiedHumanMarkerPairs).toBe(20);
    expect(report.adjudicatedRecords).toBe(20);
    expect(report.caseCoverageComplete).toBe(true);
  });

  it("reports missing bank mappings instead of silently scoring a row", () => {
    const report = evaluatePhysicsAnswerCorpus({ records: [record("missing", { questionId: "deleted-question" })], questions: [question] });
    expect(report.evaluatedRecords).toBe(0);
    expect(report.missingQuestionIds).toEqual(["deleted-question"]);
    expect(report.usableForCalibration).toBe(false);
  });

  it("keeps calibration closed when a marker or required edge-case label is missing", () => {
    const rows = Array.from({ length: 20 }, (_, index) => record(`row-${index}`, {
      questionTypeTags: REQUIRED_PHYSICS_BENCHMARK_CASES.filter((tag) => tag !== "borderline-explanation"),
    }));
    rows[0] = record("row-0", { marker2Meta: null });
    const report = evaluatePhysicsAnswerCorpus({ records: rows, questions: [question] });
    expect(report.qualifiedHumanMarkerPairs).toBe(19);
    expect(report.caseCoverageComplete).toBe(false);
    expect(report.usableForCalibration).toBe(false);
  });

  it("requires an explicit independent first-pass attestation", () => {
    const report = evaluatePhysicsAnswerCorpus({ records: [record("not-independent", {
      marker1Meta: { markerId: "marker-1", role: "teacher", boardFamiliarity: "WJEC" },
    })], questions: [question] });
    expect(report.humanMarkerPairs).toBe(1);
    expect(report.qualifiedHumanMarkerPairs).toBe(0);
    expect(report.usableForCalibration).toBe(false);
  });

  it("rejects a stale prompt, scheme or mark allocation before comparison", () => {
    const report = evaluatePhysicsAnswerCorpus({ records: [
      record("stale-prompt", { questionText: "An edited prompt." }),
      record("stale-scheme", { markScheme: ["An edited mark point"] }),
      record("stale-marks", { maximumMarks: part.marks + 1 }),
    ], questions: [question] });
    expect(report.evaluatedRecords).toBe(0);
    expect(report.missingPartRecordIds).toEqual(["stale-prompt", "stale-scheme", "stale-marks"]);
  });
});
