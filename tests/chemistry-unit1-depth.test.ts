import { describe, expect, it } from "vitest";
import { wjecChemistryAsDepthQuestions as all } from "@/content/questions/wjec-chemistry-as-depth";

const qs = all.filter((q) => q.id.includes("chem-u1-"));
const text = qs.flatMap((q) => q.parts.map((p) => p.modelAnswer)).join(" ");

describe("Chemistry Unit 1 depth pack", () => {
  it("adds moles, atomic structure, bonding and redox questions with one scheme point per mark", () => {
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(qs.flatMap((q) => q.topicIds)).size).toBe(4);
    for (const q of qs) for (const p of q.parts) {
      expect(p.markScheme.length).toBe(p.marks);
      expect(p.aos?.length).toBeGreaterThan(0);
    }
  });
  it("keeps the worked numbers consistent with their data", () => {
    expect(85.7 / 12 / (14.3 / 1)).toBeCloseTo(0.5, 1);
    expect(0.1 * 0.02 / 0.025).toBeCloseTo(0.08, 5);
    expect(0.486 / 24.3 * 24 * 1000).toBeCloseTo(480, 5);
    expect(2.1 / (5 / 100 * 56) * 100).toBeCloseTo(75, 5);
    expect((35 * 75 + 37 * 25) / 100).toBe(35.5);
    expect(5 * 0.02 * 0.023 / 0.025).toBeCloseTo(0.092, 5);
    for (const v of ["C4H8", "0.0800 mol dm⁻³", "480 cm³", "75.0%", "35.5", "0.0920 mol dm⁻³"]) expect(text).toContain(v);
  });
});
