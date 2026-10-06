import { clozeReveal } from "./cloze";
import { parseDiagram, type DiagramSpec } from "./diagrams";
import type { Card } from "./types";

/** The fields a card face needs; shared-deck cards carry these but no ids or schedule. */
type FaceCard = Pick<Card, "kind" | "front" | "back" | "clozeSource" | "note">;

// ---------------------------------------------------------------------------
// What a flip card shows (and reads aloud) on each face.
//
// Most cards are text on both sides, but two kinds are not:
//
// * cloze cards keep the blanked sentence on the front and only the missing
//   word on the back, so the reveal should show the completed sentence;
// * diagram cards store an image + hotspot payload on `back` behind the
//   `@diagram:` marker. That payload is data, not prose — rendering or
//   speaking it verbatim shows a student a wall of JSON.
//
// Every surface that flips a card (Review, the adaptive session's retrieval
// step, Audio mode) goes through these helpers so a new card kind only has to
// be taught here once.
// ---------------------------------------------------------------------------

export type CardAnswer =
  | { kind: "diagram"; spec: DiagramSpec }
  | { kind: "cloze"; sentence: string; hidden: string }
  | { kind: "text"; text: string };

export function cardAnswer(card: FaceCard): CardAnswer {
  const spec = parseDiagram(card);
  if (spec) return { kind: "diagram", spec };
  if (card.kind === "cloze") return { kind: "cloze", sentence: clozeReveal(card), hidden: card.back };
  // A damaged diagram payload must never reach the screen as raw JSON.
  if (card.back.startsWith("@diagram:")) return { kind: "text", text: "This diagram could not be loaded." };
  return { kind: "text", text: card.back };
}

/** The labels of a diagram in the numbered order the figure shows them. */
export function diagramLegend(spec: DiagramSpec): string[] {
  return spec.hotspots.map((hotspot, index) => `${index + 1}. ${hotspot.label}`);
}

/** Plain text for text-to-speech: never the raw diagram payload. */
export function cardSpeechText(card: FaceCard, revealed: boolean): string {
  if (!revealed) return card.front;
  const answer = cardAnswer(card);
  if (answer.kind === "diagram") return diagramLegend(answer.spec).join(". ");
  if (answer.kind === "cloze") return answer.sentence;
  return answer.text;
}

/** Cards a text-only mode (learn, test, match, audio) can actually use. */
export function isTextCard(card: Pick<Card, "back">): boolean {
  return !card.back.startsWith("@diagram:");
}

/**
 * The note shown under a revealed answer. A diagram card's note is the
 * instruction for the interactive labelling mode ("tap the hotspot…"), which
 * is wrong on a flip card where there is nothing to tap.
 */
export function cardRevealNote(card: FaceCard): string | null {
  if (!card.note) return null;
  if (cardAnswer(card).kind === "diagram") return null;
  return card.note;
}
