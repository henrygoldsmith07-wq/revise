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
const BASELINE = 883;

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
