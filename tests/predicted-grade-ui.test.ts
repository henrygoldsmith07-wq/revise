import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const progress = () => readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");

describe("predicted grade explanation", () => {
  it("keeps the estimate, evidence and next lever visible", () => {
    const source = progress();
    expect(source).toContain("Current estimate");
    expect(source).toContain("markedAnswers");
    expect(source).toContain("Range {prediction.worstCase}–{prediction.bestCase}");
    expect(source).toContain("Next lever");
    expect(source).toContain("How this estimate works");
  });

  it("replaces the compressed raw grade line with progressive explanation", () => {
    const source = progress();
    expect(source).not.toContain("Realistic range {prediction.worstCase}–{prediction.bestCase}");
    expect(source).not.toContain("Biggest gains available");
    expect(source).toContain("gradeCalibrationNarrative");
  });
});
