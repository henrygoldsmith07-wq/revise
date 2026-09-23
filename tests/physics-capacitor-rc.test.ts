import { describe, expect, it } from "vitest";
import { physicsCapacitorRcQuestions as questions } from "@/content/questions/physics-capacitor-rc";
import { physicsCapacitorEnergyQuestions } from "@/content/questions/physics-capacitor-energy";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecPhysicsCapabilities } from "@/content/capabilities";
import { auditPhysicsAssessmentQuality } from "@/domain/physics-assessment-quality";
import { applyHumanVerification, humanVerifiedPhysicsQuestion, physicsContentFingerprint } from "@/domain/physics-content-review";

const part = (slug: string) => questions.find((q) => q.id.endsWith(slug))!.parts[0]!;

describe("RC content drafts", () => {
  it("fills the audited demand alternatives without creating approvals or reskins", () => {
    const audit = auditPhysicsAssessmentQuality({ topics: wjecPhysics.topics, questions, nodes: wjecPhysicsCapabilities, trustedQuestion: humanVerifiedPhysicsQuestion });
    const row = audit.capabilityCoverageByCapability.find((item) => item.capabilityId === "phys.capacitance.sp-04")!;
    expect(row.demands.every((demand) => demand.complete && demand.distinct)).toBe(true);
    expect(audit.issues.filter((issue) => issue.kind !== "unreviewed")).toEqual([]);
    expect(audit.approvedQuestions).toBe(0);
    expect(audit.releaseReady).toBe(false);
  });

  it("checks the inverse charging solution against both observations and the initial condition", () => {
    const tau = -2 / Math.log(0.5);
    const voltage = (t: number) => 6 * (1 - Math.exp(-t / tau));
    expect(voltage(0)).toBe(0);
    expect(voltage(2)).toBeCloseTo(3, 12);
    expect(voltage(4)).toBeCloseTo(4.5, 12);
    expect(tau).toBeCloseTo(2.89, 2);
    expect(part("unknown-supply").modelAnswer).toContain("V_s = 6.0 V");
    expect(part("unknown-supply").modelAnswer).toContain("2.89 s");
    // A non-zero starting voltage changes the relevant exponential fraction.
    expect(10 + (2 - 10) * Math.exp(-Math.log(2))).toBe(6);
    expect(part("nonzero-start").modelAnswer).toContain("0.693 s");
  });

  it("checks loading, power decay and interval charge using physical constraints", () => {
    const effectiveR = 1 / (1 / 200e3 + 1 / 300e3);
    expect(effectiveR * 100e-6).toBeCloseTo(12, 12);
    expect(part("infer-leakage").modelAnswer).toContain("300000 Ω");
    const t = 3 * Math.log(4);
    expect((12 * Math.exp(-t / 6)) ** 2 / 2000).toBeCloseTo(18e-3, 12);
    expect(part("resistor-power").modelAnswer).toContain("4.16 s");
    const q0 = 20e-6 * 5;
    const lost = q0 * (Math.exp(-1) - Math.exp(-2));
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(q0 * Math.exp(-1));
    expect(lost / 1.60e-19 / 1e14).toBeCloseTo(1.4534, 4);
    expect(part("count-transferred-electrons").modelAnswer).toContain("1.4534 × 10^14");
  });

  it("keeps reused reasoning families together across demands and batches", () => {
    expect(part("meter-loading").learning?.familyId).toBe(part("infer-leakage").learning?.familyId);
    expect(part("current-area").learning?.familyId).toBe(part("count-transferred-electrons").learning?.familyId);
    const energy = physicsCapacitorEnergyQuestions.find((q) => q.id.endsWith("energy-half-life"))!;
    expect(part("resistor-power").learning?.familyId).toBe(energy.parts[0]!.learning?.familyId);
  });

  it("invalidates an exact-version approval after a worked solution or scheme edit", () => {
    const question = questions[0]!;
    // A test fixture only; these attestations are never written to the bank.
    const reviewed = applyHumanVerification(question, {
      status: "approved", reviewerId: "test-only", reviewedAt: "2026-09-10T00:00:00Z",
      contentFingerprint: physicsContentFingerprint(question),
      checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
    });
    expect(humanVerifiedPhysicsQuestion(reviewed)).toBe(true);
    for (const change of [{ modelAnswer: "Changed solution" }, { markScheme: ["Changed criterion"] }]) {
      const edited = { ...reviewed, parts: [{ ...reviewed.parts[0]!, ...change }] };
      expect(physicsContentFingerprint(edited)).not.toBe(physicsContentFingerprint(question));
      expect(humanVerifiedPhysicsQuestion(edited)).toBe(false);
    }
    expect(questions.every((q) => !humanVerifiedPhysicsQuestion(q))).toBe(true);
  });
});
