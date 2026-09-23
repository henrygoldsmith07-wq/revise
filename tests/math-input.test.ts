import { describe, expect, it } from "vitest";
import { insertMathToken, shouldOfferMathInput } from "@/domain/math-input";

describe("insertMathToken", () => {
  it("inserts operators at the caret without deleting surrounding working", () => {
    expect(insertMathToken("2x", "multiply", 1, 1)).toEqual({
      value: "2 × x",
      selectionStart: 4,
      selectionEnd: 4,
    });
  });

  it("replaces a selection when inserting a literal symbol", () => {
    expect(insertMathToken("x plus y", "plus-minus", 2, 6).value).toBe("x  ±  y");
  });

  it("wraps a selected expression before squaring it", () => {
    const inserted = insertMathToken("x + 1", "squared", 0, 5);
    expect(inserted.value).toBe("(x + 1)^2");
    expect(inserted.selectionStart).toBe(inserted.value.length);
  });

  it("puts the caret inside an empty root", () => {
    const inserted = insertMathToken("x = ", "root", 4, 4);
    expect(inserted.value).toBe("x = √()");
    expect(inserted.selectionStart).toBe(6);
  });

  it("uses a selected numerator and leaves the caret in the denominator", () => {
    const inserted = insertMathToken("x+1", "fraction", 0, 3);
    expect(inserted.value).toBe("(x+1)/()");
    expect(inserted.selectionStart).toBe(7);
  });

  it("adds a scientific-notation stem ready for the exponent", () => {
    const inserted = insertMathToken("3.2", "scientific", 3, 3);
    expect(inserted.value).toBe("3.2 × 10^");
    expect(inserted.selectionStart).toBe(inserted.value.length);
  });

  it("clamps impossible browser selection ranges safely", () => {
    expect(insertMathToken("x", "cubed", 100, -2).value).toBe("(x)^3");
  });
});

describe("shouldOfferMathInput", () => {
  it("always offers maths tools for calculation questions", () => {
    expect(shouldOfferMathInput({ questionKind: "calculation", prompt: "Find the value." })).toBe(true);
  });

  it("offers them for Mathematics questions even when the prompt is terse", () => {
    expect(
      shouldOfferMathInput({
        questionKind: "structured",
        subjectName: "Mathematics",
        prompt: "Hence find k.",
      }),
    ).toBe(true);
  });

  it("detects algebraic structured questions outside a calculation kind", () => {
    expect(
      shouldOfferMathInput({
        questionKind: "structured",
        prompt: "Expand and simplify (x + 2)(x - 3).",
      }),
    ).toBe(true);
  });

  it("does not add the toolbar to ordinary prose answers", () => {
    expect(
      shouldOfferMathInput({
        questionKind: "extended",
        subjectName: "Biology",
        prompt: "Explain why the alveoli have a large surface area.",
      }),
    ).toBe(false);
  });
});
