import { describe, expect, it } from "vitest";
import { buildRoadmapLessons } from "@/content/lessons";
import { TEACHING } from "@/content/teaching";
import { allTopics } from "@/domain/curriculum";

// Authored teaching replaces lessons that only restated the spec point. These
// checks keep the content structurally honest; the physics itself is
// unreviewed authored material, like the rest of the bank.

const physics = allTopics(["wjec-alevel-physics"]);
const specIds = physics.flatMap((t) => (t.specPoints ?? []).map((p) => p.id));

describe("authored lesson teaching", () => {
  it("covers every WJEC A-level Physics checkpoint and nothing that is not one", () => {
    expect(specIds.length).toBe(108);
    for (const id of specIds) expect(TEACHING[id], id).toBeDefined();
    const known = new Set(specIds);
    for (const id of Object.keys(TEACHING)) expect(known.has(id), id).toBe(true);
  });

  it("every entry teaches, works an example, checks the physics and has a real model answer", () => {
    for (const [id, t] of Object.entries(TEACHING)) {
      expect(t.explain.length, id).toBeGreaterThanOrEqual(3);
      expect(t.worked.steps.length, id).toBeGreaterThanOrEqual(1);
      expect(t.worked.answer.trim(), id).not.toBe("");
      const { options, correctIndex } = t.check;
      expect(options.length, id).toBeGreaterThanOrEqual(3);
      expect(new Set(options).size, id).toBe(options.length);
      expect(correctIndex >= 0 && correctIndex < options.length, id).toBe(true);
      expect(t.apply.modelAnswer.length, id).toBeGreaterThan(40);
      expect(t.apply.successCriteria.length, id).toBeGreaterThanOrEqual(2);
      // No "which spec sentence is this" checks and no restated spec wording as teaching.
      expect(t.check.question.toLowerCase(), id).not.toContain("checkpoint");
      const text = JSON.stringify(t);
      expect(text, id).not.toMatch(/\.\.\.|TODO|lorem/i);
    }
  });

  it("builds Physics lessons from the teaching and marks the rest as outlines", () => {
    const entries = buildRoadmapLessons(physics);
    expect(entries.filter((e) => e.lesson.outline)).toHaveLength(0);
    const first = entries[0]!.lesson;
    expect(first.steps.map((s) => s.title)).toContain("Worked example");
    expect(first.steps.find((s) => s.kind === "core")!.body).toContain("A **scalar** has size only");
    expect(JSON.stringify(first)).not.toContain("Start with the requirement in plain English");

    const other = buildRoadmapLessons(allTopics(["wjec-alevel-biology"]));
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((e) => e.lesson.outline === true)).toBe(true);
  });
});
