import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createCard } from "@/domain/scheduling";
import { computeRecallMastery } from "@/domain/recall-mastery";
import type { Card, ReviewLog, Topic } from "@/domain/types";

const NOW = new Date("2026-08-18T09:00:00.000Z");

function topic(id: string): Topic {
  return {
    id,
    subjectId: "physics",
    unitId: "unit-1",
    title: id,
    order: 0,
    intrinsicDifficulty: 3,
    summary: "summary",
    keyPoints: ["point"],
    commonErrors: ["error"],
  };
}

function card(topicId: string, id: string, overrides: Partial<Card> = {}): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "physics", topicId, front: "front", back: "back" }, NOW),
    ...overrides,
  };
}

function review(id: string, cardId: string, topicId: string, grade: ReviewLog["grade"]): ReviewLog {
  return {
    id,
    userId: "u",
    cardId,
    topicId,
    grade,
    elapsedMs: 1200,
    reviewedAt: NOW.toISOString(),
  };
}

describe("recall mastery", () => {
  it("keeps recall-only evidence separate from exam performance", () => {
    const rows = computeRecallMastery({
      topics: [topic("strong"), topic("unseen")],
      cards: [
        card("strong", "c1", { stability: 30, reps: 5, lastReviewedAt: NOW.toISOString(), due: "2026-09-18" }),
        card("unseen", "c2"),
      ],
      reviewLogs: [review("r1", "c1", "strong", "good"), review("r2", "c1", "strong", "easy")],
      now: NOW,
    });

    const strong = rows.find((row) => row.topicId === "strong")!;
    const unseen = rows.find((row) => row.topicId === "unseen")!;

    expect(strong.mastery).toBe(1);
    expect(strong.currentRetention).toBe(1);
    expect(strong.trueRetention).toBe(1);
    expect(strong.reviews).toBe(2);
    expect(strong.evidence).toBe("emerging");
    expect(unseen.mastery).toBe(0);
    expect(unseen.trueRetention).toBeNull();
    expect(unseen.evidence).toBe("unmeasured");
  });

  it("reports observed lapses, due pressure and reliable evidence", () => {
    const rows = computeRecallMastery({
      topics: [topic("topic")],
      cards: [
        card("topic", "c1", { stability: 10, reps: 3, lastReviewedAt: "2026-08-01T09:00:00.000Z", due: "2026-08-10" }),
        card("topic", "c2", { stability: 10, reps: 3, lastReviewedAt: "2026-08-01T09:00:00.000Z", due: "2026-08-10" }),
      ],
      reviewLogs: Array.from({ length: 20 }, (_, index) => review(`r-${index}`, index % 2 ? "c1" : "c2", "topic", index < 10 ? "again" : "good")),
      now: NOW,
    });

    expect(rows[0]).toMatchObject({
      cardsTotal: 2,
      cardsDue: 2,
      reviews: 20,
      recalled: 10,
      trueRetention: 0.5,
      evidence: "reliable",
    });
    expect(rows[0].mastery).toBeGreaterThan(0);
    expect(rows[0].mastery).toBeLessThan(1);
  });

  it("wires the Progress view to the recall metric", () => {
    const progress = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    const panels = readFileSync(join(process.cwd(), "src/components/AssessmentPanels.tsx"), "utf8");
    const store = readFileSync(join(process.cwd(), "src/state/store.tsx"), "utf8");

    expect(progress).toContain("RecallMasteryCard");
    expect(panels).toContain("Recall mastery");
    expect(panels).toContain("recallMastery");
    expect(store).toContain("computeRecallMastery");
  });
});
