import { describe, expect, it } from "vitest";
import { cardState, cardStats, deckStats, retentionVerdict } from "@/domain/card-stats";
import { allTopics } from "@/domain/curriculum";
import { buildCustomStudy, CUSTOM_STUDY_PRESETS, orderCards } from "@/domain/custom-study";
import {
  buildReviewQueue,
  buryCard,
  createCard,
  isAvailable,
  isBuried,
  isDue,
  normaliseTags,
  setSuspended,
  unburyCard,
} from "@/domain/scheduling";
import type { Card, ReviewLog } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TODAY = "2025-06-10";
const TOPIC = allTopics()[0];

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    ...createCard(
      { id, userId: "u", subjectId: TOPIC.subjectId, topicId: TOPIC.id, front: id, back: `back ${id}` },
      NOW,
    ),
    ...overrides,
  };
}

function log(cardId: string, grade: ReviewLog["grade"], seconds = 5, day = "2025-06-09"): ReviewLog {
  return {
    id: crypto.randomUUID(),
    userId: "u",
    cardId,
    topicId: TOPIC.id,
    grade,
    elapsedMs: seconds * 1000,
    reviewedAt: `${day}T09:00:00.000Z`,
  };
}

describe("normaliseTags", () => {
  it("lower-cases, hyphenates, de-duplicates and sorts", () => {
    expect(normaliseTags([" Paper 1 ", "paper-1", "TRICKY"])).toEqual(["paper-1", "tricky"]);
  });

  it("drops empties and absurdly long tags", () => {
    expect(normaliseTags(["", "   ", "x".repeat(80)])).toEqual([]);
  });
});

describe("suspend and bury", () => {
  it("suspending hides a card without touching its scheduling", () => {
    const original = card("a", { due: "2025-06-01", reps: 4, stability: 12 });
    const suspended = setSuspended(original, true, NOW);

    expect(isDue(suspended, TODAY)).toBe(false);
    expect(isAvailable(suspended, TODAY)).toBe(false);
    expect(suspended.reps).toBe(original.reps);
    expect(suspended.stability).toBe(original.stability);
    expect(suspended.due).toBe(original.due);
  });

  it("unsuspending resumes exactly where it left off", () => {
    const original = card("a", { due: "2025-06-01", reps: 4 });
    const resumed = setSuspended(setSuspended(original, true, NOW), false, NOW);
    expect(isDue(resumed, TODAY)).toBe(true);
    expect(resumed.reps).toBe(4);
  });

  it("burying snoozes until tomorrow and then expires on its own", () => {
    const buried = buryCard(card("a", { due: "2025-06-01" }), 1, NOW);
    expect(buried.buriedUntil).toBe("2025-06-11");
    expect(isBuried(buried, TODAY)).toBe(true);
    expect(isDue(buried, TODAY)).toBe(false);
    // The next day it is simply due again — no action needed.
    expect(isDue(buried, "2025-06-11")).toBe(true);
    expect(isBuried(buried, "2025-06-11")).toBe(false);
  });

  it("unburying clears the field rather than leaving a stale date", () => {
    const unburied = unburyCard(buryCard(card("a", { due: "2025-06-01" }), 1, NOW), NOW);
    expect(unburied.buriedUntil).toBeUndefined();
    expect(isDue(unburied, TODAY)).toBe(true);
  });

  it("keeps suspended and buried cards out of the review queue", () => {
    const cards = [
      card("live", { due: "2025-06-01", state: 2 }),
      card("suspended", { due: "2025-06-01", state: 2, suspended: true }),
      card("buried", { due: "2025-06-01", state: 2, buriedUntil: "2025-06-30" }),
    ];
    expect(buildReviewQueue(cards, 10, TODAY).map((c) => c.id)).toEqual(["live"]);
  });
});

describe("cardStats", () => {
  it("summarises a reviewed card's history", () => {
    const subject = card("a", { reps: 3, lapses: 1, stability: 9, difficulty: 6, due: "2025-06-15", lastReviewedAt: "2025-06-09T09:00:00.000Z" });
    const stats = cardStats(subject, [log("a", "good", 4), log("a", "again", 12), log("a", "good", 6)], NOW);

    expect(stats.reps).toBe(3);
    expect(stats.lapses).toBe(1);
    expect(stats.trueRetention).toBeCloseTo(2 / 3, 5);
    expect(stats.medianSeconds).toBe(6);
    expect(stats.totalSeconds).toBe(22);
    expect(stats.history).toHaveLength(3);
    expect(stats.intervalDays).toBe(6);
  });

  it("reports null retention for an unreviewed card rather than a fake zero", () => {
    const stats = cardStats(card("a"), [], NOW);
    expect(stats.trueRetention).toBeNull();
    expect(stats.medianSeconds).toBeNull();
    expect(stats.history).toEqual([]);
  });

  it("ignores other cards' logs", () => {
    const stats = cardStats(card("a"), [log("b", "again")], NOW);
    expect(stats.trueRetention).toBeNull();
  });
});

describe("cardState", () => {
  it("classifies each lifecycle stage, with suspension winning", () => {
    expect(cardState(card("a"), TODAY)).toBe("new");
    expect(cardState(card("a", { reps: 2, stability: 3 }), TODAY)).toBe("learning");
    expect(cardState(card("a", { reps: 5, stability: 10 }), TODAY)).toBe("review");
    expect(cardState(card("a", { reps: 9, stability: 30 }), TODAY)).toBe("mastered");
    expect(cardState(card("a", { reps: 9, lapses: 5 }), TODAY)).toBe("leech");
    expect(cardState(card("a", { reps: 9, lapses: 5, suspended: true }), TODAY)).toBe("suspended");
    expect(cardState(card("a", { buriedUntil: "2025-06-30" }), TODAY)).toBe("buried");
  });
});

describe("deckStats", () => {
  const cards = [
    card("a", { reps: 5, stability: 30, lastReviewedAt: NOW.toISOString() }),
    card("b", { reps: 2, stability: 3, lapses: 5 }),
    card("c", { due: "2025-06-01", state: 2, reps: 1, stability: 8 }),
    card("d", { suspended: true }),
  ];
  const logs = [log("a", "good"), log("a", "easy"), log("b", "again"), log("c", "good")];

  it("counts states, due cards and review totals", () => {
    const stats = deckStats(cards, logs, TODAY);
    expect(stats.total).toBe(4);
    expect(stats.leeches).toBe(1);
    expect(stats.suspended).toBe(1);
    // a and b were created today (new cards are due immediately, which is what
    // makes a freshly seeded deck usable) and c is overdue; d is suspended.
    expect(stats.due).toBe(3);
    expect(stats.reviewsTotal).toBe(4);
  });

  it("measures true retention from the logs, not from the model", () => {
    const stats = deckStats(cards, logs, TODAY);
    expect(stats.trueRetention).toBeCloseTo(0.75, 5);
    expect(stats.gradeMix).toEqual({ again: 1, hard: 0, good: 2, easy: 1 });
  });

  it("ignores logs belonging to cards outside the scope", () => {
    const stats = deckStats([cards[0]], [...logs, log("elsewhere", "again")], TODAY);
    expect(stats.reviewsTotal).toBe(2);
  });
});

describe("retentionVerdict", () => {
  it("refuses to judge on thin evidence", () => {
    expect(retentionVerdict(0.5, 3)).toContain("Not enough reviews");
    expect(retentionVerdict(null, 100)).toContain("Not enough reviews");
  });

  it("names the actual problem in each direction", () => {
    expect(retentionVerdict(0.7, 50)).toContain("below the 90% target");
    expect(retentionVerdict(0.9, 50)).toContain("well calibrated");
    expect(retentionVerdict(0.99, 50)).toContain("above target");
  });
});

describe("buildCustomStudy", () => {
  const cards = [
    card("due1", { due: "2025-06-01", state: 2, reps: 3, difficulty: 8 }),
    card("due2", { due: "2025-06-05", state: 2, reps: 2, difficulty: 4, lapses: 2 }),
    card("fresh", { reps: 0 }),
    card("lapsed", { due: "2025-07-01", reps: 6, lapses: 4 }),
    card("suspended", { due: "2025-06-01", suspended: true }),
  ];

  it("draws from the requested pool", () => {
    // "fresh" is included in the due pool because an unseen card is due the
    // moment it is created — that is what lets a new deck be studied at all.
    expect(buildCustomStudy(cards, { query: "", pool: "due", limit: 10, order: "due" }, NOW).cards.map((c) => c.id)).toEqual(["due1", "due2", "fresh"]);
    expect(buildCustomStudy(cards, { query: "", pool: "new", limit: 10, order: "due" }, NOW).cards.map((c) => c.id)).toEqual(["fresh"]);
    expect(buildCustomStudy(cards, { query: "", pool: "suspended", limit: 10, order: "due" }, NOW).cards.map((c) => c.id)).toEqual(["suspended"]);
  });

  it("narrows the pool with a browser query", () => {
    const result = buildCustomStudy(cards, { query: "is:leech", pool: "all", limit: 10, order: "due" }, NOW);
    expect(result.cards.map((c) => c.id)).toEqual(["lapsed"]);
  });

  it("respects the limit and reports how many were available", () => {
    const result = buildCustomStudy(cards, { query: "", pool: "all", limit: 2, order: "due" }, NOW);
    expect(result.cards).toHaveLength(2);
    expect(result.available).toBe(5);
    expect(result.description).toContain("capped at 2");
  });

  it("flags a session containing not-yet-due cards as a preview", () => {
    const dueOnly = buildCustomStudy(cards, { query: "", pool: "due", limit: 10, order: "due" }, NOW);
    expect(dueOnly.isPreview).toBe(false);

    const ahead = buildCustomStudy(cards, { query: "", pool: "all", limit: 10, order: "due" }, NOW);
    expect(ahead.isPreview).toBe(true);
    expect(ahead.description).toContain("preview");
  });

  it("explains an empty result rather than returning a bare zero", () => {
    const result = buildCustomStudy(cards, { query: "tag:nothing", pool: "all", limit: 10, order: "due" }, NOW);
    expect(result.cards).toHaveLength(0);
    expect(result.description).toContain("Nothing matches");
  });

  it("is deterministic for a given seed", () => {
    const spec = { query: "", pool: "all" as const, limit: 5, order: "random" as const };
    const first = buildCustomStudy(cards, spec, NOW, 42).cards.map((c) => c.id);
    const second = buildCustomStudy(cards, spec, NOW, 42).cards.map((c) => c.id);
    expect(first).toEqual(second);
  });

  it("every preset produces a runnable spec", () => {
    for (const preset of CUSTOM_STUDY_PRESETS) {
      const result = buildCustomStudy(cards, preset.spec, NOW);
      expect(result.warnings, preset.label).toHaveLength(0);
      expect(result.description.length).toBeGreaterThan(10);
    }
  });
});

describe("orderCards", () => {
  const cards = [
    card("a", { due: "2025-06-03", difficulty: 2, lapses: 0, createdAt: "2025-01-03T00:00:00.000Z" }),
    card("b", { due: "2025-06-01", difficulty: 9, lapses: 5, createdAt: "2025-01-01T00:00:00.000Z" }),
  ];

  it("orders by each key", () => {
    expect(orderCards(cards, "due", 1).map((c) => c.id)).toEqual(["b", "a"]);
    expect(orderCards(cards, "difficulty", 1).map((c) => c.id)).toEqual(["b", "a"]);
    expect(orderCards(cards, "lapses", 1).map((c) => c.id)).toEqual(["b", "a"]);
    expect(orderCards(cards, "added", 1).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input", () => {
    const order = cards.map((c) => c.id);
    orderCards(cards, "due", 1);
    expect(cards.map((c) => c.id)).toEqual(order);
  });
});
