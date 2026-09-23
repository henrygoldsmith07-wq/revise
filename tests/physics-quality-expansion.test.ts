import { describe, expect, it } from "vitest";
import { wjecPhysicsQualityExpansionQuestions } from "@/content/questions/wjec-physics-quality-expansion";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecPhysicsCapabilities } from "@/content/capabilities";
import { auditPhysicsAssessmentQuality, physicsQualityQueue } from "@/domain/physics-assessment-quality";
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

  it("puts missing statement and capability links in the authoring queue", () => {
    const original = wjecPhysicsQualityExpansionQuestions[0]!;
    const part = original.parts[0]!;
    const malformed = { ...original, parts: [{ ...part, specPointIds: [], capabilityIds: [] }] };
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics,
      questions: [malformed],
      nodes: wjecPhysicsCapabilities,
      trustedQuestion: () => false,
    });
    expect(audit.issues.some((issue) => issue.kind === "missing-spec-point")).toBe(true);
    expect(audit.issues.some((issue) => issue.kind === "missing-capability")).toBe(true);
    const queue = physicsQualityQueue(audit);
    expect(queue.find((item) => item.questionId === original.id && item.issueKind === "missing-spec-point")).toMatchObject({ reason: "missing-mapping", questionId: original.id, partId: part.id,
      topicId: original.topicIds[0], specPointId: "mapping-required" });
    expect(queue.some((item) => item.reason === "missing-review" && item.questionId === original.id)).toBe(true);
  });

  it("keeps marking and reskin defects actionable instead of hiding them in demand counts", () => {
    const original = wjecPhysicsQualityExpansionQuestions[0]!;
    const part = original.parts[0]!;
    const malformed = {
      ...original,
      parts: [
        { ...part, markScheme: part.markScheme.slice(0, -1), learning: { ...part.learning!, reasoningMoves: [] } },
        ...original.parts.slice(1),
      ],
    };
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics,
      questions: [malformed, { ...original, id: `${original.id}-reskin`, parts: original.parts.map((row) => ({ ...row })) }],
      nodes: wjecPhysicsCapabilities,
      trustedQuestion: () => false,
    });
    const queue = physicsQualityQueue(audit);
    expect(queue.some((item) => item.reason === "content-quality" && item.issueKind === "incomplete-mark-scheme" && item.questionId === original.id)).toBe(true);
    expect(queue.some((item) => item.reason === "content-quality" && item.issueKind === "missing-reasoning-move" && item.questionId === original.id)).toBe(true);
    expect(queue.some((item) => item.reason === "content-quality" && item.issueKind === "cosmetic-reskin" && item.questionId === `${original.id}-reskin`)).toBe(true);
  });
});
