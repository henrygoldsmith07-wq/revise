import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allSubjects, allTopics, unitsFor } from "@/domain/curriculum";
import { buildLessons } from "@/content/lessons";

const source = readFileSync(resolve(process.cwd(), "src/components/LessonMode.tsx"), "utf8");

describe("learning roadmap", () => {
  it("groups every authored lesson under its subject unit", () => {
    for (const subject of allSubjects()) {
      const unitIds = new Set(unitsFor(subject.id).map((unit) => unit.id));
      const topics = allTopics([subject.id]);
      const topicById = new Map(topics.map((topic) => [topic.id, topic]));
      for (const lesson of buildLessons(topics)) {
        expect(unitIds.has(topicById.get(lesson.topicId)?.unitId ?? ""), lesson.id).toBe(true);
      }
    }
  });

  it("exposes an ordered roadmap with progress and detailed outlines", () => {
    expect(source).toContain("Learning roadmap");
    expect(source).toContain("unitsFor(currentSubjectId)");
    expect(source).toContain('aria-label="Learning roadmap units"');
    expect(source).toContain("Unit ${unitIndex + 1} progress");
    expect(source).toContain("See detailed lesson outline");
    expect(source).toContain("What you will learn");
    expect(source).toContain("Recommended next");
  });
});
