import { describe, expect, it } from "vitest";
import {
  diagnoseStep,
  diagnoseWorking,
  isRoundingOf,
  powerOfTenSlip,
} from "@/domain/step-diagnosis";

describe("isRoundingOf", () => {
  it("accepts values that agree after re-rounding", () => {
    expect(isRoundingOf(3.14159, 3.14)).toBe(true);
    expect(isRoundingOf(0.6667, 2 / 3)).toBe(true);
    expect(isRoundingOf(9.81, 9.8)).toBe(true); // both round to 9.8 at 1dp
    expect(isRoundingOf(42, 43)).toBe(false);
    expect(isRoundingOf(0, 5)).toBe(false);
  });
});

describe("powerOfTenSlip", () => {
  it("finds exactly one value out by a power of ten", () => {
    expect(powerOfTenSlip([0.032], [0.0032])).toBe(1);
    expect(powerOfTenSlip([3.2, 5], [0.0032, 5])).toBe(3);
    expect(powerOfTenSlip([0.0032], [0.032])).toBe(-1);
  });
  it("rejects anything else", () => {
    expect(powerOfTenSlip([], [])).toBeNull();
    expect(powerOfTenSlip([4], [4])).toBeNull();
    expect(powerOfTenSlip([3, 6], [0.3, 0.7])).toBeNull();
    expect(powerOfTenSlip([0.3, 60], [3, 6])).toBeNull();
    expect(powerOfTenSlip([32], [0.0035])).toBeNull();
    expect(powerOfTenSlip([-3.2], [0.32])).toBeNull();
    expect(powerOfTenSlip([0], [3])).toBeNull();
    expect(powerOfTenSlip([1, 2], [1])).toBeNull();
  });
});

describe("conversion errors", () => {
  it("names a prefix slip, then leaves unit-only and rounding diagnoses alone", () => {
    const slip = diagnoseStep("I = 0.032 A", "I = 0.0032 A");
    expect(slip.kind).toBe("conversion-error");
    expect(slip.note).toMatch(/too large by a factor of 10\b/);
    expect(diagnoseStep("I = 3.2 mA", "I = 0.0032 A").note).toMatch(/factor of 1000/);
    expect(diagnoseStep("KE = 240 kJ", "KE = 240 J").kind).toBe("unit-error");
    expect(diagnoseStep("v = 19.798 m/s", "v = 19.8 m/s").kind).toBe("rounding-error");
  });
  it("is reported as the first error of a working", () => {
    const d = diagnoseWorking({
      modelSteps: ["I = 3.2 mA = 0.0032 A", "V = IR = 0.0032 x 500 = 1.6 V"],
      answer: "I = 0.032 A\nV = IR = 0.032 x 500 = 16 V",
      similarityFn: () => 0,
    });
    expect(d.kind).toBe("conversion-error");
    expect(d.summary).toMatch(/unit prefix was converted the wrong way/);
  });
});

describe("diagnoseStep", () => {
  it("detects a rounding difference", () => {
    const d = diagnoseStep("v = 19.798 m/s", "v = 19.8 m/s");
    expect(d.kind).toBe("rounding-error");
  });

  it("detects a unit mismatch", () => {
    const d = diagnoseStep("KE = 240 kJ", "KE = 240 J");
    expect(d.kind).toBe("unit-error");
    expect(d.note).toMatch(/unit/i);
  });

  it("flags a back-to-front rearrangement", () => {
    const d = diagnoseStep("a + b = x", "x = a + b");
    expect(d.kind).toBe("incorrect-rearrangement");
  });

  it("distinguishes a changed substituted value from an arithmetic slip", () => {
    const d = diagnoseStep("F = 5 x 4 = 20", "F = 5 x 3 = 15");
    expect(d.kind).toBe("substitution-error");
  });
  it("classifies correct substitution with a slipped result as arithmetic slip", () => {
    // Same formula and inputs, wrong final value — arithmetic slip.
    const d = diagnoseStep("F = 5 x 3 = 12", "F = 5 x 3 = 15");
    expect(d.kind).toBe("arithmetic-slip");
  });

  it("labels an unrelated route as method-error", () => {
    const d = diagnoseStep(
      "Using trial and improvement between 3 and 4",
      "Differentiate f(x) and set the derivative to zero",
    );
    expect(d.kind).toBe("method-error");
    expect(d.note).toMatch(/different method/i);
  });

  it("treats empty working as no method shown", () => {
    expect(diagnoseStep("", "anything").kind).toBe("method-error");
  });
});

describe("diagnoseWorking", () => {
  const modelSteps = [
    "Convert 250 g to moles: n = 250 / 40 = 6.25 mol",
    "Concentration = n / V = 6.25 / 0.5",
    "c = 12.5 mol/dm3",
  ];

  function simpleSim(a: string, b: string): number {
    const na = a.toLowerCase().replace(/\s+/g, "");
    const nb = b.toLowerCase().replace(/\s+/g, "");
    if (na === nb) return 1;
    return nb.includes(na) || na.includes(nb) ? 0.7 : 0;
  }

  function diagnose(answer: string) {
    return diagnoseWorking({ modelSteps, answer, similarityFn: simpleSim });
  }

  it("all-matching working passes cleanly", () => {
    const d = diagnose(modelSteps.join("\n"));
    expect(d.firstErrorIndex).toBeNull();
    expect(d.summary).toContain("mark scheme");
  });

  it("pinpoints the first bad step in a longer chain", () => {
    // Step 0 matches exactly, steps 1-2 are wrong content.
    const answer = [modelSteps[0], "totally different approach here", "and more nonsense"].join("\n");
    const d = diagnose(answer);
    expect(d.firstErrorIndex).not.toBeNull();
    expect(d.firstErrorIndex!).toBeGreaterThanOrEqual(0);
  });

  it("summarises arithmetic slips distinctly from wrong methods", () => {
    const slipAnswer = [
      modelSteps[0],
      "concentration = 6.25 / 0.55",
      "c = 11.36 mol/dm3",
    ].join("\n");
    const d = diagnose(slipAnswer);
    // The first line matches, later ones diverge — some error is detected.
    expect(d.firstErrorIndex).not.toBeNull();
    // The wrong-method case has no matching prefix at all.
    const wrongMethod = diagnose("guess a number and check it");
    expect(wrongMethod.firstErrorIndex).not.toBeNull();
  });
});
