import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { physicsTransferLinkedQuestions } from "@/content/questions/physics-transfer-linked";
import { allTopics } from "@/domain/curriculum";
import { approvableByReview, gateContextFromTopics, hasActualTransfer, questionGateIssues } from "@/domain/review-gates";
import { trustedAssessmentContent } from "@/domain/content-trust";
import { verifyTransferFingerprints } from "@/domain/transfer-trust";

// Physics transfer items authored with a real baseline link. They must point
// at parts that exist in the bank, stay unreviewed, and be approvable only
// because the link is real — never because a gate was relaxed.

const partById = new Map(seedQuestions.flatMap((q) => q.parts.map((p) => [p.id, { question: q, part: p }] as const)));
const gate = gateContextFromTopics(allTopics());

describe("linked Physics transfer items", () => {
  it("are in the live bank", () => {
    expect(physicsTransferLinkedQuestions.length).toBeGreaterThan(0);
    const ids = new Set(seedQuestions.map((q) => q.id));
    for (const q of physicsTransferLinkedQuestions) expect(ids.has(q.id)).toBe(true);
  });

  it("each links to an existing application/calculation baseline of the same capability and statement", () => {
    for (const question of physicsTransferLinkedQuestions) {
      const part = question.parts[0]!;
      expect(part.learning?.demand).toBe("transfer");
      const link = part.learning?.transferLink;
      expect(link).toBeTruthy();
      const baseline = partById.get(link!.baselinePartId);
      expect(baseline, `${question.id} baseline ${link!.baselinePartId}`).toBeTruthy();
      expect(baseline!.question.id).not.toBe(question.id);
      expect(baseline!.part.capabilityIds).toEqual(part.capabilityIds);
      expect(baseline!.part.specPointIds).toEqual(part.specPointIds);
      expect(["application", "calculation"]).toContain(baseline!.part.learning?.demand);
      expect(verifyTransferFingerprints(part, baseline!.part)).toEqual([]);
      expect(hasActualTransfer(question)).toBe(true);
    }
  });

  it("stay unreviewed, honestly sourced, and pass every blocking gate", () => {
    for (const question of physicsTransferLinkedQuestions) {
      expect(question.verification).toBe("unverified");
      expect(question.humanVerification).toBeUndefined();
      expect(question.reviewer).toBeNull();
      expect(question.source).toBe("generated");
      expect(trustedAssessmentContent(question)).toBe(false);
      const issues = questionGateIssues(question, gate);
      expect(issues.filter((i) => i.severity === "block")).toEqual([]);
      expect(issues.map((i) => i.code)).toContain("insufficient-provenance");
      expect(approvableByReview(question, gate)).toBe(true);
    }
  });

  it("still blocks a transfer label with no baseline link (the gate is unchanged)", () => {
    const question = physicsTransferLinkedQuestions[0]!;
    const unlinked = {
      ...question,
      parts: question.parts.map((p) => ({ ...p, learning: { ...p.learning!, transferLink: undefined } })),
    };
    expect(hasActualTransfer(unlinked)).toBe(false);
    expect(approvableByReview(unlinked, gate)).toBe(false);
  });
});
