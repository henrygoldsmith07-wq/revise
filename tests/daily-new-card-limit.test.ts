import { describe, expect, it } from "vitest";
import { buildDailySessionPlan } from "@/domain/daily-session";
import { localDayOfInstant } from "@/domain/local-date";
import {
  buildReviewQueue,
  createCard,
  DEFAULT_NEW_CARDS_PER_DAY,
  firstStudiedOn,
  gradeCard,
  newCardsLeftToday,
  newCardsPerDay,
} from "@/domain/scheduling";
import type { Card } from "@/domain/types";

// Anki's daily new-card limit. A session took up to a quarter of its queue as
// new cards, but nothing bounded a day: five sessions in one evening started
// five sessions' worth, and their first reviews all fell due together.

const MORNING = new Date("2026-11-06T09:00:00.000Z");
const TODAY = localDayOfInstant(MORNING.toISOString());
let stamp = 0;

function fresh(id: string): Card {
  return createCard({ id, userId: "u", subjectId: "s", topicId: "t", front: id, back: "b" }, new Date("2026-10-01T09:00:00Z"));
}

function study(card: Card, at: Date, deviceId = "phone"): Card {
  return gradeCard(card, "good", at, { deviceId, lamport: ++stamp });
}

describe("the daily new-card limit", () => {
  it("defaults to 20 and ignores a missing or nonsensical setting", () => {
    expect(newCardsPerDay(undefined)).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    expect(newCardsPerDay(-3)).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    expect(newCardsPerDay(2.5)).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    expect(newCardsPerDay(10)).toBe(10);
    expect(newCardsPerDay(0)).toBe(0);
  });

  it("knows a card was first studied today from its grade log, on any device", () => {
    const card = fresh("a");
    expect(firstStudiedOn(card, TODAY)).toBe(false);
    const once = study(card, MORNING, "laptop");
    expect(firstStudiedOn(once, TODAY)).toBe(true);
    // A second review the same day does not make it any less new today.
    expect(firstStudiedOn(study(once, new Date(MORNING.getTime() + 3_600_000)), TODAY)).toBe(true);
  });

  it("does not count a card first studied on an earlier day", () => {
    const yesterday = study(fresh("b"), new Date(MORNING.getTime() - 86_400_000));
    expect(firstStudiedOn(study(yesterday, MORNING), TODAY)).toBe(false);
  });

  it("does not count a card that was already studied before its log began", () => {
    // Graded before sync logging (no stamp), then reviewed with logging today.
    const unlogged = gradeCard(fresh("c"), "good", new Date("2026-10-20T09:00:00Z"));
    expect(unlogged.log ?? []).toHaveLength(0);
    expect(firstStudiedOn(study(unlogged, MORNING), TODAY)).toBe(false);
  });

  it("counts an unlogged card only when its one review was today", () => {
    const unlogged = gradeCard(fresh("d"), "good", MORNING);
    expect(firstStudiedOn(unlogged, TODAY)).toBe(true);
    expect(firstStudiedOn(gradeCard(unlogged, "good", MORNING), TODAY)).toBe(false);
  });

  it("caps the new cards a session takes at what today has left", () => {
    const due = Array.from({ length: 30 }, (_, i) => ({ ...fresh(`due-${i}`), state: 2, reps: 3, due: TODAY }));
    const news = Array.from({ length: 30 }, (_, i) => fresh(`new-${i}`));
    const pick = (allowance?: number) =>
      buildReviewQueue([...due, ...news], 40, TODAY, allowance).filter((card) => card.state === 0).length;
    expect(pick()).toBe(10); // the session's quarter, as before
    expect(pick(3)).toBe(3);
    expect(pick(0)).toBe(0);
  });

  it("keeps five sessions in one evening to the day's limit", () => {
    let cards = Array.from({ length: 200 }, (_, i) => fresh(`n${i}`));
    let started = 0;
    for (let session = 0; session < 5; session++) {
      const at = new Date(MORNING.getTime() + session * 1_800_000);
      const queue = buildReviewQueue(cards, 60, TODAY, newCardsLeftToday(cards, 20, TODAY));
      const ids = new Set(queue.filter((card) => card.state === 0).map((card) => card.id));
      started += ids.size;
      cards = cards.map((card) => (ids.has(card.id) ? study(card, at) : card));
    }
    // Without the limit each 60-card session would take 15: 75 in an evening.
    expect(started).toBe(20);
    expect(newCardsLeftToday(cards, 20, TODAY)).toBe(0);
  });

  it("makes the Today session's queue split honest about the limit", () => {
    const news = Array.from({ length: 50 }, (_, i) => fresh(`p${i}`));
    const already = Array.from({ length: 8 }, (_, i) => study(fresh(`s${i}`), MORNING));
    const plan = buildDailySessionPlan({
      cards: [...news, ...already],
      mistakes: [],
      masteryByTopic: new Map(),
      subjectIds: ["s"],
      newCardsPerDay: 10,
      on: TODAY,
    });
    expect(plan.phases.find((phase) => phase.kind === "reviews")?.detail).toMatch(/^2 new,/);
  });
});
