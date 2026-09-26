import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import {
  pipelineQuestion,
  pipelineTopic,
  validateProvenance,
  validateSpecMapping,
} from "@/content/pipeline";

describe("content pipeline", () => {
  it("validates topic shape and preserves stable ids", () => {
    const topic = allTopics()[0]!;
    const result = pipelineTopic(topic);
    // Shape must always pass; provenance may flag stale review without failing shape.
    expect(result.schemaIssues).toEqual([]);
    expect(result.data?.id).toBe(topic.id);
  });

  it("requires provenance completeness for verified content", () => {
    expect(
      validateProvenance({ id: "x", source: "authored", verification: "verified", reviewer: null, lastChecked: "2026-01-01", specVersion: "2024-1.0" }),
    ).toContainEqual(expect.objectContaining({ code: "missing-reviewer" }));
    expect(
      validateProvenance({ id: "x", source: null, verification: "unverified", reviewer: null, lastChecked: null, specVersion: null }),
    ).toContainEqual(expect.objectContaining({ code: "missing-source" }));
    expect(
      validateProvenance({ id: "x", source: "authored", verification: "verified", reviewer: "r", lastChecked: "2026-01-01", specVersion: "2024-1.0" }),
    ).toEqual([]);
  });

  it("flags stale provenance without inventing verification", () => {
    const issues = validateProvenance({
      id: "x",
      source: "authored",
      verification: "checked",
      reviewer: "r",
      lastChecked: "2020-01-01",
      specVersion: "2024-1.0",
      now: new Date("2026-09-26T00:00:00.000Z"),
    });
    expect(issues).toContainEqual(expect.objectContaining({ code: "stale-provenance" }));
  });

  it("requires learningClaims 1:1 with markScheme when specPointIds are present", () => {
    const q = seedQuestions.find((qq) => qq.parts.some((p) => (p.specPointIds ?? []).length > 0));
    if (q) {
      expect(validateSpecMapping(q)).toEqual([]);
      const broken = {
        ...q,
        parts: q.parts.map((p) =>
          (p.specPointIds ?? []).length ? { ...p, learningClaims: [] } : p,
        ),
      };
      const issues = validateSpecMapping(broken as never);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.code).toBe("missing-learning-claims");
    }
    // More claims than mark-scheme points fails (one claim may cover several marks).
    const mismatch = {
      id: "q",
      parts: [{ id: "p", markScheme: ["a"], specPointIds: ["sp-1"], learningClaims: ["one", "two"] }],
    };
    expect(validateSpecMapping(mismatch as never)[0]?.code).toBe("claims-mismatch-markscheme");
  });

  it("pipelineQuestion keeps type safety (mark schemes + worked solutions preserved)", () => {
    const q = seedQuestions[0]!;
    const result = pipelineQuestion(q);
    expect(result.schemaIssues).toEqual([]);
    expect(result.data?.parts.every((p) => p.markScheme.length > 0)).toBe(true);
    expect(result.data?.parts.every((p) => p.modelAnswer.trim().length > 0)).toBe(true);
    // Stable ids preserved.
    expect(result.data?.id).toBe(q.id);
  });
});
