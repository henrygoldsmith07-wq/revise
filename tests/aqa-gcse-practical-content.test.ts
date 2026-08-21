import { describe, expect, it } from "vitest";
import { aqaGcsePracticalQuestions, seedQuestionsForSubject } from "@/content";
import { getTopic } from "@/domain/curriculum";

const AQA_GCSE_SUBJECTS = [
  "aqa-gcse-biology",
  "aqa-gcse-chemistry",
  "aqa-gcse-maths",
  "aqa-gcse-physics",
];

describe("AQA GCSE practical question bank", () => {
  it("adds four practical questions to each AQA GCSE subject", () => {
    expect(aqaGcsePracticalQuestions).toHaveLength(16);

    for (const subjectId of AQA_GCSE_SUBJECTS) {
      const questions = aqaGcsePracticalQuestions.filter((question) => question.subjectId === subjectId);
      expect(questions, `${subjectId} should have four practical questions`).toHaveLength(4);
      expect(new Set(questions.flatMap((question) => question.topicIds)).size).toBe(4);
      expect(seedQuestionsForSubject(subjectId)).toEqual(expect.arrayContaining(questions));
    }
  });

  it("keeps practical questions markable, provenance-linked and spec-linked", () => {
    for (const question of aqaGcsePracticalQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.stem).toMatch(/student|investigat|experiment|sample|inspect|measure/i);
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
        expect(part.learningClaims).toHaveLength(part.markScheme.length);
      }
    }
  });

  it("covers methods, data handling and evaluation rather than recall alone", () => {
    expect(aqaGcsePracticalQuestions.some((question) => question.aos?.includes("AO3"))).toBe(true);
    expect(aqaGcsePracticalQuestions.some((question) => question.parts.some((part) => /method|describe|improvement|reliable|control/i.test(part.prompt)))).toBe(true);
    expect(aqaGcsePracticalQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(aqaGcsePracticalQuestions.some((question) => question.kind === "structured")).toBe(true);
  });
});
