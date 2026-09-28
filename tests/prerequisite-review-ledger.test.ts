import { describe, expect, it } from "vitest";
import { capabilityEdgeFingerprint, type CapabilityNode } from "@/domain/capability-graph";
import { applyPrerequisiteReviewLedger, buildPrerequisiteReviewLedgerEntry } from "@/domain/prerequisite-review-ledger";

const prerequisite: CapabilityNode = {
  id: "math.base",
  subjectId: "wjec-alevel-maths",
  topicId: "wjec-alevel-maths.algebra",
  label: "Base skill",
  specPointIds: ["sp-base"],
  prerequisites: [],
  explanation: "Base explanation",
};
const target: CapabilityNode = {
  id: "math.target",
  subjectId: "wjec-alevel-maths",
  topicId: "wjec-alevel-maths.algebra",
  label: "Target skill",
  specPointIds: ["sp-target"],
  prerequisites: [prerequisite.id],
  prerequisiteRationales: { [prerequisite.id]: "The target genuinely requires the base skill." },
  explanation: "Target explanation",
};

describe("WJEC prerequisite review ledger", () => {
  it("uses SHA-256 edge fingerprints and applies qualified decisions", () => {
    expect(capabilityEdgeFingerprint(target, prerequisite)).toMatch(/^capability-edge-v2:sha256:[a-f0-9]{64}$/);
    const entry = buildPrerequisiteReviewLedgerEntry(target, prerequisite, {
      status: "approved",
      reviewerId: "reviewer-1",
      reviewerRole: "subject-expert",
      reviewerQualification: "Qualified maths teacher",
      reviewedAt: "2026-09-26T12:00:00Z",
    });
    const applied = applyPrerequisiteReviewLedger([target, prerequisite], { formatVersion: 1, entries: [entry] });
    expect(applied.issues).toEqual([]);
    expect(applied.nodes[0]?.prerequisiteReviews?.[prerequisite.id]?.status).toBe("approved");
  });

  it("rejects future-dated decisions", () => {
    const fingerprint = capabilityEdgeFingerprint(target, prerequisite);
    const applied = applyPrerequisiteReviewLedger([target, prerequisite], { formatVersion: 1, entries: [{
      subjectId: target.subjectId,
      targetId: target.id,
      prerequisiteId: prerequisite.id,
      edgeFingerprint: fingerprint,
      review: {
        status: "rejected",
        reviewerId: "reviewer-1",
        reviewerRole: "subject-expert",
        reviewerQualification: "Qualified maths teacher",
        reviewedAt: "2099-01-01T00:00:00Z",
        edgeFingerprint: fingerprint,
      },
    }] });
    expect(applied.issues.some((issue) => issue.kind === "invalid-decision" && issue.blocking)).toBe(true);
  });

  it("rejects an internal fingerprint mismatch", () => {
    const entry = buildPrerequisiteReviewLedgerEntry(target, prerequisite, {
      status: "approved",
      reviewerId: "reviewer-1",
      reviewerRole: "subject-expert",
      reviewerQualification: "Qualified maths teacher",
      reviewedAt: "2026-09-26T12:00:00Z",
    });
    const applied = applyPrerequisiteReviewLedger([target, prerequisite], {
      formatVersion: 1,
      entries: [{ ...entry, review: { ...entry.review, edgeFingerprint: "capability-edge-v2:sha256:stale" } }],
    });
    expect(applied.issues.some((issue) => issue.kind === "invalid-entry" && issue.blocking)).toBe(true);
  });

  it("keeps legacy 32-bit fingerprints as history rather than current trust", () => {
    const applied = applyPrerequisiteReviewLedger([target, prerequisite], { formatVersion: 1, entries: [{
      subjectId: target.subjectId,
      targetId: target.id,
      prerequisiteId: prerequisite.id,
      edgeFingerprint: "capability-edge-v1:deadbeef",
      review: {
        status: "approved",
        reviewerId: "reviewer-1",
        reviewerRole: "subject-expert",
        reviewerQualification: "Qualified maths teacher",
        reviewedAt: "2026-09-26T12:00:00Z",
        edgeFingerprint: "capability-edge-v1:deadbeef",
      },
    }] });
    expect(applied.nodes[0]?.prerequisiteReviews?.[prerequisite.id]).toBeUndefined();
    expect(applied.issues.some((issue) => issue.kind === "historical-fingerprint" && !issue.blocking)).toBe(true);
  });
});
