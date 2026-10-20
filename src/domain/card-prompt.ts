import { contentTokens } from "./text-similarity";

// ---------------------------------------------------------------------------
// The front of a key-point flashcard.
//
// Seed cards are derived from a topic's authored key points. The original
// prompt was "<topic> — state and explain: <first clause>", and for most key
// points the first clause *is* the whole point, so more than half the deck
// printed its answer on the front: flipping it taught nothing. A recall cue
// has to withhold what it asks for.
//
// The cue keeps the subject of the sentence and hides what is said about it
// ("A tangent to a circle is …"), so the learner has to produce the claim.
// A point already written as "term: explanation" keeps its term as the cue.
// ---------------------------------------------------------------------------

const RECALL_MARKER = " — complete from memory: ";

/**
 * Words after which the rest of a key point is the claim being made. Kept to
 * relations, not every verb: the cue must still read as a sentence opening.
 */
const PIVOTS = new Set([
  "is", "are", "was", "were", "equals", "=", "≈", "∝", "gives", "give", "has", "have", "means",
  "requires", "require", "depends", "produces", "produce", "causes", "cause", "increases",
  "decreases", "rise", "rises", "fall", "falls", "multiply", "multiplies", "passes", "converges", "cannot",
  "must", "can", "only", "becomes", "become", "measures", "describes", "states", "uses", "use",
  "needs", "need", "lowers", "raises", "leads", "makes", "make", "allows", "allow",
]);

/** The cue must leave at least this share of the point's words to recall. */
const MIN_HIDDEN_SHARE = 0.4;
const MIN_HIDDEN_WORDS = 3;

/** Prompt for a "term: explanation" key point, as the deck has always shown it. */
function colonPrompt(topicTitle: string, point: string): string | null {
  // ": " only — a ratio such as 3:1 is not a term/explanation split.
  const colon = point.indexOf(": ");
  if (colon > 12 && colon < point.length - 12) return `${topicTitle} — explain: ${point.slice(0, colon).trim()}`;
  return null;
}

/** The opening of a key point that cues it without giving it away. */
export function recallStem(point: string): string {
  const words = point.trim().replace(/\.$/, "").split(/\s+/).filter(Boolean);
  const maxStem = words.length - Math.max(MIN_HIDDEN_WORDS, Math.ceil(words.length * MIN_HIDDEN_SHARE));
  // A relation word late in a long point would reveal most of it.
  const lastPivot = Math.min(maxStem - 1, Math.floor(words.length / 2));
  for (let i = 1; i <= lastPivot; i++) {
    const word = words[i]!.toLowerCase().replace(/[,;:]$/, "");
    if (PIVOTS.has(word)) return words.slice(0, i + 1).join(" ");
  }
  // No relation word early enough: show the opening words only.
  const cut = Math.max(1, Math.min(maxStem, Math.ceil(words.length * 0.4)));
  return words.slice(0, cut).join(" ").replace(/[,;:—–-]+$/, "");
}

/** The front of the key-point card for `point` in a topic titled `topicTitle`. */
export function keyPointPrompt(topicTitle: string, point: string): string {
  return colonPrompt(topicTitle, point) ?? `${topicTitle}${RECALL_MARKER}${recallStem(point)} …`;
}

/** Whitespace words, lower-cased and stripped of edge punctuation; symbols count. */
function answerWords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).map((word) => word.replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, "")).filter(Boolean);
}

/**
 * Share of an answer's words that its prompt does not already show.
 * 0 means the front gives the whole answer away.
 */
export function hiddenAnswerShare(front: string, back: string): number {
  const shown = new Set(answerWords(front));
  const answer = answerWords(back);
  if (!answer.length) return 1;
  return answer.filter((word) => !shown.has(word)).length / answer.length;
}

/**
 * The key point that a common error is the mistaken version of, or null when
 * none of the topic's key points is about the same thing. A "correct
 * approach" that is not about the error is worse than none.
 */
export function keyPointForError(error: string, keyPoints: readonly string[]): string | null {
  const wrong = contentTokens(error);
  let best: { point: string; shared: number } | null = null;
  for (const point of keyPoints) {
    let shared = 0;
    for (const token of contentTokens(point)) if (token.length > 3 && wrong.has(token)) shared++;
    if (shared > (best?.shared ?? 0)) best = { point, shared };
  }
  return best && best.shared >= 2 ? best.point : null;
}
