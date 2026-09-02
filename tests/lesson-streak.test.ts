import { describe, expect, it } from "vitest";
import { nextLessonStreak } from "@/state/store";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildLessons } from "@/content/lessons";

// The streak roll behind completeLesson: several lessons in one day count as
// a single streak day, a lesson on the following day extends, a gap restarts.
describe("nextLessonStreak", () => {
  const today = "2026-09-02";
  const yesterday = "2026-09-01";

  it("first-ever lesson starts a 1-day streak", () => {
    expect(nextLessonStreak({ count: 0, lastDay: "" }, today, yesterday)).toEqual({
      count: 1,
      lastDay: today,
    });
  });

  it("several lessons on the same day count as one streak day", () => {
    const current = { count: 3, lastDay: today };
    expect(nextLessonStreak(current, today, yesterday)).toEqual(current);
  });

  it("a lesson on the day after the last one extends the streak", () => {
    expect(nextLessonStreak({ count: 4, lastDay: yesterday }, today, yesterday)).toEqual({
      count: 5,
      lastDay: today,
    });
  });

  it("any longer gap restarts the streak at 1", () => {
    expect(nextLessonStreak({ count: 9, lastDay: "2026-08-30" }, today, yesterday)).toEqual({
      count: 1,
      lastDay: today,
    });
  });
});

// Lesson and step ids key the synced completion record and the migration from
// the old localStorage keys, so a rebuild must produce identical ids.
describe("lesson engine id determinism", () => {
  it("rebuilding the curriculum yields identical lesson and step ids", () => {
    const topics = allTopics(allSubjects().map((s) => s.id));
    const first = buildLessons(topics).map((l) => ({
      id: l.id,
      steps: l.steps.map((s) => s.id),
    }));
    const second = buildLessons(topics).map((l) => ({
      id: l.id,
      steps: l.steps.map((s) => s.id),
    }));
    expect(second).toEqual(first);
  });

  it("step ids stay stable when other topics are built alongside", () => {
    const topics = allTopics(allSubjects().map((s) => s.id));
    const alone = buildLessons(topics.filter((t) => t.id === "aqa-alevel-maths.differentiation"));
    const together = buildLessons(topics);
    const target = alone[0]!.id;
    expect(together.find((l) => l.id === target)!.steps.map((s) => s.id)).toEqual(
      alone[0]!.steps.map((s) => s.id),
    );
  });
});
