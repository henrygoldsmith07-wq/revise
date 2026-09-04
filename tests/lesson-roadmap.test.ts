import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allSubjects, allTopics, unitsFor } from "@/domain/curriculum";
import { buildLessons, buildRoadmapLessons } from "@/content/lessons";

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

  it("creates a focused checkpoint lesson for every specification point", () => {
    for (const subject of allSubjects()) {
      const topics = allTopics([subject.id]);
      const entries = buildRoadmapLessons(topics);
      const expectedCount = topics.reduce((total, topic) => {
        const points = topic.specPoints?.filter((point) => point.text.trim().length > 0) ?? [];
        return total + (points.length || (topic.keyPoints.length ? 1 : 0));
      }, 0);

      expect(entries.length, subject.id).toBe(expectedCount);
      for (const topic of topics) {
        const topicEntries = entries.filter((entry) => entry.topic.id === topic.id);
        const pointCount = topic.specPoints?.filter((point) => point.text.trim().length > 0).length || 1;
        if (!topic.keyPoints.length) {
          expect(topicEntries, topic.id).toHaveLength(0);
          continue;
        }
        expect(topicEntries, topic.id).toHaveLength(pointCount);
        topicEntries.forEach((entry, index) => {
          expect(entry.lesson.checkpointIndex, entry.lesson.id).toBe(index + 1);
          expect(entry.lesson.checkpointTotal, entry.lesson.id).toBe(pointCount);
          expect(entry.lesson.steps.length, entry.lesson.id).toBeGreaterThanOrEqual(4);
          expect(entry.lesson.focus.trim(), entry.lesson.id).not.toBe("");
          expect(new Set(entry.lesson.steps.map((step) => step.id)).size, entry.lesson.id).toBe(entry.lesson.steps.length);
          for (const step of entry.lesson.steps) {
            if (!step.check) continue;
            expect(step.check.options.length, step.id).toBeGreaterThanOrEqual(2);
            expect(step.check.correctIndex, step.id).toBeGreaterThanOrEqual(0);
            expect(step.check.correctIndex, step.id).toBeLessThan(step.check.options.length);
          }
        });
      }
    }
  });

  it("exposes an ordered roadmap with progress and detailed outlines", () => {
    expect(source).toContain("Learning roadmap");
    expect(source).toContain("buildRoadmapLessons(topics)");
    expect(source).toContain("unitsFor(currentSubjectId)");
    expect(source).toContain('aria-label="Learning roadmap units"');
    expect(source).toContain("Unit ${unitIndex + 1} progress");
    expect(source).toContain("See detailed lesson outline");
    expect(source).toContain("What you will learn");
    expect(source).toContain("Recommended next");
  });
});
