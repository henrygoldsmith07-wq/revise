import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { reorderStatements } from "@/domain/marking-adversarial-variants";
import type { Id, Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Property-based marking tests — seeded fuzzing over generated answer
// mutations, asserting the invariants every marker must hold regardless of
// input weirdness. The LCG is fixed, so failures reproduce exactly.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const structured: Question[] = seedQuestions.filter(
  (q) => q.kind !== "mcq" && q.parts.some((p) => p.markScheme.length > 0 && p.modelAnswer),
);
const FILLER_WORDS = ["however", "energy", "therefore", "particles", "also", "system", "value", "process"];

/** Deterministically mutate a model answer into a plausible student mess. */
function mutate(text: string, rng: () => number): string {
  const operations = Math.ceil(rng() * 3);
  let out = text;
  for (let i = 0; i < operations; i++) {
    const choice = rng();
    if (choice < 0.25) {
      // drop a word
      const words = out.split(/\s+/);
      if (words.length > 3) {
        words.splice(Math.floor(rng() * words.length), 1);
        out = words.join(" ");
      }
    } else if (choice < 0.45) {
      // transpose two letters of a random long word
      const long = out.match(/[a-zA-Z]{6,}/);
      if (long) {
        const w = long[0];
        const cut = 2 + Math.floor(rng() * (w.length - 4));
        const swapped = w.slice(0, cut - 1) + w[cut] + w[cut - 1] + w.slice(cut + 1);
        out = out.replace(w, swapped);
      }
    } else if (choice < 0.65) {
      // insert filler word
      const filler = FILLER_WORDS[Math.floor(rng() * FILLER_WORDS.length)];
      const at = Math.floor(rng() * (out.length + 1));
      out = out.slice(0, at) + ` ${filler} ` + out.slice(at);
    } else if (choice < 0.85) {
      // truncate tail
      out = out.slice(0, Math.max(10, Math.floor(out.length * (0.4 + rng() * 0.5))));
    } else {
      // duplicate a sentence fragment
      const parts = out.split(/(?<=\.)\s+/);
      if (parts.length > 1) out = [...parts.slice(0, 1), ...parts].join(" ");
    }
  }
  return out.trim() || "answer";
}

describe("property-based marking invariants", () => {
  const rng = mulberry32(20260822);
  const cases: Array<{ question: Question; partId: Id; answer: string }> = [];
  for (const question of structured) {
    for (const part of question.parts) {
      if (!part.modelAnswer) continue;
      for (let k = 0; k < 3; k++) cases.push({ question, partId: part.id, answer: mutate(part.modelAnswer, rng) });
    }
    if (cases.length >= 600) break;
  }

  it("generates a broad corpus", () => {
    expect(cases.length).toBeGreaterThan(400);
  }, 30_000);

  it("awards are integers within [0, max] — always", () => {
    for (const { question, partId, answer } of cases) {
      const result = markQuestion(question, { [partId]: answer });
      expect(Number.isInteger(result.awarded)).toBe(true);
      expect(result.awarded).toBeGreaterThanOrEqual(0);
      expect(result.awarded).toBeLessThanOrEqual(result.max);
      expect(result.max).toBe(question.totalMarks);
    }
  }, 120_000);

  it("marking is deterministic — same answer, same marks", () => {
    for (const { question, partId, answer } of cases.slice(0, 150)) {
      const first = markQuestion(question, { [partId]: answer });
      const second = markQuestion(question, { [partId]: answer });
      expect(second.awarded).toBe(first.awarded);
      expect(second.feedback).toBe(first.feedback);
    }
  }, 120_000);

  it("an empty answer never scores", () => {
    for (const question of structured.slice(0, 60)) {
      const result = markQuestion(question, Object.fromEntries(question.parts.map((p) => [p.id, ""])));
      expect(result.awarded).toBe(0);
    }
  }, 60_000);

  it("statement order does not change the mark (route-agnostic rewrites)", () => {
    let sampled = 0;
    for (const question of structured) {
      const part = question.parts[0];
      const reordered = reorderStatements(part.modelAnswer ?? "");
      if (reordered === part.modelAnswer || !part.modelAnswer) continue;
      const clean = markQuestion(question, { [part.id]: part.modelAnswer }).awarded;
      const shuffled = markQuestion(question, { [part.id]: reordered }).awarded;
      expect(shuffled).toBe(clean);
      if (++sampled >= 80) break;
    }
    expect(sampled).toBeGreaterThan(20);
  }, 60_000);
});
