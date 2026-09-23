import { describe, expect, it } from "vitest";
import { buildSessionStructure } from "@/domain/session-structure";

describe("buildSessionStructure", () => {
  it("scaffolds weak topics: explanation → easy → application", () => {
    const s = buildSessionStructure({ topicId: "t1", mastery: 0.2, totalMinutes: 14 });
    expect(s.shape).toBe("scaffolded");
    expect(s.segments[0].kind).toBe("explanation");
    expect(s.segments.some((seg) => seg.kind === "easy-retrieval")).toBe(true);
    expect(s.segments.some((seg) => seg.kind === "application")).toBe(true);
  });

  it("retrieval shape for strong topics: warm-up → transfer, no explanation", () => {
    const s = buildSessionStructure({ topicId: "t2", mastery: 0.85, totalMinutes: 14 });
    expect(s.shape).toBe("retrieval");
    expect(s.segments.some((seg) => seg.kind === "explanation")).toBe(false);
    expect(s.segments.some((seg) => seg.kind === "transfer")).toBe(true);
  });

  it("balanced shape for mid-mastery: targeted + delayed retrieval", () => {
    const s = buildSessionStructure({ topicId: "t3", mastery: 0.5, totalMinutes: 14 });
    expect(s.shape).toBe("balanced");
    expect(s.segments.some((seg) => seg.kind === "targeted-questions")).toBe(true);
    expect(s.segments.some((seg) => seg.kind === "delayed-retrieval")).toBe(true);
  });

  it("includes mistake repair when flagged and minutes allow", () => {
    const withRepair = buildSessionStructure({ topicId: "t4", mastery: 0.5, totalMinutes: 14, hasMistakes: true });
    expect(withRepair.segments.some((seg) => seg.kind === "mistake-repair")).toBe(true);
    const without = buildSessionStructure({ topicId: "t5", mastery: 0.5, totalMinutes: 14, hasMistakes: false });
    expect(without.segments.some((seg) => seg.kind === "mistake-repair")).toBe(false);
  });

  it("segment minutes sum to the total", () => {
    for (const m of [8, 14, 20, 30]) {
      const s = buildSessionStructure({ topicId: "t", mastery: 0.5, totalMinutes: m });
      const sum = s.segments.reduce((a, seg) => a + seg.minutes, 0);
      expect(sum).toBe(m);
    }
  });

  it("handles very short sessions (5 min)", () => {
    const s = buildSessionStructure({ topicId: "t", mastery: 0.3, totalMinutes: 5 });
    expect(s.segments.length).toBeGreaterThan(0);
    const sum = s.segments.reduce((a, seg) => a + seg.minutes, 0);
    expect(sum).toBeLessThanOrEqual(5);
  });
});
