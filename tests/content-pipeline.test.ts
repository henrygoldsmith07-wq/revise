import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
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

  it("requires learningClaims on mapped parts; claimMap allocates marks explicitly", () => {
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
    // One claim may earn several marks — no positional rule on the list itself.
    expect(
      validateSpecMapping({
        id: "q",
        parts: [{ id: "p", markScheme: ["a", "b", "c"], specPointIds: ["sp-1"], learningClaims: ["one claim"] }],
      } as never),
    ).toEqual([]);
    // More claims than marks fails: each claim must earn at least one mark.
    expect(
      validateSpecMapping({
        id: "q",
        parts: [{ id: "p", markScheme: ["a"], specPointIds: ["sp-1"], learningClaims: ["one", "two"] }],
      } as never)[0]?.code,
    ).toBe("missing-learning-claims");
    // A present claimMap must allocate every mark point to a valid claim index.
    expect(
      validateSpecMapping({
        id: "q",
        parts: [{ id: "p", markScheme: ["a", "b"], specPointIds: ["sp-1"], learningClaims: ["one"], claimMap: [0, 0] }],
      } as never),
    ).toEqual([]);
    const badMap = validateSpecMapping({
      id: "q",
      parts: [{ id: "p", markScheme: ["a", "b"], specPointIds: ["sp-1"], learningClaims: ["one"], claimMap: [0, 3] }],
    } as never);
    expect(badMap[0]?.code).toBe("invalid-claim-map");
    const shortMap = validateSpecMapping({
      id: "q",
      parts: [{ id: "p", markScheme: ["a", "b"], specPointIds: ["sp-1"], learningClaims: ["one"], claimMap: [0] }],
    } as never);
    expect(shortMap[0]?.code).toBe("invalid-claim-map");
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

  it("compact authoring carries an explicit claimMap into the pipeline", () => {
    const question = defineQuestion({
      slug: "claim-map-authoring",
      subjectId: "physics",
      topics: ["capacitors"],
      stem: "Explain how a capacitor stores charge.",
      parts: [
        {
          prompt: "Describe the effect on the stored charge and justify it.",
          marks: 2,
          scheme: ["identifies the stored charge", "justifies with Q = CV"],
          answer: "Q increases; Q = CV is linear in C.",
          learningClaims: ["stored charge rises with capacitance"],
          claimMap: [0, 0],
        },
      ],
    });
    expect(question.parts[0]?.claimMap).toEqual([0, 0]);
    const result = pipelineQuestion(question);
    expect(result.schemaIssues).toEqual([]);
    expect(result.mappingIssues).toEqual([]);
  });

  it("omits claimMap entirely when the author does not supply one", () => {
    const question = defineQuestion({
      slug: "claim-map-absent",
      subjectId: "physics",
      topics: ["capacitors"],
      stem: "What does a capacitor do?",
      parts: [{ prompt: "State the function.", marks: 1, scheme: ["stores charge"], answer: "Stores charge." }],
    });
    expect(question.parts[0]?.claimMap).toBeUndefined();
    expect("claimMap" in (question.parts[0] as object)).toBe(false);
  });

  it("a claimMap that does not match the mark scheme is rejected by the pipeline", () => {
    const question = defineQuestion({
      slug: "claim-map-invalid",
      subjectId: "physics",
      topics: ["capacitors"],
      stem: "Explain the discharge.",
      parts: [
        {
          prompt: "Explain.",
          marks: 2,
          scheme: ["a", "b"],
          answer: "Because.",
          learningClaims: ["one claim"],
          claimMap: [0, 0, 0],
        },
      ],
    });
    const result = pipelineQuestion(question);
    expect(result.schemaIssues.length).toBeGreaterThan(0);
  });
});
