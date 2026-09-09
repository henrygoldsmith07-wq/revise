import { describe, expect, it } from "vitest";
import { wjecPhysicsQualityExpansionQuestions } from "@/content/questions/wjec-physics-quality-expansion";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecPhysicsCapabilities } from "@/content/capabilities";
import { auditPhysicsAssessmentQuality } from "@/domain/physics-assessment-quality";
import { physicsContentFingerprint, humanVerifiedPhysicsQuestion } from "@/domain/physics-content-review";

describe("Physics quality expansion", () => {
  it("contains distinct, mapped evidence units for every extension topic", () => {
    expect(wjecPhysicsQualityExpansionQuestions).toHaveLength(8);
    const prompts = wjecPhysicsQualityExpansionQuestions.flatMap((question) => question.parts.map((part) => part.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
    for (const question of wjecPhysicsQualityExpansionQuestions) {
      expect(question.source).toBe("generated");
      expect(question.verification).toBe("unverified");
      expect(humanVerifiedPhysicsQuestion(question)).toBe(false);
      for (const part of question.parts) {
        expect(part.specPointIds).toHaveLength(1);
        expect(part.capabilityIds).toHaveLength(1);
        expect(part.learning?.reasoningMoves.length).toBeGreaterThan(0);
        expect(part.markScheme).toHaveLength(part.marks);
        expect(wjecPhysicsCapabilities.some((node) => node.id === part.capabilityIds![0] && node.specPointIds.includes(part.specPointIds![0]!))).toBe(true);
      }
    }
  });

  it("keeps the release gate closed and reports quality gaps honestly", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics,
      questions: wjecPhysicsQualityExpansionQuestions,
      nodes: wjecPhysicsCapabilities,
      trustedQuestion: () => false,
    });
    expect(audit.statements).toBe(108);
    expect(audit.unreviewedQuestions).toBe(8);
    expect(audit.releaseReady).toBe(false);
    expect(audit.issues.some((issue) => issue.kind === "unreviewed")).toBe(true);
    expect(audit.capabilityCoverage.filter((row) => row.capabilityIds.length > 0).every((row) => row.capabilityIds.length === 1)).toBe(true);
  });

  it("fingerprints part-level edits so prior approval cannot survive a content change", () => {
    const question = wjecPhysicsQualityExpansionQuestions[0]!;
    const changed = { ...question, parts: question.parts.map((part, index) => index === 0 ? {
      ...part,
      learning: { ...part.learning!, reasoningMoves: ["different reasoning operation"] },
    } : part) };
    expect(physicsContentFingerprint(changed)).not.toBe(physicsContentFingerprint(question));
  });
});
