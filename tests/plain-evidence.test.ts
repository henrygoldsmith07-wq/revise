import { describe, expect, it } from "vitest";
import { plainEvidenceLine, plainSampleLine } from "@/domain/plain-evidence";

describe("plain evidence lines", () => {
  it("turns a wide interval with little evidence into a next step", () => {
    expect(plainEvidenceLine({ uncertainty: "medium", evidence: 6 })).toEqual({
      level: "Medium",
      moreNeeded: 2,
      line: "Confidence: Medium — do 2 more questions on this to be sure.",
    });
  });

  it("uses the singular for one more and supports other units", () => {
    expect(plainEvidenceLine({ uncertainty: "high", evidence: 1, target: 2, unit: "past paper" }).line).toBe(
      "Confidence: Low — do 1 more past paper on this to be sure.",
    );
  });

  it("rounds fractional weighted trials up", () => {
    expect(plainEvidenceLine({ uncertainty: "high", evidence: 6.4 }).moreNeeded).toBe(2);
  });

  it("says when there is enough evidence", () => {
    expect(plainEvidenceLine({ uncertainty: "low", evidence: 12 }).line).toBe(
      "Confidence: High — there is enough evidence to trust this.",
    );
    expect(plainEvidenceLine({ uncertainty: "high", evidence: 12 }).line).toMatch(/still mixed/);
  });

  it("never mentions intervals or weights", () => {
    const line = plainEvidenceLine({ uncertainty: "medium", evidence: 3 }).line;
    expect(line).not.toMatch(/wilson|interval|weight|95%/i);
  });

  it("describes sample sizes in words", () => {
    expect(plainSampleLine(3, 8)).toBe("3 answers so far — needs 8 to be reliable");
    expect(plainSampleLine(1, 8, "paper")).toBe("1 paper so far — needs 8 to be reliable");
    expect(plainSampleLine(9, 8)).toBe("9 answers — enough to rely on");
  });
});
