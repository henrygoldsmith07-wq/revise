import { describe, expect, it } from "vitest";
import { aqaGcseQuestions, seedQuestionsForSubject } from "@/content";
import { getTopic } from "@/domain/curriculum";

const AQA_GCSE_SUBJECTS = [
  "aqa-gcse-biology",
  "aqa-gcse-chemistry",
  "aqa-gcse-maths",
  "aqa-gcse-physics",
];

describe("AQA GCSE authored question bank", () => {
  it("adds six questions to each AQA GCSE subject", () => {
    expect(aqaGcseQuestions).toHaveLength(24);

    for (const subjectId of AQA_GCSE_SUBJECTS) {
      const questions = aqaGcseQuestions.filter((question) => question.subjectId === subjectId);
      expect(questions, `${subjectId} should have six AQA GCSE questions`).toHaveLength(6);
      expect(new Set(questions.flatMap((question) => question.topicIds)).size).toBe(6);
      expect(seedQuestionsForSubject(subjectId)).toEqual(expect.arrayContaining(questions));
    }
  });

  it("keeps every question markable and linked to a known AQA GCSE spec point", () => {
    for (const question of aqaGcseQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.parts.length).toBeGreaterThan(0);
      expect(question.totalMarks).toBe(question.parts.reduce((total, part) => total + part.marks, 0));

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(
          question.specPointIds?.some((specPointId) => topic!.specPoints?.some((point) => point.id === specPointId)),
          `${question.id} is not linked to a spec point in ${topicId}`,
        ).toBe(true);
      }

      for (const part of question.parts) {
        expect(part.markScheme.length).toBeGreaterThan(0);
        expect(part.modelAnswer.length).toBeGreaterThan(10);
        expect(part.learningClaims?.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers mixed AQA GCSE question formats", () => {
    expect(aqaGcseQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(aqaGcseQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(aqaGcseQuestions.some((question) => question.kind === "structured")).toBe(true);
    expect(aqaGcseQuestions.some((question) => question.kind === "extended")).toBe(true);
  });
});
