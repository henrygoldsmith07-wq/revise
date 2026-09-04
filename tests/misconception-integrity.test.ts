import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { seedMisconceptions } from "@/content";

// Integrity guard for the authored misconception library. The lesson engine
// turns every entry into an interactive step, so a typo in a topic slug or a
// duplicated id would silently mis-attach or collide on re-seed.
describe("misconception library integrity", () => {
  const topics = allTopics(allSubjects().map((s) => s.id));
  const topicIds = new Set(topics.map((t) => t.id));

  it("every misconception resolves to real curriculum topics", () => {
    const broken: string[] = [];
    for (const m of seedMisconceptions) {
      for (const t of m.topicIds) {
        if (!topicIds.has(t)) broken.push(`${m.id} -> ${t}`);
      }
    }
    expect(broken, broken.join(", ")).toEqual([]);
  });

  it("slugs and ids are unique", () => {
    const ids = seedMisconceptions.map((m) => m.id);
    const slugs = ids.map((id) => id.replace("cnt:misconception:", ""));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every entry has non-empty statement, explanation, example and correction", () => {
    for (const m of seedMisconceptions) {
      expect(m.statement.trim().length, `${m.id} statement`).toBeGreaterThan(10);
      expect(m.explanation.trim().length, `${m.id} explanation`).toBeGreaterThan(10);
      expect(m.example.trim().length, `${m.id} example`).toBeGreaterThan(10);
      expect(m.correction.trim().length, `${m.id} correction`).toBeGreaterThan(10);
    }
  });

  it("each topic carries at most one misconception per distinct statement", () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const m of seedMisconceptions) {
      for (const t of m.topicIds) {
        const key = `${t}::${m.statement}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of seen) if (n > 1) dupes.push(`${key} x${n}`);
    expect(dupes, dupes.join(", ")).toEqual([]);
  });

  it("reach is reported so the authoring backlog stays visible", () => {
    const withMisconceptions = topics.filter((t) =>
      seedMisconceptions.some((m) => m.topicIds.includes(t.id)),
    ).length;
    console.log(
      `[misconception-integrity] entries=${seedMisconceptions.length} ` +
        `topics-covered=${withMisconceptions}/${topics.length} ` +
        `(${((withMisconceptions / topics.length) * 100).toFixed(1)}%)`,
    );
    expect(true).toBe(true);
  });
});
