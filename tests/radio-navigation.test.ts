import { describe, expect, it } from "vitest";
import { radioMove } from "@/domain/question-display";

// The MCQ options are role="radio" buttons. Arrow keys must move the single
// tab stop the way native radios do, or a screen reader announces a control
// that does not behave as promised.
describe("radioMove", () => {
  it("moves forward and wraps at the last option", () => {
    expect(radioMove("ArrowDown", 0, 3)).toBe(1);
    expect(radioMove("ArrowRight", 2, 3)).toBe(0);
  });

  it("moves backward and wraps at the first option", () => {
    expect(radioMove("ArrowUp", 1, 3)).toBe(0);
    expect(radioMove("ArrowLeft", 0, 3)).toBe(2);
  });

  it("jumps to the first or last option", () => {
    expect(radioMove("Home", 1, 3)).toBe(0);
    expect(radioMove("End", 1, 3)).toBe(2);
  });

  it("leaves other keys and an empty group alone", () => {
    for (const key of ["Tab", "Enter", " ", "a", "Escape"]) expect(radioMove(key, 1, 3)).toBeNull();
    expect(radioMove("ArrowDown", 0, 0)).toBeNull();
  });

  it("keeps a single option on itself", () => {
    expect(radioMove("ArrowDown", 0, 1)).toBe(0);
    expect(radioMove("ArrowLeft", 0, 1)).toBe(0);
  });
});
