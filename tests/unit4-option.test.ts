import { describe, expect, it } from "vitest";
import { UNIT4_OPTIONS, isUnit4Option, topicUnit4Option, topicsForUnit4Option, topicsForYear } from "@/domain/year-group";
import { quickCheckTopicIds } from "@/domain/quick-diagnostic";
import { computeFingerprint, replanDynamically } from "@/domain/replan";
import { allTopics } from "@/domain/curriculum";
import type { Question } from "@/domain/types";

const bio = () => allTopics(["wjec-alevel-biology"]);
const base = { exams: [], targetGrades: {}, availability: [{ weekday: 1, minutes: 60 }], sessionLengthMinutes: 25, subjectIds: ["wjec-alevel-biology"] };

describe("Year 13 Unit 4 option", () => {
  it("reads the option letter from the spec reference", () => {
    expect(topicUnit4Option({ specRef: "Unit 4 Option B(a)" })).toBe("B");
    expect(topicUnit4Option({ specRef: "Unit 4 Option C" })).toBe("C");
    expect(topicUnit4Option({ specRef: "Unit 4.2" })).toBeNull();
    expect(topicUnit4Option({})).toBeNull();
    expect(isUnit4Option("D")).toBe(true);
    expect(isUnit4Option("E")).toBe(false);
    expect(UNIT4_OPTIONS).toHaveLength(4);
  });

  it("keeps only the chosen option's topics for Year 13", () => {
    const all = bio();
    const optionTopics = all.filter((t) => topicUnit4Option(t));
    expect(new Set(optionTopics.map(topicUnit4Option)).size).toBeGreaterThan(1);
    const scoped = topicsForYear(all, "year-13", "B");
    expect(scoped.filter((t) => topicUnit4Option(t)).every((t) => topicUnit4Option(t) === "B")).toBe(true);
    expect(scoped.some((t) => topicUnit4Option(t) === "B")).toBe(true);
    expect(scoped.length).toBeLessThan(all.length);
    // Core Unit 4 topics (not options) stay.
    expect(scoped.filter((t) => !topicUnit4Option(t))).toHaveLength(all.filter((t) => !topicUnit4Option(t)).length);
  });

  it("does nothing without a Year 13 choice", () => {
    const all = bio();
    expect(topicsForYear(all, "year-13")).toHaveLength(all.length);
    expect(topicsForYear(all, undefined, "B")).toHaveLength(all.length);
    expect(topicsForYear(all, "year-12", "B").some((t) => topicUnit4Option(t))).toBe(false);
  });

  it("never empties a subject that does not offer the chosen letter", () => {
    const topics = [{ subjectId: "x", specRef: "Unit 4 Option A" }, { subjectId: "x", specRef: "Unit 4 Option B" }];
    expect(topicsForUnit4Option(topics, "D")).toHaveLength(2);
    expect(topicsForUnit4Option(topics, "A")).toHaveLength(1);
  });

  it("quick check samples only the chosen option", () => {
    const all = bio();
    const a = all.find((t) => topicUnit4Option(t) === "A")!;
    const b = all.find((t) => topicUnit4Option(t) === "B")!;
    const core = all.find((t) => !topicUnit4Option(t))!;
    const pool = [{ topicIds: [a.id] }, { topicIds: [b.id] }, { topicIds: [core.id] }] as unknown as Question[];
    const lookup = (id: string) => all.find((t) => t.id === id);
    expect(quickCheckTopicIds(pool, "year-13", lookup, "B").sort()).toEqual([b.id, core.id].sort());
    expect(quickCheckTopicIds(pool, "year-13", lookup).sort()).toEqual([a.id, b.id, core.id].sort());
    expect(quickCheckTopicIds(pool, undefined, lookup, "B")).toHaveLength(3);
  });

  it("changing the option triggers a replan", () => {
    const previous = computeFingerprint({ ...base, yearGroup: "year-13" });
    expect(computeFingerprint({ ...base, yearGroup: "year-13", unit4Option: "A" })).not.toEqual(previous);
    const result = replanDynamically({
      userId: "u", topics: topicsForYear(bio(), "year-13", "A"), subjects: [], mastery: [], ...base, existing: [],
      yearGroup: "year-13", unit4Option: "A", previous, now: new Date("2026-10-26T09:00:00"), idFactory: (() => { let n = 0; return () => `s${n++}`; })(),
    });
    expect(result.reasons).toContain("year-changed");
    expect(result.summary).toMatch(/Unit 4 option/);
  });
});
