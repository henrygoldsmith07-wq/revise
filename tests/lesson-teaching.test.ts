import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildLesson, buildLessons, summariseLesson } from "@/content/lessons";

describe("guided lesson explanations", () => {
  const lessons = buildLessons(allTopics(allSubjects().map((subject) => subject.id)));

  it("gives every step a purpose, ordered explanation and takeaway", () => {
    for (const lesson of lessons) {
      expect(lesson.steps[0]?.kind, lesson.id).toBe("overview");
      for (const step of lesson.steps) {
        expect(step.title.trim(), `${lesson.id}/${step.id}`).not.toBe("");
        expect(step.explanationSteps.length, `${lesson.id}/${step.id}`).toBeGreaterThanOrEqual(2);
        expect(step.explanationSteps.every((line) => line.trim().length > 0), `${lesson.id}/${step.id}`).toBe(true);
        expect(step.takeaway.trim(), `${lesson.id}/${step.id}`).not.toBe("");
        if (step.check) {
          expect(step.check.explanation.trim(), `${lesson.id}/${step.id}`).not.toBe("");
        }
      }
    }
  });

  it("turns compound authored points into ordered chunks without changing their wording", () => {
    const topic = allTopics(["aqa-gcse-biology"]).find((candidate) => candidate.id === "aqa-gcse-biology.biological-molecules");
    expect(topic).toBeDefined();
    const lesson = buildLesson(topic!)!;
    const condensation = lesson.steps.find((step) => step.body.startsWith("Condensation forms"));
    expect(condensation?.explanationSteps.length).toBeGreaterThanOrEqual(2);
    expect(condensation?.explanationSteps.join(" ")).toContain("hydrolysis uses water");
  });

  it("carries the correction explanation into missed-check recaps", () => {
    const lesson = lessons[0]!;
    const checked: Record<string, number> = {};
    const firstCheck = lesson.steps.find((step) => step.check);
    expect(firstCheck).toBeDefined();
    const wrong = firstCheck!.check!.correctIndex === 0 ? 1 : 0;
    checked[firstCheck!.id] = wrong;
    const result = summariseLesson(lesson, checked);
    expect(result.missed[0]?.explanation).toBe(firstCheck!.check!.explanation);
  });
});
