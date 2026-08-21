import { describe, expect, it } from "vitest";
import { compareSchedulers, schedulerMetrics } from "@/domain/scheduler-validation";
import { createCard } from "@/domain/scheduling";
import type { Card, ReviewLog } from "@/domain/types";

function card(id: string, topicId: string, due: string, stability = 10): Card {
  const c = createCard({ id, userId: "u", subjectId: "subj", topicId, front: "f", back: "b" }, new Date("2025-05-01T00:00:00.000Z"));
  return { ...c, due, stability, reps: 5, lastReviewedAt: "2025-05-01T00:00:00.000Z" };
}
function log(cardId: string, grade: ReviewLog["grade"], reviewedAt: string): ReviewLog {
  return { id: `l-${cardId}-${reviewedAt}`, userId: "u", cardId, topicId: "t1", grade, elapsedMs: 1200, reviewedAt };
}

describe("scheduler validation", () => {
  it("compares revise vs baselines and reports retention at 7/14/30d, reviews, minutes, etc.", () => {
    const cards = [card("c1", "t1", "2025-05-10"), card("c2", "t1", "2025-05-12")];
    const logs: ReviewLog[] = [];
    for (let i = 0; i < 25; i++) {
      const d = new Date(Date.now() - (30 - i) * 86400000).toISOString();
      logs.push(log("c1", i % 10 === 0 ? "again" : "good", d));
    }
    const comp = compareSchedulers({ cards, reviewLogs: logs, windowStart: "2025-05-01" });
    expect(comp.revise.retentionAt).toHaveLength(3);
    expect(comp.revise.retentionAt[0].days).toBe(7);
    expect(comp.revise.retentionAt[2].days).toBe(30);
    expect(comp.baselines).toHaveLength(3);
    expect(comp.baselines.some((b) => b.schedulerId === "fixed-interval-7d")).toBe(true);
    expect(comp.revise.totalReviews).toBe(25);
    expect(comp.revise.totalMinutes).toBeGreaterThan(0);
    // Not insufficient with 25 reviews
    expect(comp.insufficientData).toBe(false);
  });

  it("reports INSUFFICIENT REAL-WORLD DATA when longitudinal data missing", () => {
    const comp = compareSchedulers({ cards: [], reviewLogs: [], windowStart: "2025-05-01" });
    expect(comp.insufficientData).toBe(true);
    expect(comp.insufficientReason).toContain("INSUFFICIENT REAL-WORLD DATA");
    expect(comp.winner).toBeNull();
  });

  it("schedulerMetrics returns narrative and measurable retention when enough reviews", () => {
    const cards = [card("c1", "t1", "2025-05-10")];
    const logs: ReviewLog[] = Array.from({ length: 10 }, (_, i) => log("c1", "good", new Date(Date.now() - (10 - i) * 86400000).toISOString()));
    const m = schedulerMetrics({ cards, reviewLogs: logs, schedulerId: "revise-fsrs", windowStart: "2025-05-01" });
    expect(m.narrative).toBeDefined();
    expect(m.retentionAt.length).toBe(3);
  });
});
