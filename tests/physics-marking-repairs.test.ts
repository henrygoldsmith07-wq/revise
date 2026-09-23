import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markPart } from "@/domain/marking";
import { markCalculationWorking, contradictoryWorkingStep } from "@/domain/calculation-rubric";
import type { QuestionPart } from "@/domain/types";
const energy = (slug: string) => seedQuestions.find(q => q.id === "cnt:question:physics-energy-" + slug)!.parts[0]!;
const depth = (family: string) => seedQuestions.find(q => q.learning?.familyId === `physics-depth:${family}`)!;

describe("synthetic Physics marking regressions, not human validation", () => {
  it("does not treat speed or area units as a length result", () => {
    const part: QuestionPart = { id: "p", label: "", prompt: "Find the length.", marks: 1,
      capabilityIds: ["phys.test"], markScheme: ["Length = 6 m"], modelAnswer: "The length is six metres." };
    expect(markPart(part, "Length = 6 m").awarded).toBe(1);
    for (const answer of ["Length = 6 m/s", "Length = 6 m s^-1", "Length = 6 m²"]) {
      expect(markPart(part, answer).awarded, answer).toBe(0);
    }
  });
  it("keeps the depth pack explicitly unreviewed after automated repairs", () => {
    for (const question of seedQuestions.filter(q => q.learning?.familyId?.startsWith("physics-depth:"))) {
      expect(question.source).toBe("generated");
      expect(question.verification).toBe("unverified");
      expect(question.reviewer).toBeNull();
    }
  });
  it("rejects the old incorrect rope-extension result while retaining the energy method", () => {
    const part = depth("safety-net-arrest").parts[0]!;
    const root = (588.6 + Math.sqrt(588.6 ** 2 + 4 * 2000 * 2354.4)) / 4000;
    expect(root).toBeCloseTo(1.24207, 5);
    expect(0.5 * 4000 * root ** 2).toBeCloseTo(60 * 9.81 * (4 + root), 6);
    const wrong = "Gravitational energy lost = mg(4.0 + x), including the extension. At maximum extension kinetic energy is zero, so mg(4.0 + x) = ½kx². Substitution gives 2000x² − 588.6x − 2354.4 = 0. The positive root is x = 1.14 m.";
    const marked = markPart(part, wrong);
    expect(marked.awarded).toBeLessThan(part.marks);
    expect(marked.creditedPoints).not.toContain(part.markScheme[3]);
    expect(markPart(part, wrong.replace("1.14 m", "1.2 m")).creditedPoints).toContain(part.markScheme[3]);
    expect(markPart(part, part.modelAnswer).awarded).toBe(part.marks);
  });
  it("accepts diameter-ratio reasoning without demanding an absolute cable area", () => {
    const part = depth("cable-safety-factor").parts[0]!;
    expect(part.prompt).toContain("reaches its breaking stress");
    expect(markPart(part, "Stress = F/A, so at the same load the required area is five times the original area. Since A is proportional to d², the diameter increases by √5. Required diameter = 4.0√5 = 8.9 mm.").awarded).toBe(3);
  });
  it("keeps unsupported algebra provisional even when its final number is right", () => {
    const part: QuestionPart = { id: "p", label: "", prompt: "Calculate F.", marks: 1,
      markScheme: ["F = 6 N"], modelAnswer: "F = 6 N",
      calculationRules: [{ kind: "accuracy", label: "F", expected: 6 }] };
    const result = markCalculationWorking(part, "F = unknown(a,b) = 6 N")!;
    expect(result.awarded).toBe(0);
    expect(result.evidence?.[0]?.status).toBe("unreported");
    expect(result.comment).toContain("provisional");
    expect(markCalculationWorking(part, "F = 2 + 3 = 6 N")?.awarded).toBe(0);
  });
  it("does not invent a contradiction between equivalent standard-form values", () => {
    expect(contradictoryWorkingStep("F = 1.04 × 10³ N\nF = 1040 N")).toBeNull();
    expect(contradictoryWorkingStep("E = 2 × 10⁻³ J\nE = 0.002 J")).toBeNull();
    expect(contradictoryWorkingStep("F = 1.04 × 10³ N\nF = 104 N")).toBe(1);
  });
  it("accepts the correct required-voltage alternative", () => {
    expect(markPart(energy("choose-pulse-bank"), "For A, V = sqrt(2*0.40/0.0022) = 19.1 V, above the 16 V rating. For B, V = sqrt(2*0.40/0.0010) = 28.3 V, below the 35 V rating and 30 V supply maximum. Only B is suitable.").awarded).toBe(3);
  });
  it("withholds the voltage accuracy mark after losing the factor two", () => {
    const result = markPart(energy("infer-voltage-from-charge-energy"), "V = U/Q = 0.018/0.000600 = 30 V. C = Q/V = 0.000600/30 = 0.000020 F.");
    expect(result.awarded).toBe(1);
    expect(result.creditedPoints).toEqual([energy("infer-voltage-from-charge-energy").markScheme[2]]);
  });
  it("does not award numerical energy for the zero-net-charge misconception", () => {
    expect(markPart(energy("neutral-does-not-mean-empty"), "There is no electric field energy because net charge is zero. U = 0 J.").awarded).toBe(0);
  });
  it("does not credit selecting the opposite bank", () => {
    expect(markPart(energy("choose-pulse-bank"), "Only A is suitable.").creditedPoints).not.toContain("Only B is suitable.");
  });
  it("does not drop negation in the authored-answer equivalence shortcut", () => {
    const part: QuestionPart = { id: "p", label: "", prompt: "Explain.", marks: 2, capabilityIds: ["phys.test"],
      modelAnswer: "The force does not change speed. It changes direction.",
      markScheme: ["The force does not change speed.", "It changes direction."] };
    const result = markPart(part, "The force does change speed. It changes direction.");
    expect(result.comment).not.toContain("Complete authored answer");
    expect(result.awarded).toBeLessThan(2);
  });
  it.each(["1.04 × 10³", "1.04e3", "1.04 * 10^3"])("parses standard form %s without concatenating the exponent", value => {
    const part: QuestionPart = { id: "p", label: "", prompt: "Find F.", marks: 3, modelAnswer: "F = 1040 N",
      markScheme: ["1040 N", "N", "3 significant figures"], calculationRules: [
        { kind: "accuracy", label: "F", expected: 1040 }, { kind: "unit", label: "F", expected: 1040, unitAliases: ["N"] },
        { kind: "precision", label: "F", expected: 1040, significantFigures: 3 }] };
    expect(markCalculationWorking(part, "F = " + value + " N")?.awarded).toBe(3);
  });
});
