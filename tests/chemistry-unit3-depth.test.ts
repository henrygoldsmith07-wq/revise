import { describe, expect, it } from "vitest";
import { wjecChemistryAsDepthQuestions as qs } from "@/content/questions/wjec-chemistry-as-depth";

describe("Chemistry Unit 3 depth pack", () => {
  it("covers electrochemical cells and p-block with enough marks", () => {
    expect(qs.filter((q) => q.id.includes("chem-u3-")).length).toBeGreaterThanOrEqual(12);
    const topics = new Set(qs.filter((q) => q.id.includes("chem-u3-")).flatMap((q) => q.topicIds));
    expect(topics.size).toBe(2);
    expect(qs.reduce((n, q) => n + q.parts.reduce((m, p) => m + p.marks, 0), 0)).toBeGreaterThanOrEqual(50);
  });
  it("gives every scheme point its own mark and every part an AO", () => {
    for (const q of qs) for (const p of q.parts) {
      expect(p.markScheme.length).toBe(p.marks);
      expect(p.aos?.length).toBeGreaterThan(0);
    }
  });
  it("keeps worked E°cell arithmetic consistent", () => {
    expect(0.34 - -0.76).toBeCloseTo(1.1, 2);
    expect(0.77 - 0.54).toBeCloseTo(0.23, 2);
    expect(0.77 - 1.07).toBeCloseTo(-0.3, 2);
    expect(0.8 - -2.37).toBeCloseTo(3.17, 2);
    const all = qs.flatMap((q) => q.parts.map((p) => p.modelAnswer)).join(" ");
    for (const v of ["+1.10 V", "+0.23 V", "−0.30 V", "+3.17 V"]) expect(all).toContain(v);
  });
});
