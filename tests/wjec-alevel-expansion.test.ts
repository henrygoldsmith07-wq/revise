import { describe, expect, it } from "vitest";
import { seedQuestions, wjecAlevelExpansionQuestions } from "@/content";
import { buildLesson } from "@/content/lessons";
import { allTopics, topicsFor, unitsFor } from "@/domain/curriculum";

const subjectIds = [
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
  "wjec-alevel-physics",
  "wjec-alevel-maths",
] as const;

describe("WJEC A-level subject expansion", () => {
  it("adds the planned missing scope to every flagship subject", () => {
    const minimumTopicCounts = {
      "wjec-alevel-biology": 25,
      "wjec-alevel-chemistry": 23,
      "wjec-alevel-physics": 19,
      "wjec-alevel-maths": 23,
    } as const;

    for (const subjectId of subjectIds) {
      expect(topicsFor(subjectId), subjectId).toHaveLength(minimumTopicCounts[subjectId]);
      expect(unitsFor(subjectId).length, `${subjectId} should expose extension units`).toBeGreaterThan(2);
    }
  });

  it("keeps each expansion topic teachable, spec-linked and retrieval-ready", () => {
    const expansionIds = new Set(
      wjecAlevelExpansionQuestions.flatMap((question) => question.topicIds),
    );
    const expansionTopics = allTopics().filter((topic) => expansionIds.has(topic.id));

    expect(expansionTopics.length).toBeGreaterThanOrEqual(35);
    for (const topic of expansionTopics) {
      expect(topic.source, topic.id).toBe("authored");
      expect(topic.verification, topic.id).toBe("checked");
      expect(topic.specRef, topic.id).toMatch(/^(Unit|Pure|Applied)/);
      expect(topic.keyPoints.length, topic.id).toBeGreaterThanOrEqual(4);
      expect(topic.commonErrors.length, topic.id).toBeGreaterThanOrEqual(3);
      expect(topic.specPoints?.length, topic.id).toBeGreaterThanOrEqual(4);
      expect(topic.specPoints?.every((point) => point.verification === "checked"), topic.id).toBe(true);

      const lesson = buildLesson(topic);
      expect(lesson, topic.id).not.toBeNull();
      expect(lesson!.steps.filter((step) => step.kind === "core")).toHaveLength(topic.keyPoints.length);
      expect(lesson!.steps.filter((step) => step.kind === "core").every((step) =>
        step.explanationSteps.length >= 2 && Boolean(step.application?.modelAnswer.length),
      ), topic.id).toBe(true);
    }
  });

  it("maps every new specification statement to an authored exam question part", () => {
    const expansionTopics = allTopics().filter((topic) =>
      topic.id.startsWith("wjec-alevel-") &&
      ["nutrition", "microbiology", "nervous-coordination", "sexual-reproduction", "plant-reproduction", "genetic-applications", "immunity-disease", "musculoskeletal", "neurobiology-behaviour", "human-impact", "practical-skills", "entropy-feasibility", "p-block", "stereoisomerism", "amino-acids-proteins", "organic-synthesis", "practical-analysis", "organic-mechanisms", "electrochemical-cells", "capacitance", "alternating-currents", "medical-physics", "sports-physics", "energy-environment", "practical-investigations", "orbits-universe", "electromagnetic-induction", "poisson-uniform", "inference-errors", "continuous-distributions", "correlation-tests", "modelling-assumptions", "moments-statics", "conditional-probability", "differential-equations-context"].some((slug) => topic.id.endsWith(`.${slug}`)),
    );
    const expected = new Set(expansionTopics.flatMap((topic) => topic.specPoints?.map((point) => point.id) ?? []));
    const covered = new Set(
      seedQuestions
        .filter((question) => question.id.includes("wjec-alevel-expansion-"))
        .flatMap((question) => [
          ...(question.specPointIds ?? []),
          ...question.parts.flatMap((part) => part.specPointIds ?? []),
        ]),
    );

    expect(expected.size).toBeGreaterThanOrEqual(140);
    expect([...expected].every((id) => covered.has(id))).toBe(true);
    for (const question of wjecAlevelExpansionQuestions) {
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.parts.every((part) =>
        (part.specPointIds?.length ?? 0) > 0 && (part.learningClaims?.length ?? 0) > 0,
      )).toBe(true);
    }
  });
});
