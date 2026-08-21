import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { exportDeck } from "@/domain/deck-io";
import { createCard, gradeCard } from "@/domain/scheduling";
import {
  buildShareLink,
  decodeDeckFromLink,
  encodeDeckForLink,
  fromBase64Url,
  MAX_LINK_BYTES,
  toBase64Url,
} from "@/domain/sharing";
import { buildSearchIndex, searchIndex } from "@/domain/search";
import { chunkNotes } from "@/lib/pdf";
import { toSpokenText } from "@/lib/speech";
import type { Card } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TOPIC = allTopics()[0];

function card(id: string, front: string, back: string, tags: string[] = []): Card {
  return createCard({ id, userId: "u", subjectId: TOPIC.subjectId, topicId: TOPIC.id, front, back, tags }, NOW);
}

describe("base64url", () => {
  it("round-trips the unicode that card content is full of", () => {
    const text = "ΔH = −92 kJ mol⁻¹ · N₂ + 3H₂ ⇌ 2NH₃ · 45° · café";
    expect(fromBase64Url(toBase64Url(text))).toBe(text);
  });

  it("produces URL-safe output with no padding", () => {
    const encoded = toBase64Url("?".repeat(200));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("survives a payload large enough to break naive fromCharCode spreading", () => {
    const text = "x".repeat(60_000);
    expect(fromBase64Url(toBase64Url(text))).toBe(text);
  });
});

describe("deck links", () => {
  const deck = exportDeck([card("a", "Unit of force?", "The newton", ["physics"])], {
    name: "Units",
    includeScheduling: false,
  });

  it("round-trips a deck through a link", () => {
    const decoded = decodeDeckFromLink(encodeDeckForLink(deck))!;
    expect(decoded.name).toBe("Units");
    expect(decoded.cards).toHaveLength(1);
    expect(decoded.cards[0]).toMatchObject({ front: "Unit of force?", back: "The newton", tags: ["physics"] });
  });

  it("returns null for junk rather than throwing", () => {
    expect(decodeDeckFromLink("not-base64!!")).toBeNull();
    expect(decodeDeckFromLink(toBase64Url("{}"))).toBeNull();
    expect(decodeDeckFromLink(toBase64Url(JSON.stringify({ v: 99, c: [] })))).toBeNull();
  });

  it("drops rows missing a side", () => {
    const encoded = toBase64Url(JSON.stringify({ v: 1, n: "d", c: [{ f: "a" }, { f: "a", b: "b" }] }));
    expect(decodeDeckFromLink(encoded)!.cards).toHaveLength(1);
  });

  it("never carries scheduling, however the source card was reviewed", () => {
    const reviewed = gradeCard(card("a", "q", "a"), "easy", NOW);
    const shared = exportDeck([reviewed], { name: "Shared", includeScheduling: false });
    const decoded = decodeDeckFromLink(encodeDeckForLink(shared))!;
    expect(decoded.cards[0]).not.toHaveProperty("scheduling");
  });
});

describe("buildShareLink", () => {
  it("builds a link to the receiving page", () => {
    const link = buildShareLink([card("a", "q", "a")], "Deck", "https://revise.app/");
    expect(link.url.startsWith("https://revise.app/shared#")).toBe(true);
    expect(link.withinLimit).toBe(true);
    expect(link.cardsIncluded).toBe(1);
  });

  it("trims to what fits rather than failing on a big deck", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      card(`c${i}`, `A reasonably long question number ${i} about thermodynamics`, `And a correspondingly long answer ${i}`),
    );
    const link = buildShareLink(many, "Huge", "https://revise.app");
    expect(link.cardsIncluded).toBeLessThan(many.length);
    expect(link.bytes).toBeLessThanOrEqual(MAX_LINK_BYTES);
    // Still a usable link, and the caller can tell the user what was dropped.
    expect(decodeDeckFromLink(link.url.split("#")[1])!.cards.length).toBe(link.cardsIncluded);
  });

  it("keeps a single oversized card rather than returning nothing", () => {
    const giant = card("a", "x".repeat(9000), "y".repeat(9000));
    const link = buildShareLink([giant], "One", "https://revise.app");
    expect(link.cardsIncluded).toBe(1);
    expect(link.withinLimit).toBe(false);
  });
});

describe("chunkNotes", () => {
  it("returns one chunk for short notes", () => {
    expect(chunkNotes("A short paragraph.", 1000)).toEqual(["A short paragraph."]);
  });

  it("splits on paragraph boundaries", () => {
    const notes = `${"a".repeat(400)}\n\n${"b".repeat(400)}\n\n${"c".repeat(400)}`;
    const chunks = chunkNotes(notes, 500);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should straddle a paragraph, so none mixes a's with b's.
    expect(chunks.every((c) => !(c.includes("aaa") && c.includes("bbb")))).toBe(true);
  });

  it("splits a single giant paragraph on sentences", () => {
    const sentence = "This is a sentence about kinetics. ";
    const chunks = chunkNotes(sentence.repeat(60), 400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
  });

  it("ignores empty input", () => {
    expect(chunkNotes("   ")).toEqual([]);
  });
});

describe("toSpokenText", () => {
  it("strips markup that is meaningless aloud", () => {
    expect(toSpokenText("**bold** and `code`")).toBe("bold and code");
    expect(toSpokenText("![alt](data:image/png;base64,AA) caption")).toBe("caption");
  });

  it("reads maths rather than spelling out LaTeX", () => {
    expect(toSpokenText("$x^2$")).toContain("squared");
    expect(toSpokenText("$\\frac{a}{b}$")).toContain("over");
    expect(toSpokenText("$\\sqrt{2}$")).toContain("square root");
  });

  it("says the word blank for a cloze gap", () => {
    expect(toSpokenText("The [...] of reactants falls")).toContain("blank");
  });
});

describe("search index", () => {
  const corpus = { topics: allTopics(), cards: [card("a", "Photosynthesis card", "chlorophyll")], questions: [], misconceptions: [] };
  const index = buildSearchIndex(corpus);

  it("indexes every document once", () => {
    expect(index.docs).toHaveLength(allTopics().length + 1);
  });

  it("ignores queries too short to be useful", () => {
    expect(searchIndex(index, "a")).toHaveLength(0);
  });

  it("ranks the matching topic above a card that merely mentions it", () => {
    const results = searchIndex(index, "photosynthesis");
    expect(results[0].kind).toBe("topic");
    expect(results[0].title.toLowerCase()).toContain("photosynthesis");
  });

  it("finds nothing for a term that does not appear", () => {
    expect(searchIndex(index, "zzzqqxnothing")).toHaveLength(0);
  });
});
