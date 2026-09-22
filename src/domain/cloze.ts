import type { Card } from "./types";

export const CLOZE_BLANK = "[…]";

export interface BuiltCloze {
  front: string;
  back: string;
  clozeSource: string;
}

/**
 * Build one deterministic cloze deletion from a complete sentence and the
 * exact text that should be hidden. The source stays intact on the card so the
 * review screen can reveal the completed sentence instead of only a detached
 * answer fragment.
 *
 * Matching is case-insensitive but replacement preserves the original source
 * casing. Only the first occurrence is blanked; a card should test one chunk
 * of information at a time.
 */
export function buildCloze(sourceRaw: string, answerRaw: string): BuiltCloze | null {
  const source = sourceRaw.trim();
  const answer = answerRaw.trim();
  if (!source || !answer) return null;

  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\  const index = source.toLocaleLowerCase("en-GB").indexOf(answer.toLocaleLowerCase("en-GB"));
  if (index < 0) return null;

  return {
    front: source.slice(0, index) + CLOZE_BLANK + source.slice(index + answer.length),
    back: source.slice(index, index + answer.length),");
  const match = new RegExp(escaped, "i").exec(source);
  if (!match || match.index == null) return null;
  const index = match.index;
  const matchedAnswer = match[0];

  return {
    front: source.slice(0, index) + CLOZE_BLANK + source.slice(index + matchedAnswer.length),
    back: matchedAnswer,
    clozeSource: source,
  };
}

/** Reconstruct the full sentence for legacy cloze cards when possible. */
export function clozeSource(card: Pick<Card, "kind" | "front" | "back" | "clozeSource">): string | null {
  if (card.kind !== "cloze") return null;
  if (card.clozeSource?.trim()) return card.clozeSource.trim();

  const blankIndex = card.front.indexOf(CLOZE_BLANK);
  if (blankIndex < 0 || !card.back.trim()) return null;
  return card.front.slice(0, blankIndex) + card.back.trim() + card.front.slice(blankIndex + CLOZE_BLANK.length);
}

/** Student-facing answer copy: completed sentence when known, answer otherwise. */
export function clozeReveal(card: Pick<Card, "kind" | "front" | "back" | "clozeSource">): string {
  return clozeSource(card) ?? card.back;
}

/** True only when the source and hidden answer can produce a real deletion. */
export function validCloze(source: string | undefined, answer: string): boolean {
  return Boolean(source && buildCloze(source, answer));
}
