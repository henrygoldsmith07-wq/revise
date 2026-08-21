import type { Misconception } from "@/domain/types";
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
