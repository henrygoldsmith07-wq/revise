import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildLesson, buildLessons, summariseLesson } from "@/content/lessons";

// The summary screen's scoring: checks answered vs total, plus the missed
// ones as (step body, correct answer) pairs for the recap cards.
describe("summariseLesson", () => {
  const topic = allTopics(["aqa-alevel-maths"]).find((t) => t.id === "aqa-alevel-maths.proof")!;
  const lesson = buildLesson(topic)!;

  it("scores a perfect run with no missed cards", () => {
    const checked: Record<string, number> = {};
    for (const step of lesson.steps) {
      if (step.check) checked[step.id] = step.check.correctIndex;
    }
    const result = summariseLesson(lesson, checked);
    expect(result.total).toBeGreaterThan(0);
    expect(result.correct).toBe(result.total);
    expect(result.missed).toEqual([]);
  });

  it("extracts a (body, answer) card for every wrong answer, in step order", () => {
    const checked: Record<string, number> = {};
    for (const step of lesson.steps) {
      if (step.check) checked[step.id] = (step.check.correctIndex + 1) % step.check.options.length;
    }
    const result = summariseLesson(lesson, checked);
    const checkSteps = lesson.steps.filter((s) => s.check);
    expect(result.correct).toBe(0);
    expect(result.missed.length).toBe(result.total);
    expect(result.missed.map((m) => m.body)).toEqual(checkSteps.map((s) => s.body));
    expect(result.missed.every((m) => m.answer.length > 0)).toBe(true);
    // Each answer is the option at correctIndex, not the wrong choice.
    const firstCheck = checkSteps[0]!.check!;
    expect(result.missed[0]!.answer).toBe(firstCheck.options[firstCheck.correctIndex]);
  });

  it("unanswered checks count as missed", () => {
    const result = summariseLesson(lesson, {});
    expect(result.correct).toBe(0);
    expect(result.missed.length).toBe(result.total);
  });
});

// The lesson list renders buildLesson(topic)!.id as the completion key, so
// buildLesson and buildLessons must agree for every topic.
describe("buildLesson / buildLessons agreement", () => {
  it("every topic yields the same lesson id either way", () => {
    const topics = allTopics(allSubjects().map((s) => s.id));
    const batch = new Map(buildLessons(topics).map((l) => [l.topicId, l.id]));
    for (const topic of topics) {
      const single = buildLesson(topic);
      if (single === null) continue;
      expect(batch.get(topic.id), topic.id).toBe(single.id);
    }
  });
});
