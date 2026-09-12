// ---------------------------------------------------------------------------
// Shared text-similarity primitives.
//
// The Physics quality audit and the reasoning-novelty model must agree on what
// "the same reasoning, reworded" means, or one gate can be gamed while the
// other flags it. These functions are the single definition of value-stripped
// containment and reasoning-move normalisation used across the domain.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with"]);

/** Remove values and punctuation so a number-swapped reskin is visible. */
export function promptSignature(text: string): string {
  return text.toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/gi, "#")
    .replace(/[^a-z0-9#]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

/** Content-word set of a value-stripped prompt or reasoning move. */
export function contentTokens(text: string): Set<string> {
  return new Set(promptSignature(text).split(" ").filter(Boolean));
}

/**
 * Value-stripped containment: the fraction of the shorter text's content words
 * (or character trigrams, which catches a single-substituted word) shared with
 * the other. Rewordings keep this near 1; genuinely different operations share
 * little. Used to reject number swaps and paraphrase-only "new" questions.
 */
export function textOverload(left: string, right: string): number {
  const a = contentTokens(left);
  const b = contentTokens(right);
  let tokenScore = 0;
  if (a.size && b.size) {
    let shared = 0;
    for (const token of a) if (b.has(token)) shared++;
    tokenScore = shared / Math.min(a.size, b.size);
  }
  const trigrams = (text: string): Set<string> => {
    const squashed = promptSignature(text).replace(/[^a-z0-9#]/g, "");
    const grams = new Set<string>();
    for (let i = 0; i + 3 <= squashed.length; i++) grams.add(squashed.slice(i, i + 3));
    return grams;
  };
  const ta = trigrams(left);
  const tb = trigrams(right);
  let trigramScore = 0;
  if (ta.size && tb.size) {
    let shared = 0;
    for (const gram of ta) if (tb.has(gram)) shared++;
    trigramScore = shared / Math.min(ta.size, tb.size);
  }
  return Math.max(tokenScore, trigramScore);
}

/** Legacy alias kept for the Physics quality audit's existing call sites. */
export const promptOverload = textOverload;

/** Reasoning-move text that only restates the demand category is not authored. */
const TEMPLATED_MOVE_PREFIXES = [
  "recall reasoning",
  "explanation reasoning",
  "application reasoning",
  "misconception reasoning",
  "calculation reasoning",
  "transfer reasoning",
  "synoptic reasoning",
];

/**
 * A reasoning move must name the physical/cognitive operation, not the demand
 * label. `${demand} reasoning …` strings are generated filler; counting them
 * would let a whole bank look "varied" while every item repeats one operation.
 */
export function isTemplatedReasoningMove(move: string): boolean {
  const text = move.trim().toLowerCase();
  if (text.length < 12) return true;
  return TEMPLATED_MOVE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/** Jaccard similarity of two content-token sets (0–1). */
export function setSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}
