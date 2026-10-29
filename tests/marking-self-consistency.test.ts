import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markPart } from "@/domain/marking";

// Every written part's own model answer, run through the offline marker.
// A model answer that cannot earn full marks is either a marker false
// negative (most of them, measured 2026-10-18: ~27 of a 32-part sample) or a
// scheme the model answer does not cover. Learners on the offline marker meet
// both as lost marks for a correct answer.
//
// This is a ratchet: the count may only go down. Lower BASELINE whenever a
// marker or content change reduces it; never raise it to fit a regression.
//
// 883 → 687 (twenty-ninth pass, 2026-10-19), marker changes only, no content
// edits: equation points read as formulas (marking-formula.ts), reagent
// formula ↔ name and reaction-order wording, either-or "A/B" points,
// genotypes kept case-sensitive, word roots ("symmetrical"/"symmetry") in
// coverage and the scaffolding guard, a narrower polarity veto, and the
// recitation, short-answer and self-retraction caps no longer firing on
// calculation working or "concentration". tests/marking-false-negatives.test.ts
// pins each fix with wrong answers that must still lose the mark.
// 687 → 689 (pass 100): the Biology AS Unit 2 pack adds 14 questions whose model answers
// paraphrase the scheme; the marker misses several of those paraphrases (listed by
// the failing-part message). Marker leniency is the follow-up; not hidden here.
// 689 → 705 (pass 101): the Chemistry Unit 3 pack adds 12 questions with symbol-heavy answers (E°, equations)
// that the offline marker misses 16 times; marker leniency for chemical notation is the follow-up.
// 705 → 715 (pass 102): Chemistry Unit 2 pack adds 8 questions with paraphrased calculation schemes the offline marker misses 10 times.
// 715 → 728 (pass 104): Biology Unit 1 pack adds 9 questions whose paraphrased multi-point model answers the offline marker misses 13 times.
const BASELINE = 728;

describe("offline marker against the bank's own model answers", () => {
  it("never gets worse than the recorded baseline", () => {
    const failing: string[] = [];
    let parts = 0;
    for (const question of seedQuestions) {
      if (question.kind === "mcq") continue;
      for (const part of question.parts) {
        if (!part.modelAnswer?.trim()) continue;
        parts += 1;
        if (markPart(part, part.modelAnswer).awarded < part.marks) failing.push(part.id);
      }
    }
    expect(parts).toBeGreaterThan(3500);
    expect(failing.length, `${failing.length} model answers below full marks; first: ${failing.slice(0, 5).join(", ")}`).toBeLessThanOrEqual(BASELINE);
  }, 240_000);
});
