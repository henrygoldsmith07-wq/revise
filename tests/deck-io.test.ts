import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import {
  DECK_FORMAT_VERSION,
  exportDeck,
  materialiseDeck,
  parseDeckCsv,
  parseDeckFile,
  parseDeckJson,
  serialiseDeck,
} from "@/domain/deck-io";
import { createCard, gradeCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TOPIC = allTopics()[0];

function card(front: string, overrides: Partial<Card> = {}): Card {
  return {
    ...createCard(
      {
        id: front,
        userId: "u",
        subjectId: TOPIC.subjectId,
        topicId: TOPIC.id,
        front,
        back: `answer to ${front}`,
        tags: ["physics"],
      },
      NOW,
    ),
    ...overrides,
  };
}

const materialiseOptions = {
  userId: "u",
  fallbackSubjectId: TOPIC.subjectId,
  fallbackTopicId: TOPIC.id,
  knownTopicIds: new Set(allTopics().map((t) => t.id)),
  keepScheduling: false,
  now: NOW,
  idFactory: (() => {
    let n = 0;
    return () => `gen-${n++}`;
  })(),
};

describe("export", () => {
  it("round-trips a backup with scheduling intact", () => {
    const reviewed = gradeCard(card("q1"), "good", NOW);
    const deck = exportDeck([reviewed], { name: "Backup", includeScheduling: true });
    const report = parseDeckJson(serialiseDeck(deck));

    expect(report.deck?.formatVersion).toBe(DECK_FORMAT_VERSION);
    expect(report.accepted).toBe(1);
    expect(report.deck!.cards[0].scheduling).toMatchObject({
      reps: reviewed.reps,
      stability: reviewed.stability,
      due: reviewed.due,
    });

    const { cards } = materialiseDeck(report.deck!, { ...materialiseOptions, keepScheduling: true });
    expect(cards[0].reps).toBe(reviewed.reps);
    expect(cards[0].due).toBe(reviewed.due);
    expect(cards[0].stability).toBeCloseTo(reviewed.stability, 5);
  });

  it("strips scheduling from a shared deck", () => {
    const reviewed = gradeCard(card("q1"), "easy", NOW);
    const deck = exportDeck([reviewed], { name: "Shared", includeScheduling: false });
    expect(deck.cards[0].scheduling).toBeUndefined();

    // A recipient starts from zero: someone else's stability is meaningless.
    const { cards } = materialiseDeck(deck, materialiseOptions);
    expect(cards[0].reps).toBe(0);
    expect(cards[0].lapses).toBe(0);
  });
});

describe("parseDeckJson", () => {
  it("rejects invalid JSON and unknown future formats", () => {
    expect(parseDeckJson("not json").warnings[0]).toContain("not valid JSON");
    expect(parseDeckJson(JSON.stringify({ formatVersion: 99, cards: [] })).warnings[0]).toContain("format v99");
  });

  it("accepts a bare array of cards, which is what people hand-write", () => {
    const report = parseDeckJson(JSON.stringify([{ front: "a", back: "b" }]));
    expect(report.accepted).toBe(1);
  });

  it("accepts common field aliases", () => {
    const report = parseDeckJson(JSON.stringify({ cards: [{ question: "a", answer: "b" }] }));
    expect(report.accepted).toBe(1);
  });

  it("skips rows missing a side and says why", () => {
    const report = parseDeckJson(JSON.stringify({ cards: [{ front: "a" }, { front: "b", back: "c" }] }));
    expect(report.accepted).toBe(1);
    expect(report.rejected[0]).toEqual({ row: 1, reason: "missing front or back" });
  });

  it("strips dangerous media URLs but keeps safe ones", () => {
    const report = parseDeckJson(
      JSON.stringify({
        cards: [
          {
            front: "a",
            back: "b",
            imageUrl: "javascript:alert(1)",
            audioUrl: "data:audio/mp3;base64,AAAA",
          },
        ],
      }),
    );
    expect(report.deck!.cards[0].imageUrl).toBeUndefined();
    expect(report.deck!.cards[0].audioUrl).toBe("data:audio/mp3;base64,AAAA");
  });

  it("clamps out-of-range scheduling rather than trusting it", () => {
    const report = parseDeckJson(
      JSON.stringify({
        cards: [{ front: "a", back: "b", scheduling: { stability: 1e12, difficulty: -5, reps: -3, state: 99 } }],
      }),
    );
    const scheduling = report.deck!.cards[0].scheduling!;
    expect(scheduling.stability).toBeLessThanOrEqual(36500);
    expect(scheduling.difficulty).toBeGreaterThanOrEqual(1);
    expect(scheduling.reps).toBe(0);
    expect(scheduling.state).toBeLessThanOrEqual(3);
  });

  it("normalises tags", () => {
    const report = parseDeckJson(JSON.stringify({ cards: [{ front: "a", back: "b", tags: ["Paper 1", "PAPER 1"] }] }));
    expect(report.deck!.cards[0].tags).toEqual(["paper-1"]);
  });
});

describe("parseDeckCsv", () => {
  it("reads comma-separated rows with tags", () => {
    const report = parseDeckCsv("What is force?,mass times acceleration,physics mechanics");
    expect(report.accepted).toBe(1);
    expect(report.deck!.cards[0].tags).toEqual(["mechanics", "physics"]);
  });

  it("prefers tabs when present, since answers contain commas", () => {
    const report = parseDeckCsv("Define work\tForce times distance, in the direction of motion");
    expect(report.deck!.cards[0].back).toBe("Force times distance, in the direction of motion");
  });

  it("respects quoted fields", () => {
    const report = parseDeckCsv('"a, b",c');
    expect(report.deck!.cards[0].front).toBe("a, b");
  });

  it("skips a header row and Anki metadata lines", () => {
    const report = parseDeckCsv("front,back\n#separator:comma\nq,a");
    expect(report.accepted).toBe(1);
    expect(report.deck!.cards[0].front).toBe("q");
  });

  it("reports an empty file rather than crashing", () => {
    expect(parseDeckCsv("").deck).toBeNull();
  });
});

describe("parseDeckFile", () => {
  it("routes by extension", () => {
    expect(parseDeckFile("a,b", "deck.csv").accepted).toBe(1);
    expect(parseDeckFile(JSON.stringify({ cards: [{ front: "a", back: "b" }] }), "deck.json").accepted).toBe(1);
  });
});

describe("materialiseDeck", () => {
  const deck = {
    formatVersion: 1 as const,
    name: "Test",
    exportedAt: NOW.toISOString(),
    cards: [
      { front: "a", back: "1", kind: "basic" as const, tags: ["x"] },
      { front: "b", back: "2", kind: "basic" as const, tags: [] },
    ],
  };

  it("skips fronts that already exist", () => {
    const result = materialiseDeck(deck, {
      ...materialiseOptions,
      existingFronts: new Set(["a"]),
    });
    expect(result.cards).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("de-duplicates within the file itself", () => {
    const result = materialiseDeck({ ...deck, cards: [deck.cards[0], deck.cards[0]] }, materialiseOptions);
    expect(result.cards).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("retargets unknown topics onto the fallback rather than dangling", () => {
    const result = materialiseDeck(
      { ...deck, cards: [{ ...deck.cards[0], topicId: "does-not-exist" }] },
      materialiseOptions,
    );
    expect(result.retargeted).toBe(1);
    expect(result.cards[0].topicId).toBe(TOPIC.id);
    expect(result.cards[0].subjectId).toBe(TOPIC.subjectId);
  });

  it("keeps a topic the app knows about", () => {
    const known = allTopics()[1];
    const result = materialiseDeck(
      { ...deck, cards: [{ ...deck.cards[0], topicId: known.id, subjectId: known.subjectId }] },
      materialiseOptions,
    );
    expect(result.retargeted).toBe(0);
    expect(result.cards[0].topicId).toBe(known.id);
  });

  it("marks imports so they can be found and undone in bulk", () => {
    const result = materialiseDeck(deck, { ...materialiseOptions, extraTags: ["imported"] });
    expect(result.cards[0].origin).toBe("import");
    expect(result.cards[0].tags).toContain("imported");
  });
});
