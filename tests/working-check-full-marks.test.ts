import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/components/QuestionMarkedResult.tsx", "utf8");

describe("Working check on full-mark parts", () => {
  it("does not report a divergence for a part that earned full marks", () => {
    expect(src).toMatch(/markedPart\.awarded >= markedPart\.max/);
    expect(src).toMatch(/firstIncorrectStep != null && !fullMarks/);
  });
  it("names the part when several parts are checked", () => {
    expect(src).toMatch(/partLabel && result\.workingAnalysis!\.length > 1/);
  });
});
