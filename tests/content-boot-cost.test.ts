import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { capabilityEvidenceFor, provenanceFor } from "@/content/questions/wjec-quality-authoring";
import { equationFragments } from "@/domain/subject-assessment-semantic";

// ---------------------------------------------------------------------------
// The authored bank is built when the content module first evaluates, and the
// app shell imports it, so that build runs on every cold start before the app
// can hydrate. Fourteenth pass: three hot paths in it were made cheaper
// (bank build ~2.6s -> ~0.8s in Node, same output hash). These tests pin that
// the faster versions return exactly what the old ones did.
// ---------------------------------------------------------------------------

/** The pre-fourteenth-pass implementation, kept verbatim as the oracle. */
function legacyEquationFragments(text: string): string[] {
  return [...new Set((text
    .replace(/[−–—]/g, "-")
    .match(/[^.;!?\n]*(?:=|≈|≤|≥|→|⟶|⇌|<|>)[^.;!?\n]*/g) ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 2))];
}

function textsOf(): string[] {
  const texts: string[] = [];
  for (const question of seedQuestions) {
    texts.push(question.stem);
    for (const part of question.parts) {
      texts.push(part.prompt, part.modelAnswer, part.markScheme.join("\n"));
    }
  }
  return texts.filter(Boolean);
}

describe("equationFragments (split instead of a backtracking global match)", () => {
  it("matches the legacy pattern on every authored prompt, answer and mark scheme", () => {
    const texts = textsOf();
    expect(texts.length).toBeGreaterThan(1000);
    for (const text of texts) expect(equationFragments(text), text.slice(0, 80)).toEqual(legacyEquationFragments(text));
  });

  it("matches the legacy pattern on edge cases and generated strings", () => {
    const edges = [
      "", "=", "a=b", " x = 2 . y < 3 ; z", "no relation here.", "v = u + at\nE ⇌ F", "2.5 = x", "a → b → c",
      "x ≈ 3; x ≈ 3", "—5 = y", "<>", "...=...", "a =\n= b", "p ≤ q! r ≥ s? t ⟶ u",
    ];
    const alphabet = ["a", " ", "=", ".", ";", "\n", "<", ">", "→", "1", "—", "!", "?", "x", "≈"];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let i = 0; i < 2000; i += 1) {
      const length = next() % 40;
      edges.push(Array.from({ length }, () => alphabet[next() % alphabet.length]).join(""));
    }
    for (const text of edges) expect(equationFragments(text), JSON.stringify(text)).toEqual(legacyEquationFragments(text));
  });
});

describe("authoring contracts with cached phrase matching", () => {
  const promptA = "A reaction mixture reaches equilibrium. Using Le Chatelier's principle, predict the effect of increasing pressure on the position of equilibrium.";
  const promptB = "Calculate the gradient of the tangent to y = x² + 3x at x = 2, and differentiate to find the stationary point.";

  it("gives the same contract whatever was matched before it (no stale cached text)", () => {
    const first = capabilityEvidenceFor("chemistry", "chem.equilibria", "chem.equilibria.sp-02", promptA, ["Shifts to fewer moles"], "Equilibrium shifts left.", "Le Chatelier");
    capabilityEvidenceFor("maths", "math.differentiation", "math.differentiation.sp-01", promptB, ["dy/dx = 2x + 3"], "Gradient 7.", "differentiate");
    const again = capabilityEvidenceFor("chemistry", "chem.equilibria", "chem.equilibria.sp-02", promptA, ["Shifts to fewer moles"], "Equilibrium shifts left.", "Le Chatelier");
    expect(again).toEqual(first);
  });

  it("still requires whole-word matches (a stem never matches a longer word)", () => {
    // "pressure" is a topic entity for chem.equilibria.sp-02; "pressures" is an allowed
    // inflection, but "pressurecooker" is not a mention of pressure.
    const withWord = capabilityEvidenceFor("chemistry", "chem.equilibria", "chem.equilibria.sp-02", "State the effect of pressure.", [], "", "");
    const withoutWord = capabilityEvidenceFor("chemistry", "chem.equilibria", "chem.equilibria.sp-02", "State the effect of a pressurecooker.", [], "", "");
    expect(withWord.requiredEntities).toContain("pressure");
    expect(withoutWord.requiredEntities).not.toContain("pressure");
  });

  it("only falls back to the operation-word scan when no reasoning token is carried", () => {
    const carried = provenanceFor("Find x.", ["x = 4"], "Therefore x = 4 by rearranging.", "rearranging the equation");
    expect(carried.operation).toBe("rearranging");
    const fallback = provenanceFor("Find x.", ["Calculate x = 4"], "Therefore x = 4.", "zzzzz");
    expect(fallback.operation).not.toBe("zzzzz");
    expect(fallback.operation.length).toBeGreaterThan(0);
  });
});
