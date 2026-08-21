import { describe, expect, it } from "vitest";
import { browse, easeFactor, parseQuery, SAVED_SEARCHES, sortCards, tagCounts } from "@/domain/browser";
import { allTopics } from "@/domain/curriculum";
import { createCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TODAY = "2025-06-10";
const TOPIC = allTopics()[0];

function card(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard(
      {
        id: overrides.id ?? crypto.randomUUID(),
        userId: "u",
        subjectId: TOPIC.subjectId,
        topicId: TOPIC.id,
        front: "What is the discriminant?",
        back: "b squared minus 4ac",
      },
      NOW,
    ),
    ...overrides,
  };
}

describe("parseQuery", () => {
  it("treats bare words as text and multiple terms as AND", () => {
    const parsed = parseQuery("photo electric");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]).toHaveLength(2);
    expect(parsed.groups[0][0]).toMatchObject({ kind: "text", value: "photo", negated: false });
  });

  it("keeps quoted phrases together", () => {
    const parsed = parseQuery('"photoelectric effect"');
    expect(parsed.groups[0][0].value).toBe("photoelectric effect");
  });

  it("parses field prefixes, negation and flags", () => {
    const parsed = parseQuery("tag:paper-1 -is:suspended topic:quantum");
    expect(parsed.groups[0]).toEqual([
      { negated: false, kind: "tag", value: "paper-1" },
      { negated: true, kind: "flag", value: "suspended" },
      { negated: false, kind: "topic", value: "quantum" },
    ]);
  });

  it("parses numeric property comparisons", () => {
    const term = parseQuery("prop:lapses>=3").groups[0][0];
    expect(term).toMatchObject({ kind: "prop", property: "lapses", comparator: ">=", number: 3 });
  });

  it("splits on `or` into separate groups", () => {
    const parsed = parseQuery("is:new or is:leech");
    expect(parsed.groups).toHaveLength(2);
  });

  it("warns rather than throwing on nonsense", () => {
    expect(parseQuery("is:banana").warnings[0]).toContain("Unknown filter");
    expect(parseQuery("prop:lapses").warnings[0]).toContain("prop:lapses");
    expect(parseQuery("prop:banana>2").warnings[0]).toContain("Unknown property");
  });

  it("searches text containing a colon rather than erroring", () => {
    const term = parseQuery("ratio:5").groups[0][0];
    expect(term.kind).toBe("text");
    expect(term.value).toBe("ratio:5");
  });
});

describe("browse", () => {
  const cards = [
    card({ id: "due", due: "2025-06-01", reps: 3, stability: 10, lastReviewedAt: NOW.toISOString() }),
    card({ id: "new", due: TODAY, reps: 0 }),
    card({ id: "leech", due: TODAY, reps: 9, lapses: 5, stability: 3, lastReviewedAt: NOW.toISOString() }),
    card({ id: "suspended", due: "2025-06-01", suspended: true, reps: 2 }),
    card({ id: "buried", due: "2025-06-01", buriedUntil: "2025-06-30", reps: 2 }),
    card({ id: "tagged", due: TODAY, tags: ["paper-1", "tricky"], reps: 1 }),
  ];

  const run = (query: string) => browse(cards, { query, now: NOW }).cards.map((c) => c.id);

  it("returns everything for an empty query", () => {
    expect(browse(cards, { now: NOW }).cards).toHaveLength(cards.length);
  });

  it("excludes suspended and buried cards from is:due", () => {
    const due = run("is:due");
    expect(due).toContain("due");
    expect(due).not.toContain("suspended");
    expect(due).not.toContain("buried");
  });

  it("finds cards by flag", () => {
    expect(run("is:new")).toEqual(["new"]);
    expect(run("is:leech")).toEqual(["leech"]);
    expect(run("is:suspended")).toEqual(["suspended"]);
    expect(run("is:buried")).toEqual(["buried"]);
    expect(run("is:untagged")).not.toContain("tagged");
  });

  it("matches tags by prefix so tag:paper finds paper-1", () => {
    expect(run("tag:paper")).toEqual(["tagged"]);
    expect(run("tag:paper-1")).toEqual(["tagged"]);
    expect(run("tag:nope")).toEqual([]);
  });

  it("negates with a leading dash", () => {
    expect(run("-is:suspended")).not.toContain("suspended");
  });

  it("ANDs terms and ORs across `or`", () => {
    expect(run("is:leech is:new")).toEqual([]);
    expect(run("is:leech or is:new").sort()).toEqual(["leech", "new"]);
  });

  it("compares numeric properties", () => {
    expect(run("prop:lapses>3")).toEqual(["leech"]);
    expect(run("prop:lapses<1").length).toBeGreaterThan(0);
  });

  it("searches front, back and tags as text", () => {
    expect(run("discriminant").length).toBe(cards.length);
    expect(run("tricky")).toEqual(["tagged"]);
  });

  it("applies the hard scope before the query", () => {
    const scoped = browse(cards, { subjectIds: ["not-a-subject"], now: NOW });
    expect(scoped.cards).toHaveLength(0);
  });

  it("surfaces parser warnings alongside results", () => {
    expect(browse(cards, { query: "is:banana", now: NOW }).warnings).toHaveLength(1);
  });

  it("every saved search parses without warnings", () => {
    for (const saved of SAVED_SEARCHES) {
      expect(parseQuery(saved.query).warnings, saved.query).toHaveLength(0);
    }
  });
});

describe("easeFactor", () => {
  it("maps FSRS difficulty onto a familiar SM-2-shaped range, inverted", () => {
    expect(easeFactor(card({ difficulty: 1 }))).toBeGreaterThan(easeFactor(card({ difficulty: 9 })));
    expect(easeFactor(card({ difficulty: 1 }))).toBeCloseTo(3.4, 1);
    expect(easeFactor(card({ difficulty: 10 }))).toBeCloseTo(1.3, 1);
  });

  it("clamps nonsense rather than returning NaN", () => {
    expect(Number.isFinite(easeFactor(card({ difficulty: 0 })))).toBe(true);
    expect(Number.isFinite(easeFactor(card({ difficulty: 99 })))).toBe(true);
  });
});

describe("sortCards and tagCounts", () => {
  const cards = [
    card({ id: "b", due: "2025-06-02", lapses: 1, front: "beta", tags: ["x"] }),
    card({ id: "a", due: "2025-06-01", lapses: 5, front: "alpha", tags: ["x", "y"] }),
    card({ id: "c", due: "2025-06-03", lapses: 0, front: "gamma", tags: [] }),
  ];

  it("sorts ascending and descending", () => {
    expect(sortCards(cards, "due").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(sortCards(cards, "due", "desc").map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(sortCards(cards, "lapses", "desc").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(sortCards(cards, "front").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const order = cards.map((c) => c.id);
    sortCards(cards, "front");
    expect(cards.map((c) => c.id)).toEqual(order);
  });

  it("counts tags most-used first", () => {
    expect(tagCounts(cards)).toEqual([
      { tag: "x", count: 2 },
      { tag: "y", count: 1 },
    ]);
  });
});
