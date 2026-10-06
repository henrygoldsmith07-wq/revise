import { parseDiagram } from "./diagrams";
import type { Card, Topic } from "./types";

// ---------------------------------------------------------------------------
// Which of a topic's common errors (if any) belongs under one card.
//
// Topics carry a short list of examiner-style common errors. Showing the
// first one under every card in the topic put "Treating weight and the
// normal contact force as a Newton's third law pair" under a card about the
// gradient of a displacement–time graph. A wrong note teaches the wrong thing
// and makes every other note less believable, so the rule is conservative:
// show the error that shares the most *distinctive* words with the card, and
// show nothing unless at least two such words overlap.
//
// "Distinctive" means: not a stop word, not a word from the topic's own title
// (every card in "Motion, forces and Newton's laws" mentions forces), and not
// a word that appears in more than one of the topic's errors.
// ---------------------------------------------------------------------------

const MIN_OVERLAP = 2;

const STOP = new Set([
  "about", "after", "also", "always", "another", "because", "been", "before", "being", "between", "both",
  "does", "down", "each", "every", "from", "have", "into", "just", "like", "made", "make", "many", "more",
  "most", "much", "must", "never", "only", "other", "over", "same", "should", "show", "some", "such",
  "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under",
  "using", "very", "what", "when", "where", "which", "while", "will", "with", "would", "your", "label",
  "forgetting", "treating", "confusing", "mixing", "thinking", "assuming", "writing", "giving", "stating",
]);

/** Lower-case content words, with a crude plural fold so "forces" ~ "force". */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word))
    .map((word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
  return new Set(words);
}

function cardText(card: Card): string {
  const spec = parseDiagram(card);
  const back = spec ? spec.hotspots.map((h) => `${h.label} ${h.note ?? ""}`).join(" ") : card.back;
  return [card.front, back, card.clozeSource ?? "", ...(card.tags ?? [])].join(" ");
}

/**
 * The common error to show under this card, or null when none clearly
 * belongs to it.
 */
export function examinerNoteForCard(
  card: Card,
  topic: Pick<Topic, "title" | "commonErrors"> | undefined,
): string | null {
  const errors = topic?.commonErrors ?? [];
  if (!errors.length) return null;

  const generic = contentWords(topic?.title ?? "");
  const perError = errors.map((error) => contentWords(error));
  const frequency = new Map<string, number>();
  for (const words of perError) for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);

  const words = contentWords(cardText(card));
  let best: { error: string; score: number } | null = null;
  perError.forEach((errorWords, index) => {
    let score = 0;
    for (const word of errorWords) {
      if (generic.has(word) || (frequency.get(word) ?? 0) > 1) continue;
      if (words.has(word)) score += 1;
    }
    if (score >= MIN_OVERLAP && (!best || score > best.score)) best = { error: errors[index], score };
  });
  return (best as { error: string; score: number } | null)?.error ?? null;
}
