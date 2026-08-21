import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedCards, seedQuestions, contentCardSchema, contentQuestionSchema, contentTopicSchema } from "@/content";

describe("authored content schemas", () => {
  it("accepts every seeded topic and reports no malformed curriculum records", () => {
    for (const topic of allTopics()) {
      const result = contentTopicSchema.safeParse(topic);
      expect(result.success, result.success ? topic.id : `${topic.id}: ${result.error.message}`).toBe(true);
    }
  });

  it("accepts every seeded question, including MCQ invariants", () => {
    for (const question of seedQuestions) {
      const result = contentQuestionSchema.safeParse(question);
      expect(result.success, result.success ? question.id : `${question.id}: ${result.error.message}`).toBe(true);
    }
  });

  it("accepts the cards generated from the full curriculum", () => {
    const cards = seedCards(allTopics(), "schema-test");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const result = contentCardSchema.safeParse(card);
      expect(result.success, result.success ? card.id : `${card.id}: ${result.error.message}`).toBe(true);
    }
  });

  it("rejects a question whose allocated marks drift from its parts", () => {
    const question = seedQuestions[0];
    expect(question).toBeDefined();
    const result = contentQuestionSchema.safeParse({ ...question, totalMarks: question.totalMarks + 1 });
    expect(result.success).toBe(false);
  });
});
