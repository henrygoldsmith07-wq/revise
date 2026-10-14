import type { Question } from "./types";

// ---------------------------------------------------------------------------
// Which of a topic's authored common errors (if any) bears on one question.
//
// The device marker used to append "Watch for the classic error on this topic:
// <the topic's first common error>" to every mark. On a question about the
// three domains that named "Confusing species richness with diversity" —
// unrelated to the question, and printed directly below "No known
// misconception matches this answer". A pointer the student cannot connect to
// what they were asked teaches nothing and reads as a diagnosis that was
// never made.
//
// A common error is offered only when it shares two specific words with this
// question's stem, prompts or mark scheme. Words from the topic's own title
// do not count (every question on "Enzymes and biological reactions" mentions
// enzymes), nor do short or generic words. The match only says the error is
// about the same thing as the question; it never claims the student made it.
// ---------------------------------------------------------------------------

const GENERIC = new Set([
  "about", "above", "after", "again", "against", "always", "answer", "because", "before", "being", "below", "between",
  "change", "changes", "confusing", "correct", "describe", "different", "during", "effect", "every", "explain", "forgetting",
  "giving", "including", "instead", "making", "mixing", "other", "rather", "saying", "should", "something", "their", "there",
  "these", "thing", "think", "thinking", "those", "through", "treating", "using", "value", "values", "where", "which", "while",
  "without", "would", "writing", "wrong", "question", "marks", "state", "level",
]);

const MIN_SHARED_WORDS = 2;

/** Crude stem so "enzyme"/"enzymes" and "denature"/"denatured"/"denaturing" meet. */
function stem(word: string): string {
  return word.replace(/ies$/, "y").replace(/s$/, "").replace(/(ed|ing)$/, "").replace(/e$/, "");
}

/** Lower-case stems of content words of five or more letters. */
export function contentWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []) {
    for (const part of raw.split("-")) {
      if (part.length < 5 || GENERIC.has(part)) continue;
      words.add(stem(part));
    }
  }
  return words;
}

/**
 * The first of `commonErrors` that shares a specific word with the question,
 * or null when none does. Pure; no curriculum lookup.
 */
export function relevantCommonError(
  question: Pick<Question, "stem" | "parts">,
  topic: { title: string; commonErrors: string[] },
): string | null {
  const questionText = [question.stem, ...question.parts.flatMap((part) => [part.prompt, ...part.markScheme])].join(" ");
  const asked = contentWords(questionText);
  const titleWords = contentWords(topic.title);
  for (const error of topic.commonErrors) {
    let shared = 0;
    for (const word of contentWords(error)) if (!titleWords.has(word) && asked.has(word)) shared++;
    // One shared word ("electron", "velocity", "force") is too loose: two
    // specific words in common is what tells the error is about this question.
    if (shared >= MIN_SHARED_WORDS) return error;
  }
  return null;
}
