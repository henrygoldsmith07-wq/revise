import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isA2Topic, isYearGroup, topicUnitNumber, topicsForYear } from "@/domain/year-group";
import { quickCheckTopicIds } from "@/domain/quick-diagnostic";
import { computeFingerprint, replanDynamically } from "@/domain/replan";
import { allTopics } from "@/domain/curriculum";
import type { Question } from "@/domain/types";

const phys = () => allTopics(["wjec-alevel-physics"]);

describe("year group scoping", () => {
  it("reads the unit number from the spec reference", () => {
    expect(topicUnitNumber({ specRef: "Unit 1.4" })).toBe(1);
    expect(topicUnitNumber({ specRef: "Unit 4.3–4.5" })).toBe(4);
    expect(topicUnitNumber({})).toBeNull();
    expect(isA2Topic({ specRef: "Unit 3.1" })).toBe(true);
    expect(isA2Topic({ specRef: "Unit 2.5" })).toBe(false);
    expect(isA2Topic({ specRef: undefined })).toBe(false);
    expect(isYearGroup("year-12")).toBe(true);
    expect(isYearGroup("12")).toBe(false);
  });

  it("Year 12 keeps AS topics only; Year 13 and unknown keep everything", () => {
    const topics = phys();
    expect(topics.some(isA2Topic)).toBe(true);
    const y12 = topicsForYear(topics, "year-12");
    expect(y12.length).toBeGreaterThan(0);
    expect(y12.some(isA2Topic)).toBe(false);
    expect(topicsForYear(topics, "year-13")).toHaveLength(topics.length);
    expect(topicsForYear(topics, undefined)).toHaveLength(topics.length);
  });

  it("a subject whose spec has no numbered units is never emptied", () => {
    const unnumbered = [{ subjectId: "x", specRef: "Topic 5" }, { subjectId: "x", specRef: undefined }];
    expect(topicsForYear(unnumbered, "year-12")).toHaveLength(2);
    const onlyA2 = [{ subjectId: "y", specRef: "Unit 3.1" }];
    expect(topicsForYear(onlyA2, "year-12")).toHaveLength(1);
  });

  it("quick check samples AS topics first for Year 12", () => {
    const [as, a2] = [phys().find((t) => !isA2Topic(t))!, phys().find(isA2Topic)!];
    const pool = [{ topicIds: [a2.id] }, { topicIds: [as.id] }] as unknown as Question[];
    const lookup = (id: string) => phys().find((t) => t.id === id);
    expect(quickCheckTopicIds(pool, "year-12", lookup)).toEqual([as.id]);
    expect(quickCheckTopicIds(pool, undefined, lookup).sort()).toEqual([as.id, a2.id].sort());
    // No AS topic in the pool: fall back rather than offer an empty check.
    expect(quickCheckTopicIds([{ topicIds: [a2.id] }] as unknown as Question[], "year-12", lookup)).toEqual([a2.id]);
  });

  it("changing the year group triggers a replan that drops A2 blocks", () => {
    const base = { exams: [], targetGrades: {}, availability: [{ weekday: 1, minutes: 60 }, { weekday: 3, minutes: 60 }], sessionLengthMinutes: 25, subjectIds: ["wjec-alevel-physics"] };
    expect(computeFingerprint({ ...base, yearGroup: "year-12" })).not.toEqual(computeFingerprint(base));
    const previous = computeFingerprint(base);
    const result = replanDynamically({
      userId: "u", topics: topicsForYear(phys(), "year-12"), subjects: [], mastery: [], ...base, existing: [], yearGroup: "year-12", previous,
      now: new Date("2026-10-26T09:00:00"), idFactory: (() => { let n = 0; return () => `s${n++}`; })(),
    });
    expect(result.reasons).toContain("year-changed");
    expect(result.summary).toMatch(/year group/);
    const a2 = new Set(phys().filter(isA2Topic).map((t) => t.id));
    expect(result.plan.length).toBeGreaterThan(0);
    expect(result.plan.some((s) => s.topicId !== undefined && a2.has(s.topicId))).toBe(false);
  });

  it("onboarding and Settings both offer the optional year choice and save it", () => {
    const onboarding = readFileSync("src/components/Onboarding.tsx", "utf8");
    const settings = readFileSync("src/app/settings/page.tsx", "utf8");
    expect(onboarding).toContain("Which year are you in?");
    expect(onboarding).toMatch(/\.\.\.\(yearGroup \? \{ yearGroup \} : \{\}\)/);
    expect(settings).toContain('ariaLabel="Year group"');
    expect(settings).toContain("updateSettings({ yearGroup:");
  });
});
