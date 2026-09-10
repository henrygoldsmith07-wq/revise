import { describe, expect, it } from "vitest";
import { physicsCapacitorEnergyQuestions as questions } from "@/content/questions/physics-capacitor-energy";
import { wjecPhysicsQualityExpansionQuestions } from "@/content/questions/wjec-physics-quality-expansion";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecPhysicsCapabilities } from "@/content/capabilities";
import { auditPhysicsAssessmentQuality } from "@/domain/physics-assessment-quality";
import { humanVerifiedPhysicsQuestion, physicsContentFingerprint } from "@/domain/physics-content-review";

describe("Capacitor energy authoring batch", () => {
  it("supplies alternatives for all seven demands while keeping every item unreviewed", () => {
    const audit = auditPhysicsAssessmentQuality({ topics: wjecPhysics.topics, questions, nodes: wjecPhysicsCapabilities, trustedQuestion: humanVerifiedPhysicsQuestion });
    const row = audit.capabilityCoverageByCapability.find((item) => item.capabilityId === "phys.capacitance.sp-02")!;
    expect(questions).toHaveLength(14);
    expect(row.demands).toHaveLength(7);
    expect(row.demands.every((demand) => demand.complete && demand.distinct)).toBe(true);
    expect(audit.issues.filter((issue) => issue.kind !== "unreviewed")).toEqual([]);
    expect(audit.approvedQuestions).toBe(0);
    expect(audit.releaseReady).toBe(false);
    expect(new Set(questions.map(physicsContentFingerprint)).size).toBe(14);
  });

  it("keeps charge-sharing arithmetic consistent with charge conservation and dissipation", () => {
    const item = questions.find((q) => q.id.endsWith("charge-sharing-loss"))!;
    const finalVoltage = (4e-6 * 12) / (4e-6 + 8e-6);
    const lossMicroJ = (0.5 * 4e-6 * 12 ** 2 - 0.5 * 12e-6 * finalVoltage ** 2) * 1e6;
    expect(finalVoltage).toBe(4);
    expect(lossMicroJ).toBeCloseTo(192, 6);
    expect(item.parts[0]!.modelAnswer).toContain("192 μJ");
  });

  it("fixes the measured-period uncertainty without including unused length uncertainty", () => {
    const part = wjecPhysicsQualityExpansionQuestions.flatMap((q) => q.parts).find((p) => p.learning?.contextId.endsWith(":pendulum:uncertainty"))!;
    expect(0.20 / 20).toBe(0.010);
    expect((0.20 / 35.80) * 100).toBeCloseTo(0.56, 2);
    expect(part.modelAnswer).toContain("1.790 ± 0.010 s");
    expect(part.modelAnswer).not.toContain("0.81%");
    expect(part.markScheme).toHaveLength(part.marks);
  });

  it("does not attach a CV binary rule to a capacitor energy method", () => {
    const part = wjecPhysicsQualityExpansionQuestions.flatMap((q) => q.parts).find((p) => p.learning?.contextId.endsWith(":clinical:stored-energy"))!;
    expect(0.5 * 180e-6 * 2400 ** 2).toBeCloseTo(518.4, 6);
    expect(part.modelAnswer).toContain("518.4 J");
    expect(part.calculationRules).toBeUndefined(); // multi-step work requires the full rubric, not an incorrect binary shortcut
  });
});
