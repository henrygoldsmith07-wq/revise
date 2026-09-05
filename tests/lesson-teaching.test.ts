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

  it("actually explains a mechanism as a condition, changes and result", () => {
    const topic = allTopics(["aqa-gcse-biology"]).find((candidate) => candidate.id === "aqa-gcse-biology.enzymes");
    expect(topic).toBeDefined();
    const lesson = buildLesson(topic!)!;
    const denaturation = lesson.steps.find((step) => step.body.startsWith("Above the optimum"));
    expect(denaturation?.explanationMode).toBe("process");
    expect(denaturation?.explanationSteps[0]).toContain("Above the optimum");
    expect(denaturation?.explanationSteps.join(" ")).toContain("bonds holding the tertiary structure break");
    expect(denaturation?.explanationSteps.join(" ")).toContain("active site changes shape");
    expect(denaturation?.explanationSteps.join(" ")).toContain("enzyme denatures");
    expect(denaturation?.explanationSteps.at(-1)).toMatch(/Result:/);
    expect(denaturation?.explanationSteps.join(" ")).not.toContain("Say the rule in your own words");
  });

  it("keeps mathematical notation intact while finding process boundaries", () => {
    const topic = allTopics(["aqa-alevel-maths"]).find((candidate) => candidate.id === "aqa-alevel-maths.differentiation");
    expect(topic).toBeDefined();
    const lesson = buildLesson(topic!)!;
    const firstPrinciples = lesson.steps.find((step) => step.body.startsWith("First principles"));
    expect(firstPrinciples?.explanationSteps.join(" ")).toContain("lim(h→0)");
    expect(firstPrinciples?.explanationSteps.join(" ")).not.toContain("lim(h.");

    const numerical = allTopics(["aqa-alevel-maths"]).find((candidate) => candidate.id === "aqa-alevel-maths.numerical");
    expect(numerical).toBeDefined();
    const numericalLesson = buildLesson(numerical!)!;
    const interval = numericalLesson.steps.find((step) => step.body.startsWith("A sign change"));
    expect(interval?.explanationSteps.join(" ")).toContain("[a, b]");
    expect(interval?.explanationSteps.join(" ")).not.toContain("Start: A sign.");
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
