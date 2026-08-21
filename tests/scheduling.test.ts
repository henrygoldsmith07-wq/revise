import { describe, expect, it } from "vitest";
import {
  buildReviewQueue,
  createCard,
  dueCountByDay,
  gradeCard,
  isDue,
  isMastered,
  previewIntervals,
  reinsert,
  retrievability,
} from "@/domain/scheduling";
import type { Card } from "@/domain/types";

const NOW = new Date("2025-06-01T09:00:00.000Z");

function card(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard(
      { id: "c1", userId: "u", subjectId: "s", topicId: "t", front: "front", back: "back" },
      NOW,
    ),
    ...overrides,
  };
}

describe("createCard", () => {
  it("starts new cards due immediately so a fresh deck is usable", () => {
    expect(isDue(card(), "2025-06-01")).toBe(true);
  });
});

describe("gradeCard", () => {
  it("pushes 'easy' further out than 'good', and 'again' back to the front", () => {
    const base = gradeCard(card(), "good", NOW);
    const later = new Date(`${base.due}T09:00:00.000Z`);
    const good = gradeCard(base, "good", later);
    const easy = gradeCard(base, "easy", later);
    const again = gradeCard(base, "again", later);

    expect(easy.due > good.due).toBe(true);
    expect(again.due < good.due).toBe(true);
  });

  it("counts a lapse when a learned card is forgotten", () => {
    const learned = gradeCard(gradeCard(card(), "good", NOW), "good", new Date("2025-06-05T09:00:00Z"));
    const lapsed = gradeCard(learned, "again", new Date("2025-06-20T09:00:00Z"));
    expect(lapsed.lapses).toBe(learned.lapses + 1);
  });

  it("never mutates the card it is given", () => {
    const original = card();
    const snapshot = JSON.stringify(original);
    gradeCard(original, "easy", NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("previewIntervals", () => {
  it("orders the four buttons monotonically", () => {
    const intervals = previewIntervals(card(), NOW);
    expect(intervals.again).toBeLessThanOrEqual(intervals.hard);
    expect(intervals.hard).toBeLessThanOrEqual(intervals.good);
    expect(intervals.good).toBeLessThanOrEqual(intervals.easy);
  });
});

describe("retrievability", () => {
  it("decays toward zero as the interval outruns stability", () => {
    const reviewed = card({ stability: 10, lastReviewedAt: "2025-06-01T09:00:00.000Z" });
    const sameDay = retrievability(reviewed, new Date("2025-06-01T10:00:00Z"));
    const tenDays = retrievability(reviewed, new Date("2025-06-11T09:00:00Z"));
    const hundredDays = retrievability(reviewed, new Date("2025-09-09T09:00:00Z"));

    expect(sameDay).toBeGreaterThan(tenDays);
    expect(tenDays).toBeGreaterThan(hundredDays);
    // At exactly one stability period, FSRS targets ~90% recall.
    expect(tenDays).toBeGreaterThan(0.85);
    expect(tenDays).toBeLessThan(0.95);
  });

  it("reports zero for a card that has never been reviewed", () => {
    expect(retrievability(card(), NOW)).toBe(0);
  });
});

describe("buildReviewQueue", () => {
  it("puts the most overdue cards first", () => {
    const cards = [
      card({ id: "a", due: "2025-05-30", state: 2, lastReviewedAt: "2025-05-20T09:00:00Z" }),
      card({ id: "b", due: "2025-05-20", state: 2, lastReviewedAt: "2025-05-10T09:00:00Z" }),
      card({ id: "c", due: "2025-06-01", state: 2, lastReviewedAt: "2025-05-25T09:00:00Z" }),
    ];
    const queue = buildReviewQueue(cards, 10, "2025-06-01");
    expect(queue.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("excludes cards that are not yet due and respects the limit", () => {
    const cards = [
      card({ id: "due", due: "2025-06-01", state: 2 }),
      card({ id: "future", due: "2025-06-10", state: 2 }),
    ];
    expect(buildReviewQueue(cards, 10, "2025-06-01").map((c) => c.id)).toEqual(["due"]);
    expect(buildReviewQueue(cards, 0, "2025-06-01")).toHaveLength(0);
  });

  it("skips suspended cards entirely", () => {
    const cards = [card({ id: "s", due: "2025-05-01", state: 2, suspended: true })];
    expect(buildReviewQueue(cards, 10, "2025-06-01")).toHaveLength(0);
  });

  it("interleaves new cards rather than front-loading them", () => {
    const due = Array.from({ length: 8 }, (_, i) => card({ id: `d${i}`, due: "2025-05-25", state: 2 }));
    const fresh = Array.from({ length: 2 }, (_, i) => card({ id: `n${i}`, state: 0 }));
    const queue = buildReviewQueue([...fresh, ...due], 20, "2025-06-01");
    expect(queue[0].state).toBe(2);
    expect(queue.filter((c) => c.state === 0)).toHaveLength(2);
  });
});

describe("reinsert", () => {
  it("brings a failed card back later in the same session", () => {
    const queue = ["a", "b", "c", "d", "e", "f"];
    expect(reinsert(queue, "x", 3)).toEqual(["a", "b", "c", "x", "d", "e", "f"]);
  });

  it("appends when the queue is shorter than the gap", () => {
    expect(reinsert(["a"], "x", 4)).toEqual(["a", "x"]);
  });
});

describe("isMastered and dueCountByDay", () => {
  it("treats three weeks of stability as mastered", () => {
    expect(isMastered(card({ stability: 20 }))).toBe(false);
    expect(isMastered(card({ stability: 22 }))).toBe(true);
  });

  it("rolls every overdue card into the first forecast day", () => {
    const cards = [
      card({ id: "a", due: "2025-05-01" }),
      card({ id: "b", due: "2025-06-01" }),
      card({ id: "c", due: "2025-06-03" }),
    ];
    const forecast = dueCountByDay(cards, 3, "2025-06-01");
    expect(forecast[0]).toEqual({ date: "2025-06-01", count: 2 });
    expect(forecast[1]).toEqual({ date: "2025-06-02", count: 0 });
    expect(forecast[2]).toEqual({ date: "2025-06-03", count: 1 });
  });
});
