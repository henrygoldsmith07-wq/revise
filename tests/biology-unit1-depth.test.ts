import { describe, expect, it } from "vitest";
import { wjecBiologyAsDepthQuestions as all } from "@/content/questions/wjec-biology-as-depth";

const qs = all.filter((q) => q.id.includes("bio-u1-"));
const text = qs.flatMap((q) => q.parts.map((p) => p.modelAnswer)).join(" ");

describe("Biology Unit 1 depth pack", () => {
  it("adds 9 Unit 1 questions across five topics with one scheme point per mark", () => {
    expect(qs.length).toBe(9);
    expect(new Set(qs.flatMap((q) => q.topicIds)).size).toBe(5);
    for (const q of qs) for (const p of q.parts) {
      expect(p.markScheme.length).toBe(p.marks);
      expect(p.aos?.length).toBeGreaterThan(0);
    }
  });
  it("keeps worked numbers consistent with their data", () => {
    expect((36 / 12000) * 1000).toBeCloseTo(3, 5);
    expect(12 / 30).toBeCloseTo(0.4, 5);
    expect(((12 - 4.5) / 12) * 100).toBeCloseTo(62.5, 5);
    expect(((2.2 - 2.5) / 2.5) * 100).toBeCloseTo(-12, 5);
    expect((100 - 2 * 28) / 2).toBe(22);
    for (const v of ["3 µm", "0.40 cm³ s⁻¹", "62.5%", "−12.0%", "guanine = 22%", "AUG CCA GUU"]) expect(text).toContain(v);
  });
});
