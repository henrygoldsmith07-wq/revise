import { describe, expect, it } from "vitest";
import { dataExpansionQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";

const ALL_SUBJECTS = allSubjects();

describe("data-question expansion", () => {
  it("adds one data question for every topic across all board and qualification subjects", () => {
    expect(ALL_SUBJECTS).toHaveLength(32);
    expect(dataExpansionQuestions).toHaveLength(440);

    for (const subject of ALL_SUBJECTS) {
      const questions = dataExpansionQuestions.filter((question) => question.subjectId === subject.id);
      expect(questions, `${subject.id} should receive one data question per topic`).toHaveLength(topicsFor(subject.id).length);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

      for (const topic of topicsFor(subject.id)) {
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
