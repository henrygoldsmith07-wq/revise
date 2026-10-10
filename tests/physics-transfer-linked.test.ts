import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { physicsTransferLinkedQuestions } from "@/content/questions/physics-transfer-linked";
import { allTopics } from "@/domain/curriculum";
import { approvableByReview, gateContextFromTopics, hasActualTransfer, questionGateIssues } from "@/domain/review-gates";
import { trustedAssessmentContent } from "@/domain/content-trust";
import { verifyTransferFingerprints } from "@/domain/transfer-trust";
import { compareTransferStructures, deriveVerifiedGraph, fingerprintSetup, verifiedGraphToPlain } from "@/domain/reasoning-graph";

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

  it("each is structurally novel against its baseline on independently derived graphs", () => {
    // The same comparison the subject assessment audit applies to a stored
    // link: recomputed fingerprints and verified graphs, never stored metadata.
    for (const question of physicsTransferLinkedQuestions) {
      const part = question.parts[0]!;
      const baseline = partById.get(part.learning!.transferLink!.baselinePartId)!.part;
      const comparison = compareTransferStructures(
        fingerprintSetup(baseline.prompt),
        fingerprintSetup(part.prompt, part.modelAnswer),
        verifiedGraphToPlain(deriveVerifiedGraph(baseline, question.subjectId)),
        verifiedGraphToPlain(deriveVerifiedGraph(part, question.subjectId)),
      );
      expect(comparison.isNovel, `${question.id}: ${comparison.structuralChanges.join(",")} / ${comparison.reasoningChanges.join(",")}`).toBe(true);
    }
  });

  it("every worked number is recomputed here and appears in the mark scheme", () => {
    const e0 = 8.85e-12;
    const scheme = (slug: string) => physicsTransferLinkedQuestions.find((q) => q.id.endsWith(slug))!.parts[0]!.markScheme.join(" ");
    const k = 4 * Math.PI ** 2 * 12 / 0.9 ** 2;
    const k6 = 0.5 * (0.3 ** 2 - 0.1 ** 2) / (0.08 ** 2 - 0.04 ** 2);
    const ratios = [-0.79 / 0.02, 0.39 / -0.01, -1.18 / 0.03];
    const omega3 = Math.sqrt(-ratios.reduce((a, b) => a + b, 0) / 3);
    // [question slug, value recomputed here, value the scheme states, scheme text]
    const checks: Array<[string, number, number, string]> = [
      ["ac-sp-01-logger-heater", 900 / (170 / Math.SQRT2), 7.5, "7.5 A"],
      ["ac-sp-03-wind-farm-line", Math.sqrt(0.005 * 2e6 / 5), 44.7, "44.7"],
      ["capacitance-sp-01-coulombmeter-plates", e0 * 0.04 / (0.35e-6 / 2000), 2.0e-3, "2.0×10⁻³ m"],
      ["capacitance-sp-01-coulombmeter-plates", 2.3 * 0.35, 0.81, "0.81 μC"],
      ["capacitance-sp-02-charge-pd-record", 0.5 * 6e-3 * 12, 0.036, "0.036 J"],
      ["capacitance-sp-02-charge-pd-record", 12 / Math.SQRT2, 8.5, "8.5 V"],
      ["capacitance-sp-03-rated-bank-design", 0.5 * 6e-6 * 400 ** 2, 0.48, "0.48 J"],
      ["circular-shm-sp-01-cycle-sensor", 5.3 / (2 * Math.PI * (40 / 4 / 4)), 0.34, "0.34 m"],
      ["circular-shm-sp-02-rotor-ride", Math.sqrt(9.81 / (0.4 * 2.5)), 3.1, "3.1 rad s⁻¹"],
      ["circular-shm-sp-02-rotor-ride", Math.sqrt(9.81 / (0.4 * 2.5)) / (2 * Math.PI) * 60, 30, "30 rev min⁻¹"],
      ["circular-shm-sp-03-buoy-readings", omega3 / (2 * Math.PI), 1.0, "1.0 Hz"],
      ["circular-shm-sp-04-sensor-maxima", 2 * Math.PI / (4.8 / 0.6), 0.79, "0.79 s"],
      ["circular-shm-sp-04-sensor-maxima", 0.6 / (4.8 / 0.6), 0.075, "0.075 m"],
      ["circular-shm-sp-05-orbit-mass-chair", k, 585, "585 N m⁻¹"],
      ["circular-shm-sp-05-orbit-mass-chair", k * 2.2 ** 2 / (4 * Math.PI ** 2) - 12, 60, "60 kg"],
      ["circular-shm-sp-06-two-readings", k6, 8.3, "8.3 N m⁻¹"],
      ["circular-shm-sp-06-two-readings", Math.sqrt(0.04 ** 2 + 0.5 * 0.3 ** 2 / k6), 0.084, "0.084 m"],
      // Fifth pass: divider inverse + meter loading; search-coil field.
      ["circuits-sp-02-sensor-loading", 3.3 / 2200, 1.5e-3, "1.5×10⁻³ A"],
      ["circuits-sp-02-sensor-loading", (9.0 - 3.3) / (3.3 / 2200) / 1000, 3.8, "3.8 kΩ"],
      ["circuits-sp-02-sensor-loading", 1 / (1 / 2.2 + 1 / 2.2), 1.1, "1.1 kΩ"],
      ["circuits-sp-02-sensor-loading", 9.0 * 1.1 / (1.1 + 3.8), 2.0, "2.0 V"],
      ["induction-sp-01-search-coil", 64e-6 * 60 / (400 * 1.2e-4), 0.080, "B = 0.080 T"],
      ["induction-sp-01-search-coil", 2 * 64, 128, "128 μC"],
    ];
    for (const [slug, computed, stated, text] of checks) {
      // Stated values are rounded to the precision shown: within 1.5%.
      expect(Math.abs(computed - stated) / stated, `${slug}: computed ${computed}, stated ${stated}`).toBeLessThan(0.015);
      expect(scheme(slug), slug).toContain(text);
    }
  });
});
