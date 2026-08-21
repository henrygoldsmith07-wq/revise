import { describe, expect, it } from "vitest";
import { aqaGcseSynopticQuestions, seedQuestionsForSubject } from "@/content";
import { getTopic } from "@/domain/curriculum";

const AQA_GCSE_SUBJECTS = [
  "aqa-gcse-biology",
  "aqa-gcse-chemistry",
  "aqa-gcse-maths",
  "aqa-gcse-physics",
];

describe("AQA GCSE synoptic question bank", () => {
  it("adds four multi-topic questions to each AQA GCSE subject", () => {
    expect(aqaGcseSynopticQuestions).toHaveLength(16);

    for (const subjectId of AQA_GCSE_SUBJECTS) {
      const questions = aqaGcseSynopticQuestions.filter((question) => question.subjectId === subjectId);
      expect(questions, `${subjectId} should have four synoptic questions`).toHaveLength(4);
      expect(questions.every((question) => question.topicIds.length >= 2)).toBe(true);
      expect(seedQuestionsForSubject(subjectId)).toEqual(expect.arrayContaining(questions));
    }
  });

  it("maps every synoptic topic and spec point to the same subject", () => {
    for (const question of aqaGcseSynopticQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.topicIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(question.topicIds).size).toBe(question.topicIds.length);

      const mappedTopicIds = new Set(
        (question.specPointIds ?? []).map((specPointId) => specPointId.replace(/\.sp-\d+$/, "")),
      );
      expect(mappedTopicIds).toEqual(new Set(question.topicIds));

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(topic!.subjectId).toBe(question.subjectId);
      }

      for (const specPointId of question.specPointIds ?? []) {
        expect(
          question.topicIds.some((topicId) => getTopic(topicId)?.specPoints?.some((point) => point.id === specPointId)),
          `${question.id} points at unknown or cross-topic spec point ${specPointId}`,
        ).toBe(true);
      }
    }
  });

  it("keeps synoptic parts markable and claim-aligned", () => {
    for (const question of aqaGcseSynopticQuestions) {
      expect(question.parts.length).toBeGreaterThan(1);
      expect(question.totalMarks).toBe(question.parts.reduce((total, part) => total + part.marks, 0));
      for (const part of question.parts) {
        expect(part.markScheme.length).toBeGreaterThan(0);
        expect(part.modelAnswer.length).toBeGreaterThan(10);
        expect(part.learningClaims).toHaveLength(part.markScheme.length);
        expect(part.specPointIds?.length).toBeGreaterThan(0);
      }
    }
  });
});
