import { describe, expect, it } from "vitest";
import { dataExpansionQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";
import { AUTHORED_REFERENCE_SUBJECTS } from "@/domain/curriculum/honesty";
import { wjecAlevelCoverageQuestions } from "@/content/questions/wjec-alevel-coverage";

// The expansion programmes cover the 32 science and maths subjects. Subjects
// added later with their own authored outline (AUTHORED_REFERENCE_SUBJECTS)
// ship their own starter bank instead; tests/new-subjects.test.ts covers them.
const ALL_SUBJECTS = allSubjects().filter((subject) => !AUTHORED_REFERENCE_SUBJECTS.has(subject.id));
// WJEC Maths/Biology/Chemistry extension topics were "covered" by one shared
// template that failed its own marker (wjec-alevel-coverage.ts); it left the
// learner bank on 2026-10-18. Those topics are honestly uncovered until real
// items are authored, so they are exempt here — never reinstate the template.
const TEMPLATED_TOPICS = new Set(
  wjecAlevelCoverageQuestions({ id: "data", prefix: "Data:", reviewer: "x", kind: "structured" }).flatMap((q) => q.topicIds),
);

describe("data-question expansion", () => {
  it("adds one data question for every topic across all board and qualification subjects", () => {
    expect(ALL_SUBJECTS).toHaveLength(32);
    // Physics extension topics are covered by authored physics-coverage items
    // instead of the shared template, so they are excluded here (8 topics).
    expect(dataExpansionQuestions).toHaveLength(467 - TEMPLATED_TOPICS.size);
    expect(dataExpansionQuestions.some((question) => question.id.includes("-coverage-"))).toBe(false);

    for (const subject of ALL_SUBJECTS) {
      const questions = dataExpansionQuestions.filter((question) => question.subjectId === subject.id);
      const expected = subject.id === "wjec-alevel-physics"
        ? topicsFor(subject.id).length - 8
        : topicsFor(subject.id).filter((topic) => !TEMPLATED_TOPICS.has(topic.id)).length;
      expect(questions, `${subject.id} should receive one data question per topic`).toHaveLength(expected);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

      for (const topic of topicsFor(subject.id)) {
        if (subject.id === "wjec-alevel-physics" && !questions.some((question) => question.topicIds.includes(topic.id))) continue;
        if (TEMPLATED_TOPICS.has(topic.id)) continue;
        expect(
          questions.some((question) => question.topicIds.includes(topic.id)),
          `${subject.id} topic ${topic.id} has no data question`,
        ).toBe(true);
      }
    }

    expect(seedQuestions.length).toBeGreaterThanOrEqual(1000);
  });

  it("keeps data questions checked, markable and linked to their curriculum", () => {
    for (const question of dataExpansionQuestions) {
      expect(question.stem).toContain("Data:");
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.reviewer).toBe("authored/data-question-expansion-review");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.parts.length).toBeGreaterThan(0);
      expect(question.specPointIds?.length).toBeGreaterThan(0);

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(
          question.specPointIds?.some((specPointId) => topic!.specPoints?.some((point) => point.id === specPointId)),
          `${question.id} has no matching spec point for ${topicId}`,
        ).toBe(true);
      }

      for (const part of question.parts) {
        expect(part.markScheme.length).toBeGreaterThan(0);
        expect(part.modelAnswer.length).toBeGreaterThan(10);
        expect(part.learningClaims?.length).toBeGreaterThan(0);
        expect(part.aos?.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes varied data-response formats", () => {
    expect(dataExpansionQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(dataExpansionQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(dataExpansionQuestions.some((question) => question.kind === "extended")).toBe(true);
    expect(dataExpansionQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
