import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const roadmap = readFileSync(resolve(process.cwd(), "src/components/TodayRoadmap.tsx"), "utf8");

describe("Today learning roadmap", () => {
  it("reuses the full lesson builder and synced completion map", () => {
    expect(roadmap).toContain("buildRoadmapLessons(topics)");
    expect(roadmap).toContain("lessonProgress.completed");
    expect(roadmap).toContain("completed[entry.lesson.id]");
    expect(roadmap).toContain("completed[`video:${entry.topic.id}`]");
    expect(roadmap).toContain("completed[`lesson:${entry.topic.id}`]");
  });

  it("shows a next checkpoint, overall progress and every populated unit", () => {
    expect(roadmap).toContain("Today's learning roadmap");
    expect(roadmap).toContain("Recommended next");
    expect(roadmap).toContain("Continue roadmap");
    expect(roadmap).toContain("Path by unit");
    expect(roadmap).toContain('aria-label="Learning roadmap units"');
    expect(roadmap).toContain("Unit ${unitIndex + 1} progress");
    expect(roadmap).toContain("View full roadmap");
  });

  it("links the next checkpoint into the written, active-recall lesson flow", () => {
    expect(roadmap).toContain("/lesson?subject=");
    expect(roadmap).toContain("&topic=");
    expect(roadmap).toContain("active recall");
    expect(roadmap).toContain("model answer");
  });
});
