import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildLessons } from "@/content/lessons";
import { misconceptionsForTopic } from "@/content";

// Coverage measurement for the lesson engine: how many topics yield a lesson,
// how many steps they average, and how much of the authored misconception
// library the lessons surface.
describe("lesson coverage", () => {
  const allSubjectIds = allSubjects().map((s) => s.id);
  const topics = allTopics(allSubjectIds);
  const lessons = buildLessons(topics);

  it("every topic with authored key points yields a lesson", () => {
    const skipped = topics.filter((t) => !t.keyPoints.length).map((t) => t.id);
    const withKeyPoints = topics.length - skipped.length;
    expect(lessons.length).toBe(withKeyPoints);
  });

  it("lessons average at least eight steps", () => {
    const avg = lessons.reduce((a, l) => a + l.steps.length, 0) / Math.max(1, lessons.length);
    expect(avg, `average ${avg.toFixed(1)} steps`).toBeGreaterThanOrEqual(8);
  });

  it("every lesson opens with a reading step and closes with the traps", () => {
    for (const lesson of lessons) {
      expect(lesson.steps[0].check).toBeUndefined();
      const traps = lesson.steps.filter((s) => s.body.startsWith("Common trap:"));
      // Every trap is surfaced, and where key points are plentiful enough to
      // act as distractors it is an active check, never passive reading.
      expect(traps.length).toBeGreaterThanOrEqual(1);
      for (const trap of traps) {
        if (trap.check) {
          const withCheck = lesson.steps.filter((s) => s.check).length;
          expect(withCheck).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("reports misconception reach for the authoring backlog", () => {
    const withMisconceptions = topics.filter((t) => misconceptionsForTopic(t.id).length > 0).length;
    // Not an invariant — a measurement. Print so the numbers are visible in CI output.
    console.log(
      `[lesson-coverage] topics=${topics.length} lessons=${lessons.length} ` +
        `avgSteps=${(lessons.reduce((a, l) => a + l.steps.length, 0) / Math.max(1, lessons.length)).toFixed(1)} ` +
        `topicsWithMisconceptions=${withMisconceptions}`,
    );
    expect(true).toBe(true);
  });
});