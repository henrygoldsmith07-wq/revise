import { describe, expect, it } from "vitest";
import { authenticExpansionQuestions, seedQuestions } from "@/content";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";

const CORE_A_LEVEL_SUBJECTS = allSubjects().filter(
  (subject) => subject.id.startsWith("wjec-alevel") || subject.id.startsWith("aqa-alevel"),
);

describe("massive authentic question expansion", () => {
  it("adds a full 24-question exam-style set to every supported A-level subject", () => {
    expect(authenticExpansionQuestions).toHaveLength(192);

    for (const subject of CORE_A_LEVEL_SUBJECTS) {
      const questions = authenticExpansionQuestions.filter((question) => question.subjectId === subject.id);
      expect(questions, `${subject.id} should receive 24 expansion questions`).toHaveLength(24);
      expect(new Set(questions.map((question) => question.id)).size).toBe(24);
    }

    expect(seedQuestions.length).toBeGreaterThanOrEqual(300);
  });

  it("gives every topic a fresh authored question for both boards", () => {
    for (const subject of CORE_A_LEVEL_SUBJECTS) {
      const questions = authenticExpansionQuestions.filter((question) => question.subjectId === subject.id);
      for (const topic of topicsFor(subject.id)) {
        expect(
          questions.some((question) => question.topicIds.includes(topic.id)),
          `${subject.id} topic ${topic.id} has no expansion question`,
        ).toBe(true);
      }
    }
  });

  it("keeps every expanded question original, markable and provenance-linked", () => {
    for (const question of authenticExpansionQuestions) {
      expect(question.origin).toBe("seed");
      expect(question.source).toBe("authored");
      expect(question.verification).toBe("checked");
      expect(question.specVersion).toBe("2024-1.0");
      expect(question.aos?.length).toBeGreaterThan(0);
      expect(question.parts.length).toBeGreaterThan(0);

      const mappedSpecPointIds = new Set([
        ...(question.specPointIds ?? []),
        ...question.parts.flatMap((part) => part.specPointIds ?? []),
      ]);
      expect(mappedSpecPointIds.size).toBeGreaterThan(0);

      for (const topicId of question.topicIds) {
        const topic = getTopic(topicId);
        expect(topic, `${question.id} points at unknown topic ${topicId}`).toBeDefined();
        expect(
          [...mappedSpecPointIds].some((specPointId) => topic!.specPoints?.some((point) => point.id === specPointId)),
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

  it("includes a deliberate mix of recall, calculation and extended-response formats", () => {
    expect(authenticExpansionQuestions.some((question) => question.kind === "mcq")).toBe(true);
    expect(authenticExpansionQuestions.some((question) => question.kind === "calculation")).toBe(true);
    expect(authenticExpansionQuestions.some((question) => question.kind === "extended")).toBe(true);
    expect(authenticExpansionQuestions.some((question) => question.parts.length > 1)).toBe(true);
  });
});
