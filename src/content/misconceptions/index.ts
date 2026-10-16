import type { Id, Misconception } from "@/domain/types";
import { biologyMisconceptions } from "./biology";
import { chemistryMisconceptions } from "./chemistry";
import { mathsMisconceptions } from "./maths";
import { physicsMisconceptions } from "./physics";

export { biologyMisconceptions, chemistryMisconceptions, mathsMisconceptions, physicsMisconceptions };

/** The authored misconception library. Explanations are hand-written and offline-first, like the question bank. */
export const seedMisconceptions: Misconception[] = [
  ...mathsMisconceptions,
  ...physicsMisconceptions,
  ...chemistryMisconceptions,
  ...biologyMisconceptions,
];

// Kept here, not only in `@/content`, so the app shell can read the library
// without importing (and shipping) the whole authored question bank.
export function misconceptionsForTopic(topicId: Id): Misconception[] {
  return seedMisconceptions.filter((m) => m.topicIds.includes(topicId));
}
