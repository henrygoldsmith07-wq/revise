import { describe, expect, it } from "vitest";
import { authenticSourceQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";

const ALL_SUBJECTS = allSubjects();

describe("authentic source-material expansion", () => {
  it("adds one source-stimulus question for every topic across all board and qualification subjects", () => {
    expect(ALL_SUBJECTS).toHaveLength(32);
    expect(authenticSourceQuestions).toHaveLength(440);

    for (const subject of ALL_SUBJECTS) {
      const questions = authenticSourceQuestions.filter((question) => question.subjectId === subject.id);
      expect(questions, `${subject.id} should receive one source question per topic`).toHaveLength(topicsFor(subject.id).length);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

      for (const topic of topicsFor(subject.id)) {
        expect(
          questions.some((question) => question.topicIds.includes(topic.id)),
          `${subject.id} topic ${topic.id} has no source-stimulus question`,
        ).toBe(true);
      }
    }

    expect(seedQuestions.length).toBeGreaterThanOrEqual(1800);
  });

  it("keeps source-stimulus questions authored, checked, markable and curriculum-linked", () => {
    for (const question of authenticSourceQuestions) {
      expect(question.stem).toContain("Source extract:");
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.reviewer).toBe("authored/authentic-source-review");
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

  it("includes varied source-response formats", () => {
    expect(authenticSourceQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(authenticSourceQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(authenticSourceQuestions.some((question) => question.kind === "extended")).toBe(true);
    expect(authenticSourceQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
