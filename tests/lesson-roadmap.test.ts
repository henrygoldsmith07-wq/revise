import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allSubjects, allTopics, unitsFor } from "@/domain/curriculum";
import { buildLessons, buildRoadmapLessons } from "@/content/lessons";

const source = readFileSync(resolve(process.cwd(), "src/components/LessonMode.tsx"), "utf8");
// The recall/check gate lives in the extracted run state machine, so the
// roadmap assertions read the hook alongside the component.
const runnerSource = readFileSync(resolve(process.cwd(), "src/components/use-lesson-runner.ts"), "utf8");

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
        return total + (points.length || 1);
      }, 0);

      expect(entries.length, subject.id).toBe(expectedCount);
      for (const topic of topics) {
        const topicEntries = entries.filter((entry) => entry.topic.id === topic.id);
        const pointCount = topic.specPoints?.filter((point) => point.text.trim().length > 0).length || 1;
        expect(topicEntries, topic.id).toHaveLength(pointCount);
        topicEntries.forEach((entry, index) => {
          expect(entry.lesson.checkpointIndex, entry.lesson.id).toBe(index + 1);
          expect(entry.lesson.checkpointTotal, entry.lesson.id).toBe(pointCount);
          // A taught lesson is the idea, a worked example and an exam question
          // (plus the usual mistake where one is written); an outline keeps its
          // orientation step, so it has at least four.
          expect(entry.lesson.steps.length, entry.lesson.id).toBeGreaterThanOrEqual(entry.lesson.teachingReview ? 3 : 4);
          expect(entry.lesson.learningObjectives?.length, entry.lesson.id).toBeGreaterThan(0);
          expect(entry.lesson.estimatedMinutes, entry.lesson.id).toBeGreaterThanOrEqual(6);
          // Every core step makes the student do something: an application, or
          // the single task a taught lesson gives it.
          expect(
            entry.lesson.steps.filter((step) => step.kind === "core").every((step) => Boolean(step.application) || Boolean(step.task)),
            entry.lesson.id,
          ).toBe(true);
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
    // Units are labelled by their curriculum title, not "Unit <list position>":
    // some titles already name their exam unit ("Unit 4 options: …").
    expect(source).toContain("${unit.title} progress");
    expect(source).toContain("Step {unitIndex + 1}");
    expect(source).toContain("See detailed lesson outline");
    expect(source).toContain("What you will learn");
    expect(source).toContain("Recommended next");
    expect(source).toContain("What you should be able to do");
    expect(source).toContain("Reveal model answer");
    // The apply step's model-answer points are a comparison, not a self-mark:
    // ticking them proved nothing, so they are listed to compare against.
    expect(source).toContain("Compare your answer against each point");
    expect(source).not.toContain("Self-marking checklist");
    expect(source).toContain("Your success criteria");
    expect(source).toContain("How it works");
    expect(source).toContain("Follow in order");
    expect(source).toContain("Process steps");
  });

  it("a taught lesson teaches from its first screen and gives each step one task", () => {
    const taught = buildRoadmapLessons(allTopics(["wjec-alevel-physics"])).filter((entry) => entry.lesson.teachingReview);
    expect(taught.length).toBe(108);
    for (const { lesson } of taught) {
      // No orientation screen that only restates the specification point.
      expect(lesson.steps.some((step) => step.kind === "overview"), lesson.id).toBe(false);
      expect(lesson.steps.map((step) => step.task).slice(0, 3), lesson.id).toEqual(["check", "worked", "apply"]);
      const [idea, worked, apply, trap] = lesson.steps;
      // The idea is checked by a question, not by retyping text still on screen.
      expect(idea!.check, lesson.id).toBeDefined();
      expect(idea!.application, lesson.id).toBeUndefined();
      // The worked example has steps to reveal and an answer to end on.
      expect(worked!.explanationSteps.length, lesson.id).toBeGreaterThan(0);
      expect(worked!.workedAnswer?.trim(), lesson.id).toBeTruthy();
      // The exam question is answered before its model is shown.
      expect(apply!.application?.modelAnswer.trim(), lesson.id).toBeTruthy();
      expect(apply!.application?.successCriteria.length, lesson.id).toBeGreaterThan(0);
      // The usual mistake is a decision: neither option is printed above the question.
      if (trap) {
        expect(trap.task, lesson.id).toBe("check");
        for (const option of trap.check!.options) expect(`${trap.body} ${trap.explanationSteps.join(" ")}`, lesson.id).not.toContain(option);
      }
      // A title is a capitalised phrase cut at a word, never mid-word.
      expect(lesson.title, lesson.id).toMatch(/^[A-Z0-9(]/);
      if (lesson.title.endsWith("…")) expect(lesson.focus.toLowerCase(), lesson.id).toContain(`${lesson.title.slice(0, -1).toLowerCase()} `);
      expect(lesson.recap?.[0], lesson.id).toBe(idea!.body);
      expect(lesson.specPointId, lesson.id).toBeTruthy();
    }
  });

  it("the lesson player renders the single task and hands on to a question", () => {
    expect(source).toContain('step.task === "worked" ? (');
    expect(source).toContain("<WorkedSteps worked={{ prompt: step.body, steps: step.explanationSteps, answer: step.workedAnswer ?? \"\" }} onDone={completeTask} />");
    expect(source).toContain("{step.task ? null : (");
    expect(source).toContain('aria-label="Your answer to the exam question"');
    expect(source).toContain("lessonPracticeHref(lesson.topicId, lesson.specPointId)");
    expect(source).toContain('data-testid="lesson-practice-handoff"');
    expect(source).toContain("Practice, not proof.");
  });

  it("makes retrieval the gate before a model takeaway or next step", () => {
    // The gate itself lives in the extracted state machine: progress requires
    // a non-empty recall draft, and the check answer only counts once the
    // recall has been revealed.
    expect(runnerSource).toContain('const recallDone = !step?.id || step.task === "check" || Boolean(recallRevealed[step.id]);');
    expect(runnerSource).toContain("const checkAnswered = recallDone && (!hasCheck || chosen !== undefined);");
    expect(runnerSource).toContain("if (!step?.id || !recallDraft[step.id]?.trim()) return;");
    expect(source).toContain("Your active recall answer");
    expect(source).toContain("Show model answer");
    expect(source).toContain("Retrieve the idea first");
    expect(source).toContain("mode=recall");
  });
});
