import { describe, expect, it } from "vitest";
import { wjecChemistryAsDepthQuestions as all } from "@/content/questions/wjec-chemistry-as-depth";

const qs = all.filter((q) => q.id.includes("chem-u2-"));
const text = qs.flatMap((q) => q.parts.map((p) => p.modelAnswer)).join(" ");

describe("Chemistry Unit 2 depth pack", () => {
  it("adds energetics, kinetics and equilibria questions with one scheme point per mark", () => {
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(qs.flatMap((q) => q.topicIds)).size).toBe(3);
    for (const q of qs) for (const p of q.parts) {
      expect(p.markScheme.length).toBe(p.marks);
      expect(p.aos?.length).toBeGreaterThan(0);
    }
  });
  it("keeps the worked numbers consistent with their data", () => {
    expect(-394 + 2 * -286 - -890).toBe(-76);
    expect(4 * 413 + 2 * 498 - (2 * 805 + 4 * 464)).toBe(-818);
    expect(50 * 4.18 * 6.5 / 1000 / 0.02).toBeCloseTo(67.9, 1);
    expect(2e-3 / (0.1 ** 2 * 0.1)).toBeCloseTo(2.0, 5);
    expect(0.4 ** 2 / (0.5 * 1.5 ** 3)).toBeCloseTo(0.0948, 4);
    for (const v of ["−76 kJ", "−818 kJ", "−67.9 kJ", "0.0948 dm⁶ mol⁻²", "dm⁶ mol⁻² s⁻¹"]) expect(text).toContain(v);
  });
});
