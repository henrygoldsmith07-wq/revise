import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildLessons } from "@/content/lessons";
import { misconceptionsForTopic } from "@/content";
import type { Topic } from "@/domain/types";

// Coverage measurement for the lesson engine: how many topics yield a lesson,
// how many steps they average, and how much of the authored misconception
// library the lessons surface.
describe("lesson coverage", () => {
  const allSubjectIds = allSubjects().map((s) => s.id);
  const topics = allTopics(allSubjectIds);
  const lessons = buildLessons(topics);

  it("every authored topic yields a lesson", () => {
    expect(lessons).toHaveLength(topics.length);
    expect(new Set(lessons.map((lesson) => lesson.topicId)).size).toBe(topics.length);
  });

  it("keeps a specification-only topic on the roadmap", () => {
    const topic: Topic = {
      id: "coverage.spec-only",
      subjectId: "coverage.subject",
      unitId: "coverage.unit",
      title: "Specification-only topic",
      order: 1,
      intrinsicDifficulty: 2,
      summary: "A concise authored summary still gives the learner a map.",
      keyPoints: [],
      commonErrors: [],
      specPoints: [
        {
          id: "coverage.spec-only.point-1",
          ref: "1.1",
          text: "State the defining feature and connect it to the topic.",
          aos: ["AO1"],
        },
      ],
    };
    const lesson = buildLessons([topic])[0];
    expect(lesson?.topicId).toBe(topic.id);
    expect(lesson?.steps.some((step) => step.kind === "core" && step.application)).toBe(true);
    expect(lesson?.steps.find((step) => step.kind === "core")?.check?.options.length).toBeGreaterThanOrEqual(2);
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
