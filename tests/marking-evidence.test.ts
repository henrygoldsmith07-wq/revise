import { describe, expect, it } from "vitest";
import { devFixtureRecords, type AnswerCorpusRecord } from "@/domain/answer-corpus";
import { applyHumanMarkReturns, markingEvidenceReport, markingRecordFingerprint, pairAgreement } from "@/domain/marking-evidence";
const marker = (id: string) => ({ markerId: id, role: "teacher", qualification: "Test fixture only", independentlyMarked: true, markedAt: "2026-09-30T10:00:00.000Z" });
const row = (i = 0): AnswerCorpusRecord => {
 const r: AnswerCorpusRecord = { ...devFixtureRecords()[0]!, id: `r${i}`, maximumMarks: 3, source: "teacher-reviewed", humanMark1: i % 4, humanMark2: i % 4, adjudicatedMark: null,
  marker1Meta: marker("A"), marker2Meta: marker("B"), reviewStatus: "double-marked", rubricMark: i % 4, aiMark: i % 4, markingVersion: "fixture-v1",
  collection: { genuineStudentAnswer: true, anonymised: true, consented: true, sourceRef: `fixture-response-${i}`, collectedAt: "2026-09-20T09:00:00.000Z" } };
 r.marker1Meta!.contentFingerprint = markingRecordFingerprint(r); r.marker2Meta!.contentFingerprint = markingRecordFingerprint(r);
 return r;
};

describe("genuine marking evidence", () => {
  it("excludes synthetic, single-marker and duplicated evidence", () => {
    const r = row();
    const report = markingEvidenceReport([r, { ...r, id: "same-response" }, { ...row(1), source: "ai-generated-draft" }, { ...row(2), marker2Meta: marker("A") }, ...devFixtureRecords()]);
    expect(report.genuineIndependentAnswers).toBe(1);
    expect(report.strata[0]!.examiner.exact).toBeNull();
    expect(report.phaseOneCollected).toBe(false);
    expect(report.qualityClaimAllowed).toBe(false);
  });
  it("reports exact, ±1, MAE, bias and kappa only for supported fixed-tariff pairs", () => {
    const report = markingEvidenceReport(Array.from({ length: 25 }, (_, i) => row(i)));
    expect(report.strata[0]!.examiner).toMatchObject({ pairs: 25, exact: 1, withinOne: 1, mae: 0, bias: 0, kappa: 1, weightedKappa: 1 });
    const independent = pairAgreement([[0, 0], [0, 1], [1, 0], [1, 1]], 1, 1);
    expect(independent.kappa).toBe(0);
    expect(independent.bias).toBe(0);
    expect(pairAgreement([[1, 1]], 3, 1).kappa).toBeNull();
    expect(pairAgreement([[3, 0]], 3, 1)).toMatchObject({ exact: 0, withinOne: 0, mae: 3, bias: 3 });
  });
  it("compares on matched rows and never averages disputed human marks", () => {
    const disputed = Array.from({ length: 25 }, (_, i) => ({ ...row(i), humanMark2: (i % 4 + 1) % 4 }));
    expect(markingEvidenceReport(disputed).strata[0]!.rubric.system.pairs).toBe(0);
    expect(markingEvidenceReport(disputed).unresolvedDisagreements).toBe(25);
    const adjudicated = disputed.map(r => ({ ...r, adjudicatedMark: r.humanMark1, adjudicatorMeta: { ...marker("C"), contentFingerprint: markingRecordFingerprint(r) } }));
    expect(markingEvidenceReport(adjudicated).strata[0]!.ai.system.pairs).toBe(25);
  });
  it("250 answers closes collection target but never asserts marking quality", () => {
    expect(markingEvidenceReport(Array.from({ length: 250 }, (_, i) => row(i)))).toMatchObject({ phaseOneCollected: true, qualityClaimAllowed: false });
  });

  it("editing a marked answer invalidates the stored human evidence fingerprint", () => {
    expect(markingEvidenceReport([{ ...row(), studentAnswer: "Changed after marking" }]).genuineIndependentAnswers).toBe(0);
  });
  it("imports independent marks atomically, rejects stale versions and prevents overwrites", () => {
    const r = { ...row(), humanMark1: null, humanMark2: null, marker1Meta: null, marker2Meta: null };
    const a = { recordId: r.id, fingerprint: markingRecordFingerprint(r), slot: "A" as const, mark: 1, marker: marker("A") };
    const first = applyHumanMarkReturns([r], [a]);
    expect(first.applied).toBe(1);
    expect(applyHumanMarkReturns(first.records, [{ ...a, slot: "B" }]).applied).toBe(0);
    expect(applyHumanMarkReturns(first.records, [a]).applied).toBe(0);
    expect(applyHumanMarkReturns([{ ...r, studentAnswer: "Edited answer" }], [a]).errors).toContain(`${r.id}: stale answer/question version`);
    const atomic = applyHumanMarkReturns([r], [a, { ...a, slot: "B", marker: marker("A") }]);
    expect(atomic.records[0]!.humanMark1).toBeNull();
  });
});
