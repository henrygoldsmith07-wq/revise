import { describe, expect, it } from "vitest";
import { gcseExpansionQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";

const GCSE_SUBJECTS = allSubjects().filter((subject) => subject.qualificationId.endsWith("-gcse"));

describe("GCSE question expansion", () => {
  it("adds one original question for every GCSE topic across every supported board", () => {
    expect(GCSE_SUBJECTS).toHaveLength(16);
    expect(gcseExpansionQuestions).toHaveLength(220);

    for (const subject of GCSE_SUBJECTS) {
      const questions = gcseExpansionQuestions.filter((question) => question.subjectId === subject.id);
      expect(questions, `${subject.id} should receive one question per topic`).toHaveLength(topicsFor(subject.id).length);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

      for (const topic of topicsFor(subject.id)) {
        expect(
          questions.some((question) => question.topicIds.includes(topic.id)),
          `${subject.id} topic ${topic.id} has no GCSE question`,
        ).toBe(true);
      }
    }

    expect(seedQuestions.length).toBeGreaterThanOrEqual(500);
  });

  it("keeps every GCSE question checked, markable and mapped to its curriculum", () => {
    for (const question of gcseExpansionQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.aos?.length).toBeGreaterThan(0);
      expect(question.parts.length).toBeGreaterThan(0);
      expect(question.specPointIds?.length).toBeGreaterThan(0);

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(
          question.specPointIds?.some((specPointId) => topic!.specPoints?.some((point) => point.id === specPointId)),
          `${question.id} has no spec point belonging to ${topicId}`,
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

  it("includes recall, calculation and extended-response practice", () => {
    expect(gcseExpansionQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(gcseExpansionQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(gcseExpansionQuestions.some((question) => question.kind === "extended")).toBe(true);
    expect(gcseExpansionQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
