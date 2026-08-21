import { describe, expect, it } from "vitest";
import { edexcelExpansionQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";

const EDEXCEL_A_LEVEL_SUBJECTS = allSubjects().filter((subject) => subject.qualificationId === "edexcel-alevel");

describe("Edexcel A-level content expansion", () => {
  it("adds one original question for every Edexcel A-level topic", () => {
    expect(EDEXCEL_A_LEVEL_SUBJECTS).toHaveLength(4);
    expect(edexcelExpansionQuestions).toHaveLength(55);

    for (const subject of EDEXCEL_A_LEVEL_SUBJECTS) {
      const questions = edexcelExpansionQuestions.filter((question) => question.subjectId === subject.id);
      expect(questions, `${subject.id} should receive one question per topic`).toHaveLength(topicsFor(subject.id).length);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

      for (const topic of topicsFor(subject.id)) {
        expect(
          questions.some((question) => question.topicIds.includes(topic.id)),
          `${subject.id} topic ${topic.id} has no Edexcel question`,
        ).toBe(true);
      }
    }

    expect(seedQuestions.length).toBeGreaterThanOrEqual(570);
  });

  it("keeps Edexcel questions checked, markable and mapped to Edexcel specification points", () => {
    for (const question of edexcelExpansionQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.reviewer).toBe("authored/edexcel-expansion-review");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.parts.length).toBeGreaterThan(0);
      expect(question.specPointIds?.length).toBeGreaterThan(0);

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(
          question.specPointIds?.some((specPointId) => topic!.specPoints?.some((point) => point.id === specPointId)),
          `${question.id} has no Edexcel spec point belonging to ${topicId}`,
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

  it("includes mixed Edexcel exam formats", () => {
    expect(edexcelExpansionQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(edexcelExpansionQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(edexcelExpansionQuestions.some((question) => question.kind === "extended")).toBe(true);
    expect(edexcelExpansionQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
