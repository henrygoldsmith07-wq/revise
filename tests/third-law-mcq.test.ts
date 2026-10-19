import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";

// Thirty-first pass. The 360px walkthrough's quick check served "A book rests
// on a table. Which pair of forces is a Newton's-third-law pair?" with two
// correct options: the two normal forces (the key) and "the weight of the
// book, and the gravitational pull of the book on the Earth", which is the
// textbook third-law pair for weight. A student who picked the second was
// marked wrong. The distractor now pairs forces of different types.

describe("third-law MCQ has exactly one third-law pair", () => {
  const items = seedQuestions.filter((q) => q.id.includes("third-law-misconception"));

  it("is in the bank for each board that carries the evidence expansion", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((q) => q.subjectId)).toContain("wjec-alevel-physics");
  });

  it("keys the normal-force pair and offers no other genuine pair", () => {
    for (const q of items) {
      const options = q.options ?? [];
      expect(options[q.correctIndex ?? -1], q.id).toBe(
        "The normal force of the book on the table, and the normal force of the table on the book",
      );
      for (const [index, option] of options.entries()) {
        if (index === q.correctIndex) continue;
        // Weight is the Earth's pull on the book; its partner is the book's pull on the Earth.
        expect(/weight of the book/i.test(option) && /pull of the book on the Earth/i.test(option), `${q.id}: "${option}" is also a pair`).toBe(false);
      }
    }
  });
});
