import { describe, expect, it } from "vitest";
import { physicsCapacitorEnergyQuestions as questions } from "@/content/questions/physics-capacitor-energy";
import { wjecCapabilities as wjecPhysicsCapabilities } from "@/content/capabilities";
import { humanVerifiedPhysicsQuestion } from "@/domain/physics-content-review";
import { capabilityEdgeFingerprint } from "@/domain/capability-graph";
import {
  buildPhysicsReviewPacketTemplate, importPhysicsReviewPacket, buildPhysicsPrerequisiteReviewTemplate,
  importPhysicsPrerequisiteReviews, importPhysicsMarkingCorpus, importPhysicsPaperManifests,
  paperProvenanceFromManifest, importPhysicsInterventionOutcomes, importPhysicsExperimentEvidence,
  emptyPhysicsEvidenceFiles,
} from "@/domain/physics-validation-intake";

describe("Physics evidence collection boundary", () => {
  it("round-trips pending packets without manufacturing approval", () => {
    const rows = buildPhysicsReviewPacketTemplate(questions);
    const result = importPhysicsReviewPacket(JSON.stringify({ formatVersion: 1, rows }), questions);
    expect(result.errors).toEqual([]);
    expect(result.pendingQuestionIds).toHaveLength(questions.length);
    expect(result.updatedQuestions.some(humanVerifiedPhysicsQuestion)).toBe(false);
  });

  it("requires six qualified checks on the exact content, including the embedded question", () => {
    const row = buildPhysicsReviewPacketTemplate(questions)[0]!;
    row.review = { ...row.review, status: "approved", reviewerId: "test-only", reviewerRole: "teacher",
      reviewerQualification: "Test fixture only", reviewedAt: "2026-09-10T12:00:00Z",
      checks: { question: true, marking: true, workedSolution: true, specificationMapping: true, capabilityMapping: true, examRealism: true } };
    const valid = importPhysicsReviewPacket(JSON.stringify([row]), questions);
    expect(valid.errors).toEqual([]);
    expect(valid.approvedQuestionIds).toEqual([row.questionId]);
    expect(humanVerifiedPhysicsQuestion(valid.updatedQuestions[0]!)).toBe(true);
    for (const changed of [
      { ...row, fingerprint: "old" },
      { ...row, review: { ...row.review, reviewerQualification: undefined } },
      { ...row, review: { ...row.review, checks: { ...row.review.checks, marking: false } } },
      { ...row, question: { ...row.question, stem: "Edited after review" } },
    ]) {
      const result = importPhysicsReviewPacket(JSON.stringify([changed]), questions);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.approvedQuestionIds).toEqual([]);
    }
  });

  it("rejects unsupported file versions and duplicate reviewer rows", () => {
    const row = buildPhysicsReviewPacketTemplate(questions)[0]!;
    expect(importPhysicsReviewPacket(JSON.stringify({ formatVersion: 99, rows: [row] }), questions).errors.length).toBeGreaterThan(0);
    expect(importPhysicsReviewPacket(JSON.stringify([row, row]), questions).errors.some((error) => error.includes("duplicate"))).toBe(true);
  });

  it("approves only a current existing edge with a rationale and subject reviewer", () => {
    const rows = buildPhysicsPrerequisiteReviewTemplate(wjecPhysicsCapabilities);
    const pending = importPhysicsPrerequisiteReviews(JSON.stringify(rows), wjecPhysicsCapabilities);
    expect(pending.errors).toEqual([]);
    expect(pending.approvedEdges).toEqual([]);
    const row = rows.find((item) => item.rationale)!;
    row.review = { status: "approved", reviewerId: "test-only", reviewerRole: "teacher", reviewerQualification: "Test fixture only",
      reviewedAt: "2026-09-10T12:00:00Z", edgeFingerprint: row.edgeFingerprint };
    expect(importPhysicsPrerequisiteReviews(JSON.stringify([row]), wjecPhysicsCapabilities).approvedEdges).toHaveLength(1);
    expect(importPhysicsPrerequisiteReviews(JSON.stringify([{ ...row, edgeFingerprint: "old" }]), wjecPhysicsCapabilities).approvedEdges).toEqual([]);
    const target = wjecPhysicsCapabilities.find((node) => node.id === row.targetId)!;
    const stranger = wjecPhysicsCapabilities.find((node) => node.id !== target.id && !target.prerequisites.includes(node.id))!;
    const invented = { ...row, prerequisiteId: stranger.id, edgeFingerprint: capabilityEdgeFingerprint(target, stranger) };
    expect(importPhysicsPrerequisiteReviews(JSON.stringify([invented]), wjecPhysicsCapabilities).errors.some((error) => error.includes("existing prerequisite"))).toBe(true);
  });

  it("preserves an unmarked response without counting it as external gold", () => {
    const q = questions[0]!, p = q.parts[0]!;
    const record = { id: "test-only-response", questionId: q.id, partId: p.id, subject: q.subjectId,
      specification: "1420QS", topic: q.topicIds[0], questionText: p.prompt, markScheme: p.markScheme, maximumMarks: p.marks,
      commandWord: "state", difficulty: 1, questionTypeTags: ["2-4-mark"], studentAnswer: "Q means all the charge added together",
      humanMark1: null, humanMark2: null, adjudicatedMark: null, humanFeedback: null, identifiedMisconceptions: [],
      source: "unreviewed", reviewStatus: "draft", provenance: "TEST FIXTURE, not a student", benchmarkVersion: "test",
      createdAt: "2026-09-10T12:00:00Z" };
    const result = importPhysicsMarkingCorpus(JSON.stringify({ ...emptyPhysicsEvidenceFiles().markingCorpus, records: [record] }), questions);
    expect(result.errors).toEqual([]);
    expect(result.physicsRecords).toHaveLength(1);
    expect(result.externalRows).toBe(0);
    expect(result.readyForCalibration).toBe(false);
  });

  it("requires an official source and attestation, retaining sitting identity", () => {
    const row = { paperId: "test-paper", sittingId: "test-sitting", year: 2024, series: "summer", board: "WJEC",
      subjectId: "wjec-alevel-physics", qualificationLevel: "alevel", specification: "1420QS", specificationVersion: "v3-2023",
      sourceUrl: "https://pastpapers.download.wjec.co.uk/test.pdf", sourceDigest: "a".repeat(64), status: "pending" };
    expect(importPhysicsPaperManifests(JSON.stringify([row])).trustedManifests).toEqual([]);
    const verified = { ...row, status: "verified", verifiedBy: "test-only", verifiedAt: "2026-09-10T12:00:00Z" };
    const result = importPhysicsPaperManifests(JSON.stringify([verified]));
    expect(result.errors).toEqual([]);
    expect(paperProvenanceFromManifest(result.trustedManifests[0]!, "2(a)")).toMatchObject({ paperId: row.paperId, sittingId: row.sittingId, year: 2024, questionNumber: "2(a)" });
    for (const bad of [{ ...verified, verifiedBy: undefined }, { ...verified, sourceUrl: "https://wjec.co.uk.evil.example/test.pdf" }, { ...verified, sourceDigest: "unknown" }]) {
      expect(importPhysicsPaperManifests(JSON.stringify([bad])).trustedManifests).toEqual([]);
    }
  });

  it("retains failed, incomplete and unscored teaching observations", () => {
    const base = { id: "partial", userId: "test-only", subjectId: "wjec-alevel-physics", topicId: "capacitance", capabilityId: "phys.capacitance.sp-02",
      kind: "guided", priorState: "weak", priorAccuracy: 0.5, support: "scaffold", plannedMinutes: 3, actualMinutes: 4, timeMeasured: true, evidenceVersion: 2,
      immediateFamilyId: "family-a", immediate: { awarded: 0, max: 2, independent: false, attemptId: "a", trusted: true, at: "2026-09-01T12:00:00Z" },
      createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-10T12:00:00Z" };
    const failed = { ...base, id: "failed", transfer: { awarded: 0, max: 2, independent: true, trusted: true, questionId: "b", attemptId: "b", familyId: "family-b", at: "2026-09-02T12:00:00Z" },
      delayedRetention: { awarded: 0, max: 2, independent: true, trusted: true, questionId: "c", attemptId: "c", familyId: "family-c", at: "2026-09-09T12:00:00Z" } };
    const teaching = { ...base, id: "viewed", activity: "teaching", immediate: { ...base.immediate, max: 0, result: "viewed" } };
    const result = importPhysicsInterventionOutcomes(JSON.stringify([base, failed, teaching]));
    expect(result.errors).toEqual([]);
    expect(result.outcomes).toHaveLength(3);
    expect(result.completeChains).toBe(1);
    expect(result.calibratedChains).toBe(1); // zero outcomes must not disappear from the denominator
    expect(result.failedOrPartialChains).toBe(3);
  });

  it("handles malformed experiment rows without throwing or admitting string attestations", () => {
    const file = emptyPhysicsEvidenceFiles().experiment;
    expect(importPhysicsExperimentEvidence(JSON.stringify(file)).analysis?.gates.efficacyClaimReady).toBe(false);
    for (const bad of [{ ...file, assignments: [null] }, { ...file, attempts: [{}] },
      { ...file, finalAssessments: [{ humanMarked: "false" }] }, { ...file, formatVersion: 99 }]) {
      const result = importPhysicsExperimentEvidence(JSON.stringify(bad));
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.analysis).toBeNull();
    }
  });
});
