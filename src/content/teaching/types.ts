// Authored teaching for one specification point (one roadmap checkpoint).
//
// Lessons used to be generated from the spec statement alone, so most of
// them restated it and asked the learner which spec sentence they were on.
// A checkpoint with an entry here is taught from this content instead; one
// without is shown as an outline and says so (see src/content/lessons.ts).
// Teaching content is unreviewed authored material: it never makes a
// question, mark or proof claim, and nothing here counts as human review.

export interface CheckpointTeaching {
  /** The teaching itself, in order: three to five short, self-contained steps. */
  explain: string[];
  /** One fully worked example. */
  worked: { prompt: string; steps: string[]; answer: string };
  /** A check that tests the physics, not which spec sentence this is. */
  check: { question: string; options: string[]; correctIndex: number; explanation: string };
  /** An exam-style task with a real model answer to self-mark against. */
  apply: { prompt: string; modelAnswer: string; successCriteria: string[] };
  /** The error examiners see most for this point, and its correction. */
  trap?: { wrong: string; right: string };
}

export type TeachingBySpecPoint = Readonly<Record<string, CheckpointTeaching>>;
