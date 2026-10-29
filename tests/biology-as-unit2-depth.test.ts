import { describe, expect, it } from "vitest";
import { wjecBiologyAsDepthQuestions } from "@/content/questions/wjec-biology-as-depth";

const u2 = wjecBiologyAsDepthQuestions.filter((q) => q.id.includes("bio-u2-"));
const marks = (q: (typeof wjecBiologyAsDepthQuestions)[number]) => q.parts.reduce((n, p) => n + p.marks, 0);

describe("Biology AS Unit 2 depth pack", () => {
  it("adds worked Unit 2 questions across all four Unit 2 topics", () => {
    expect(u2.length).toBeGreaterThanOrEqual(14);
    const topics = new Set(u2.flatMap((q) => q.topicIds));
    expect(topics.size).toBe(4);
    expect(u2.reduce((n, q) => n + marks(q), 0)).toBeGreaterThanOrEqual(60);
  });
  it("gives every scheme point its own awardable mark and every part an AO", () => {
    for (const q of u2) {
      for (const p of q.parts) {
        expect(p.markScheme.length).toBe(p.marks);
        expect(p.aos?.length).toBeGreaterThan(0);
      }
    }
  });
  it("keeps the Simpson worked answer consistent with the formula", () => {
    const q = u2.find((x) => x.id.includes("simpson"))!;
    expect(q.parts[1].modelAnswer).toContain("0.1872");
    expect(1 - (0.81 + 0.0016 + 0.0012)).toBeCloseTo(0.1872, 4);
  });
});
