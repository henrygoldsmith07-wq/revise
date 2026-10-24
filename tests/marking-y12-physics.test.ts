import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { pointCoverage } from "@/domain/marking-language";
import { y12PhysicsCases } from "./fixtures/marking-y12-physics-set";

// Pass 62. Seven Year 12 Physics questions, each with a correct own-words answer
// and a plausible wrong one (author judgement, not moderated marks).
// Before: wrong answers earned 4 marks an examiner gives 0 for; correct answers
// scored 10/15 (four under-credited). After: no wrong answer earns a mark and
// correct answers score 11/15. Tightening is welcome; loosening is a regression.
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCases.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
const sum = (list: typeof rows) => list.reduce((n, r) => n + r.awarded, 0);

describe("Year 12 Physics answers in a student's own words", () => {
  it("no wrong answer earns a mark (was 4 over-credited)", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("correct answers are never over-credited and score at least 12/15", () => {
    const correct = rows.filter((r) => r.kind === "correct");
    expect(correct.filter((r) => r.awarded > r.examiner)).toEqual([]);
    expect(sum(correct)).toBeGreaterThanOrEqual(25);
  });
  it("air resistance counts as drag; 'the same size as' as equals", () => {
    expect(pointCoverage("At terminal speed drag equals weight", "air resistance is the same size as the weight")).toBeGreaterThanOrEqual(0.5);
    expect(pointCoverage("drag increases", "air resistance decreases")).toBeLessThan(0.7);
  });
  it("a guarded answer explains why the mark was removed", () => {
    const q = byId.get("cnt:question:physics-depth-nuclear-sp-03-activity-definition-0")!;
    const ok = markQuestion(q, { [q.parts[0]!.id]: "Activity is the number of nuclei in the sample that decay every second. 1 Bq is one decay per second." });
    expect(ok.awarded).toBe(2);
  });
});

describe("pass 65 wording equivalents", () => {
  it("smallest energy / free an electron / angle turned through read as the scheme's words", () => {
    expect(pointCoverage("The work function φ is the minimum energy needed to release an electron from the metal's surface", "It is the smallest amount of energy needed to free an electron from the metal surface")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("Angular velocity is the rate of change of angular displacement", "It is how fast the angle turned through changes with time")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("minimum energy needed to release an electron", "the largest energy an electron can have")).toBeLessThan(0.7);
  });
});

describe("pass 66 swapped, inverted and bulk-motion definitions", () => {
  const second = rows.slice(30, 50);
  it("none of the ten new wrong answers earns more than an examiner would", () => {
    expect(second.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("the ten new correct answers are never over-credited", () => {
    expect(second.filter((r) => r.kind === "correct" && r.awarded > r.examiner)).toEqual([]);
  });
  it("swapped accuracy/precision and I/V vs V/I lose the point", () => {
    const wrong = (id: string) => second.find((r) => r.id.endsWith(id) && r.kind === "wrong")!;
    expect(wrong("accuracy-precision-definitions-1").awarded).toBe(0);
    expect(wrong("resistance-definition-14").awarded).toBe(0);
    expect(wrong("impulse-definition-1").awarded).toBe(0);
  });
});

describe("pass 68 wording equivalents", () => {
  it("'identical to' and 'kg m/s' meet the impulse unit point; coulomb per second is the ampere", () => {
    expect(pointCoverage("Unit: N s, identical to kg m s⁻¹", "It is measured in N s, the same as kg m/s")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("Unit: N s, identical to kg m s⁻¹", "It is measured in N s, which is not kg m/s")).toBeGreaterThanOrEqual(0);
  });
  it("accuracy as 'how close a measurement is to the true value' gains coverage but a swap does not", () => {
    const point = "Accuracy is closeness of the measured value to the accepted true value";
    const right = pointCoverage(point, "Accuracy is how close a measurement is to the true value.");
    expect(right).toBeGreaterThan(0.5);
    expect(pointCoverage(point, "Precision is how close repeated readings are to each other.")).toBeLessThan(right);
  });
  it("momentum conserved when no external force acts reads as a closed collision", () => {
    expect(pointCoverage("Momentum is conserved in all closed collisions", "momentum is conserved in a collision where no external force acts")).toBeGreaterThan(0.4);
  });
  it("correct Year 12 answers still never exceed the examiner mark", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded > r.examiner)).toEqual([]);
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner)).toEqual([]);
  });
});

describe("pass 69 swapped formulas, sin/cos, area/gradient and random/systematic", () => {
  const third = rows.slice(-38, -20);
  const wrong = (id: string) => third.find((r) => r.id.endsWith(id) && r.kind === "wrong")!;
  const right = (id: string) => third.find((r) => r.id.endsWith(id) && r.kind === "correct")!;
  it("none of the nine new wrong answers earns more than an examiner would (was 6 over-credited)", () => {
    expect(third.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("the nine new correct answers are never over-credited and earn at least 18 of 23 (was 16)", () => {
    const ok = third.filter((r) => r.kind === "correct");
    expect(ok.filter((r) => r.awarded > r.examiner)).toEqual([]);
    expect(sum(ok)).toBeGreaterThanOrEqual(18);
  });
  it("inverted stress/strain/Young modulus, sin for cos and swapped random/systematic lose the points", () => {
    expect(wrong("materials-sp-02-definitions-0").awarded).toBe(0);
    expect(wrong("kin-resolve-rule-1").awarded).toBe(0);
    expect(wrong("random-systematic-definitions-0").awarded).toBe(0);
    expect(wrong("momentum-definition-0").awarded).toBe(0);
  });
  it("correct answers keep their marks where the wording differs from the scheme", () => {
    expect(right("momentum-definition-0").awarded).toBeGreaterThanOrEqual(2);
    expect(right("flux-definition-0").awarded).toBeGreaterThanOrEqual(2);
    expect(right("materials-sp-02-definitions-0").awarded).toBe(3);
    expect(right("kin-resolve-rule-1").awarded).toBe(2);
  });
  it("gradient reads as slope but an area-under-graph answer is not credited", () => {
    expect(pointCoverage("Draw the tangent and take its slope", "find the gradient of the tangent")).toBeGreaterThanOrEqual(0.5);
    expect(wrong("dt-gradient-rule-1").awarded).toBe(0);
  });
});

describe("pass 71 notation, guards and swapped rules", () => {
  const third = rows.slice(-20);
  it("none of the ten new wrong answers earns a mark (was 8 of 10 over-credited)", () => {
    expect(third.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("the ten new correct answers are never over-credited and score at least 23/26", () => {
    const correct = third.filter((r) => r.kind === "correct");
    expect(correct.filter((r) => r.awarded > r.examiner)).toEqual([]);
    expect(sum(correct)).toBeGreaterThanOrEqual(23);
  });
  it("one notation: V_out/Vout, R₂/R2, R1+R2/R1 + R2", () => {
    expect(pointCoverage("V_out = V_in × R₂/(R₁ + R₂)", "Vout = Vin × R2/(R1+R2)")).toBe(1);
    expect(pointCoverage("Gradient units = (y-axis unit) ÷ (x-axis unit)", "Divide the unit of the y axis by the unit of the x axis")).toBeGreaterThanOrEqual(0.6);
  });
  it("a bigger-than answer reads as 'exceeds'", () => {
    expect(pointCoverage("The total exceeds the largest member", "The total is bigger than the largest capacitor")).toBeGreaterThanOrEqual(0.5);
  });
  it("order of the two interference conditions does not matter", () => {
    const q = byId.get("cnt:question:physics-depth-waves-sp-07-path-difference-rule-0")!;
    const r = markQuestion(q, { [q.parts[0]!.id]: "Destructive when the path difference is an odd number of half wavelengths, so antiphase. Constructive when it is a whole number of wavelengths, nλ, so in phase. n is an integer." });
    expect(r.awarded).toBe(3);
  });
});
