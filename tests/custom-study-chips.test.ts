import { describe, expect, it } from "vitest";
import { addTagToQuery } from "@/components/CustomStudyDialog";
import { buildCustomStudy, DEFAULT_CUSTOM_STUDY } from "@/domain/custom-study";
import { createCard } from "@/domain/scheduling";
import { allTopics } from "@/domain/curriculum";
import type { Card } from "@/domain/types";

// The custom-study dialog's tag chips used to APPEND ` tag:x` to the query.
// The browser parser joins bare terms with AND, so a non-empty filter plus a
// chip silently meant "the filter AND this tag" — an empty session unless the
// text already matched — instead of widening the session to the tag. These
// tests pin the widening behaviour against the real builder.

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TOPIC = allTopics()[0];

function card(id: string, front: string, back: string, tags: string[]): Card {
  const base = createCard({ id, userId: "u", subjectId: TOPIC.subjectId, topicId: TOPIC.id, front, back }, NOW);
  return { ...base, tags };
}

const deck = [
  card("a", "Newton's second law?", "F = ma", ["mechanics", "paper-1"]),
  card("b", "Ohm's law?", "V = IR", ["electricity", "paper-2"]),
  card("c", "Ideal gas law?", "pV = nRT", ["thermal", "paper-1"]),
  card("d", "Photosynthesis word equation?", "light + carbon dioxide + water → glucose + oxygen", ["biology", "paper-2"]),
];

describe("addTagToQuery", () => {
  it("widens an existing query with OR instead of ANDing onto it", () => {
    expect(addTagToQuery("ohm", "paper-1")).toBe("ohm or tag:paper-1");
  });

  it("starts a bare tag query when the filter is empty", () => {
    expect(addTagToQuery("", "paper-1")).toBe("tag:paper-1");
    expect(addTagToQuery("   ", "paper-1")).toBe("tag:paper-1");
  });

  it("does not duplicate a tag that is already in the query", () => {
    expect(addTagToQuery("tag:paper-1", "paper-1")).toBe("tag:paper-1");
    expect(addTagToQuery("ohm or tag:paper-1", "paper-1")).toBe("ohm or tag:paper-1");
  });

  it("keeps every chip reachable from a typed filter through the real builder", () => {
    // The exact failure from the dialog: a typed filter plus a tag chip had
    // to return at least the tag's cards, or the "Start N cards" button
    // stayed disabled with no explanation.
    const typed = "law";
    const withChip = buildCustomStudy(deck, { ...DEFAULT_CUSTOM_STUDY, query: addTagToQuery(typed, "paper-1") });
    expect(withChip.cards.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(withChip.cards.map((c) => c.id));
    expect(ids.has("a")).toBe(true); // tag:paper-1
    expect(ids.has("b")).toBe(true); // matches "law"
  });

  it("never shrinks below the tag's own cards", () => {
    const chipOnly = buildCustomStudy(deck, { ...DEFAULT_CUSTOM_STUDY, query: "tag:paper-2" });
    const widened = buildCustomStudy(deck, { ...DEFAULT_CUSTOM_STUDY, query: addTagToQuery("biology", "paper-2") });
    expect(widened.cards.length).toBeGreaterThanOrEqual(chipOnly.cards.length);
    expect(widened.cards.length).toBeGreaterThan(0);
  });
});
