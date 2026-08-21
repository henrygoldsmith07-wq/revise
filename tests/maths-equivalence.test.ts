import { describe, expect, it } from "vitest";
import {
  mathsEquivalent,
  parseExpression,
  symbolicMatch,
  type Polynomial,
} from "@/domain/maths-equivalence";

/** Collapse a polynomial to a comparable map of exponent → fraction string. */
function norm(p: Polynomial): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [e, f] of p) out[String(e)] = `${f.n}/${f.d}`;
  return out;
}

describe("parseExpression", () => {
  it("parses factored and expanded forms to the same canonical polynomial", () => {
    expect(norm(parseExpression("(x+2)(x-3)")!)).toEqual(norm(parseExpression("x^2 - x - 6")!));
  });

  it("handles implicit multiplication and unicode glyphs", () => {
    expect(norm(parseExpression("2(x + 3)")!)).toEqual(norm(parseExpression("2x + 6")!));
    expect(norm(parseExpression("x² − x − 6")!)).toEqual(norm(parseExpression("x^2 - x - 6")!));
    expect(norm(parseExpression("2x·3")!)).toEqual(norm(parseExpression("6x")!));
  });

  it("handles rational coefficients exactly", () => {
    expect(norm(parseExpression("0.5x^2")!)).toEqual(norm(parseExpression("x^2/2")!));
    expect(norm(parseExpression("1/2 x + 0.25")!)).toEqual(norm(parseExpression("0.5x + 1/4")!));
  });

  it("expands small powers", () => {
    expect(norm(parseExpression("(x+1)^2")!)).toEqual(norm(parseExpression("x^2 + 2x + 1")!));
  });

  it("rejects prose, units and multi-variable text", () => {
    expect(parseExpression("The answer is x + 1")).toBeNull();
    expect(parseExpression("mol dm-3")).toBeNull();
    expect(parseExpression("x + y")).toBeNull();
    expect(parseExpression("n = cV")).toBeNull();
    expect(parseExpression("x^2 = 4")).toBeNull();
  });

  it("rejects non-constant divisors and oversized powers", () => {
    expect(parseExpression("x/(x+1)")).toBeNull();
    expect(parseExpression("(x+1)^7")).toBeNull();
  });
});

describe("mathsEquivalent", () => {
  it("accepts algebraically equal forms", () => {
    expect(mathsEquivalent("(x+2)(x-3)", "x^2 - x - 6")).toBe("equivalent");
    expect(mathsEquivalent("x^2 - x - 6", "(x+2)(x-3)")).toBe("equivalent");
    expect(mathsEquivalent("3x + 6", "3(x + 2)")).toBe("equivalent");
    expect(mathsEquivalent("x^2 - 4", "(x-2)(x+2)")).toBe("equivalent");
    expect(mathsEquivalent("2x/2", "x")).toBe("equivalent");
  });

  it("rejects genuinely different expressions", () => {
    expect(mathsEquivalent("x^2 + x - 6", "x^2 - x - 6")).toBe("not-equivalent");
    expect(mathsEquivalent("x + 1", "x - 1")).toBe("not-equivalent");
    expect(mathsEquivalent("3x + 5", "x + 1")).toBe("not-equivalent");
  });

  it("stays unknown when either side is not an expression", () => {
    expect(mathsEquivalent("the concentration increases", "x + 1")).toBe("unknown");
    expect(mathsEquivalent("x + 1", "mol dm-3")).toBe("unknown");
  });

  it("extracts an embedded constant from prose and compares it", () => {
    expect(mathsEquivalent("0.25 mol dm-3", "x + 1")).toBe("not-equivalent");
    expect(mathsEquivalent("0.25 mol dm-3", "0.25")).toBe("equivalent");
  });

  it("compares pure constants too", () => {
    expect(mathsEquivalent("0.25", "1/4")).toBe("equivalent");
    expect(mathsEquivalent("0.25", "0.26")).toBe("not-equivalent");
  });
});

describe("symbolicMatch (marking integration)", () => {
  it("credits factored vs expanded, even when the scheme point is prose-embedded", () => {
    expect(symbolicMatch("x^2 - x - 6", "Expand and simplify (x+2)(x-3)")).toBe("equivalent");
    expect(symbolicMatch("(x+2)(x-3)", "Expands to x^2 - x - 6")).toBe("equivalent");
  });

  it("blocks a wrong pure expression that a stray digit would otherwise rescue", () => {
    // Both sides are pure expressions; the answer is wrong despite sharing digits.
    expect(symbolicMatch("x^2 + x - 6", "x^2 - x - 6")).toBe("not-equivalent");
  });

  it("judges a prose-wrapped answer by its final expression against a pure expected expression", () => {
    // The student's final expression is wrong, even though prose surrounds it.
    expect(symbolicMatch("The answer is x^2 + x - 6", "x^2 - x - 6")).toBe("not-equivalent");
    expect(symbolicMatch("The answer is x^2 - x - 6", "x^2 - x - 6")).toBe("equivalent");
  });

  it("stays neutral for constants (numeric matching owns that case)", () => {
    expect(symbolicMatch("0.25", "0.25 mol dm-3")).toBe("unknown");
  });

  it("stays neutral for units and prose schemes", () => {
    expect(symbolicMatch("n = cV 0.25", "Uses n=cV with correct units")).toBe("unknown");
  });
});
