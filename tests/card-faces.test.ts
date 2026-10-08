import { describe, expect, it } from "vitest";
import { seedCardsForTopic } from "@/content/seed-cards";
import { getTopic } from "@/domain/curriculum";
import { cardAnswer, cardRevealNote, cardSpeechText, diagramLegend, isTextCard } from "@/domain/card-display";
import { examinerNoteForCard } from "@/domain/examiner-note";
import type { Card } from "@/domain/types";

// Regression cover for two defects a first-run walk-through of the live app
// hit on WJEC A-level Physics, "Motion, forces and Newton's laws":
//  1. the seeded free-body diagram card printed its `@diagram:{…}` payload as
//     raw JSON when revealed in Review and in the adaptive session;
//  2. the topic's first common error ("Treating weight and the normal contact
//     force as a Newton's third law pair") was shown under every card,
//     including a displacement–time graph cloze and a Newton's-second-law one.

const TOPIC_ID = "wjec-alevel-physics.kinematics-dynamics";
const topic = getTopic(TOPIC_ID);
const cards = topic ? seedCardsForTopic(topic, "test-user", new Date("2026-10-01T09:00:00Z")) : [];
const find = (pred: (card: Card) => boolean) => {
  const card = cards.find(pred);
  if (!card) throw new Error("fixture card missing");
  return card;
};

describe("flip-card faces", () => {
  it("has the fixtures this regression relies on", () => {
    expect(topic?.commonErrors[0]).toMatch(/third law pair/);
    expect(cards.some((card) => card.back.startsWith("@diagram:"))).toBe(true);
  });

  it("never shows or speaks a diagram card's raw payload", () => {
    const diagram = find((card) => card.back.startsWith("@diagram:"));
    const answer = cardAnswer(diagram);
    expect(answer.kind).toBe("diagram");
    if (answer.kind !== "diagram") return;
    expect(diagramLegend(answer.spec)).toEqual(["1. Weight", "2. Normal reaction", "3. Friction", "4. Driving force"]);
    const spoken = cardSpeechText(diagram, true);
    expect(spoken).not.toContain("@diagram");
    expect(spoken).not.toContain("{");
    // The seed note tells the student to "tap the hotspot", which is wrong on a flip card.
    expect(cardRevealNote(diagram)).toBeNull();
    expect(isTextCard(diagram)).toBe(false);
  });

  it("degrades a damaged diagram payload to a message, not JSON", () => {
    const diagram = find((card) => card.back.startsWith("@diagram:"));
    const broken = { ...diagram, back: "@diagram:{not json" };
    expect(cardAnswer(broken)).toEqual({ kind: "text", text: "This diagram could not be loaded." });
  });

  it("reveals cloze cards as the completed sentence and keeps text cards as written", () => {
    const cloze = find((card) => card.kind === "cloze");
    const answer = cardAnswer(cloze);
    expect(answer.kind).toBe("cloze");
    if (answer.kind === "cloze") expect(answer.sentence).toContain(answer.hidden);
    const text = { ...cloze, kind: "basic", back: "Plain answer", clozeSource: undefined } as Card;
    expect(cardAnswer(text)).toEqual({ kind: "text", text: "Plain answer" });
    expect(isTextCard(text)).toBe(true);
  });
});

describe("examinerNoteForCard", () => {
  it("does not put the third-law note under a motion-graph or second-law card", () => {
    const graph = find((card) => /displacement/.test(card.clozeSource ?? card.front) && /gradient/.test(card.clozeSource ?? card.front));
    const secondLaw = find((card) => /second law/i.test(card.clozeSource ?? card.front));
    expect(examinerNoteForCard(graph, topic)).toBeNull();
    expect(examinerNoteForCard(secondLaw, topic)).toBeNull();
  });

  it("keeps the note where it does belong: the free-body diagram of weight and normal reaction", () => {
    const diagram = find((card) => card.back.startsWith("@diagram:"));
    expect(examinerNoteForCard(diagram, topic)).toMatch(/weight and the normal contact force/);
  });

  it("returns null for a topic without common errors", () => {
    const diagram = find((card) => card.back.startsWith("@diagram:"));
    expect(examinerNoteForCard(diagram, { title: "x", commonErrors: [] })).toBeNull();
    expect(examinerNoteForCard(diagram, undefined)).toBeNull();
  });

  it("picks the best-matching error rather than the first", () => {
    const card = { ...cards[0], front: "A skydiver at terminal velocity: what is the resultant force?", back: "Zero resultant force", tags: [], clozeSource: undefined } as Card;
    expect(examinerNoteForCard(card, topic)).toMatch(/terminal velocity/);
  });
});
