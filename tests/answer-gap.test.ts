import { describe, expect, it } from "vitest";
import { readAnswerGap, readQuestionGaps, type AnswerGapInput } from "@/domain/answer-gap";
import { localClassifyError } from "@/domain/error-local-classifier";
import { diagnoseAttemptErrors, isActionable } from "@/domain/error-diagnosis-plan";
import { ERROR_CONFIDENCE_THRESHOLD } from "@/domain/error-taxonomy";
import type { MarkedPart, Question } from "@/domain/types";

// A lost mark is read from what the student wrote, not from what the
// question looks like. Readings that rest on the answer carry a verdict the
// classifier can act on; everything else is a possibility and carries none.

const scheme = [
  "Useful power = 420 W and input power = 600 W",
  "Efficiency = 420/600 = 0.70 or 70%",
  "Wasted power = 600 − 420 = 180 W",
];
const prompt = "A motor takes in 600 J of electrical energy each second and delivers 420 J of useful mechanical energy each second.\nCalculate the motor's efficiency and its wasted power.";
const lost = (answer: string, over: Partial<AnswerGapInput> = {}): AnswerGapInput => ({ answer, missedPoints: scheme, awarded: 0, max: 3, prompt, ...over });

describe("readAnswerGap: nothing written", () => {
  it("reads a blank and an 'I don't know' as not attempted, clearly", () => {
    for (const answer of ["", "   ", "?", "I don't know", "dont know", "not sure", "idk", "no idea", "n/a"]) {
      const gap = readAnswerGap(lost(answer));
      expect(gap?.kind, answer).toBe("not-attempted");
      expect(gap?.certainty).toBe("clear");
      expect(gap?.repair).toBe("learn");
      expect(gap?.verdict?.category).toBe("knowledge-gap");
    }
  });

  it("reads a hedged guess that earned nothing as a likely gap in the idea", () => {
    const gap = readAnswerGap(lost("I think it is to do with the energy being conserved but I am not sure"));
    expect(gap).toMatchObject({ kind: "guessed", certainty: "likely", repair: "learn" });
    expect(gap?.verdict).toMatchObject({ category: "knowledge-gap" });
  });

  it("does not hear a confession in physics that says something is not known", () => {
    const gap = readAnswerGap({ answer: "We do not know the mass of the trolley so the acceleration cannot be found from F = ma alone", missedPoints: ["a = 2.5 m s⁻²"], awarded: 0, max: 2, prompt: "A 4 kg trolley is pulled by 10 N" });
    expect(gap?.kind).toBe("off-target");
    expect(gap?.verdict).toBeNull();
  });
});

describe("readAnswerGap: something wrong was written", () => {
  it("reads a division written the wrong way round, quoting both", () => {
    const gap = readAnswerGap(lost("efficiency = 600/420 = 1.43"));
    expect(gap).toMatchObject({ kind: "inverted", certainty: "clear", repair: "example" });
    expect(gap?.happened).toContain("600 ÷ 420");
    expect(gap?.happened).toContain("420 ÷ 600");
    expect(gap?.verdict).toMatchObject({ category: "formula-selection" });
  });

  it("a value that only equals the reciprocal is a reading, never a stored cause", () => {
    for (const answer of ["the efficiency is 1.43", "efficiency is 143%"]) {
      const gap = readAnswerGap(lost(answer));
      expect(gap, answer).toMatchObject({ kind: "inverted", certainty: "likely" });
      expect(gap?.verdict).toBeNull();
    }
  });

  it("reads a line of the student's own arithmetic that does not add up", () => {
    const gap = readAnswerGap(lost("efficiency = 420/600 = 0.70, wasted power = 600 - 420 = 190 W", { missedPoints: [scheme[2]!], creditedPoints: [scheme[0]!, scheme[1]!], awarded: 2 }));
    expect(gap).toMatchObject({ kind: "arithmetic", certainty: "clear", repair: "redo" });
    expect(gap?.happened).toContain("600 - 420 = 190");
    expect(gap?.happened).toContain("180");
    expect(gap?.verdict).toMatchObject({ category: "calculation" });
  });

  it("does not call rounding, a percentage or a chained sum a slip", () => {
    const fine: AnswerGapInput[] = [
      lost("efficiency = 420/600 = 70% so wasted is 30%", { missedPoints: [scheme[2]!], creditedPoints: [scheme[0]!, scheme[1]!], awarded: 2 }),
      { answer: "t = 5.0/4.9 = 1.02 then range = 12 x 1.01 = 12.1 m", missedPoints: ["Horizontal speed remains 12 m s⁻¹"], creditedPoints: ["Range = 12×1.01 = 12.1 m"], awarded: 3, max: 4 },
      { answer: "λ = 0.80 × 2/3 = 0.533 m", missedPoints: ["v = fλ = 96 m s⁻¹"], creditedPoints: ["0.80 = 3λ/2, so λ = 0.533 m"], awarded: 2, max: 3 },
      { answer: "E = 6.63 × 10^-34 × 8.0 × 10^14 = 5.3 × 10^-19 J", missedPoints: ["φ = 4.10 × 10⁻¹⁹ J"], awarded: 1, max: 3 },
    ];
    for (const input of fine) expect(readAnswerGap(input)?.kind, input.answer).not.toBe("arithmetic");
  });

  it("reads the right digits at the wrong power of ten as a unit slip", () => {
    const gap = readAnswerGap({ answer: "E = 1.0 × 10^8 Pa", missedPoints: ["E = stress/strain = 1.0 × 10¹¹ Pa"], awarded: 2, max: 3, prompt: "A wire extends by 1.2 mm under a force of 90 N." });
    expect(gap).toMatchObject({ kind: "power-of-ten", repair: "redo" });
    expect(gap?.verdict).toMatchObject({ category: "unit-error" });
  });

  it("never reads a single-digit coincidence as a slip", () => {
    const gap = readAnswerGap(lost("7", { missedPoints: [scheme[1]!] }));
    expect(gap?.kind).not.toBe("power-of-ten");
    expect(gap?.kind).not.toBe("inverted");
  });

  it("reads the opposite of a scheme point as a misconception", () => {
    expect(readAnswerGap({ answer: "the current decreases", missedPoints: ["Current increases"], awarded: 0, max: 1 }))
      .toMatchObject({ kind: "opposite", certainty: "clear", verdict: { category: "misconception" } });
    const drag = readAnswerGap({ answer: "The resultant force is zero. The drag force is bigger than the weight.", missedPoints: ["Upward drag equals downward weight"], creditedPoints: ["The resultant force is zero"], awarded: 1, max: 2 });
    expect(drag).toMatchObject({ kind: "opposite", certainty: "likely", repair: "learn" });
  });

  it("does not read a true comparison against an unrelated equality", () => {
    const gap = readAnswerGap({ answer: "The momentum of the truck is greater than the momentum of the car before the collision", missedPoints: ["Total momentum before equals total momentum after"], awarded: 0, max: 2 });
    expect(gap?.kind).not.toBe("opposite");
  });
});

describe("readAnswerGap: readings that stay possibilities", () => {
  it("most marks earned with points missing is 'not in your answer', with no verdict", () => {
    const gap = readAnswerGap(lost("efficiency = 420/600 = 0.7", { missedPoints: [scheme[2]!], creditedPoints: [scheme[0]!, scheme[1]!], awarded: 2 }));
    expect(gap).toMatchObject({ kind: "incomplete", repair: "state-points", verdict: null });
    // A value another point credits is never reported as the error.
    expect(gap?.happened).not.toContain("0.7;");
  });

  it("a real answer that earned nothing is off-target and unsure", () => {
    expect(readAnswerGap(lost("The motor spins quickly because of the magnetic field in the coil")))
      .toMatchObject({ kind: "off-target", certainty: "unsure", verdict: null });
  });

  it("says nothing for full marks or a multiple-choice pick", () => {
    expect(readAnswerGap(lost("anything", { awarded: 3 }))).toBeNull();
    expect(readAnswerGap({ answer: "2", missedPoints: ["x"], awarded: 0, max: 1, isMcq: true })).toBeNull();
  });
});

describe("the classifier acts on the answer, not the question's wording", () => {
  it("'I don't know' on a numeric question is a knowledge gap above the action threshold", () => {
    const verdict = localClassifyError({ prompt, point: scheme[1]!, answer: "I don't know", awarded: 0, maxMarks: 3 });
    expect(verdict.category).toBe("knowledge-gap");
    expect(verdict.confidence).toBeGreaterThanOrEqual(ERROR_CONFIDENCE_THRESHOLD);
  });

  it("keeps the old below-threshold heuristics when the answer gives no better evidence", () => {
    const verdict = localClassifyError({ prompt, point: scheme[1]!, answer: "The motor spins quickly because of the magnetic field in the coil", awarded: 0, maxMarks: 3 });
    expect(verdict.confidence).toBeLessThan(ERROR_CONFIDENCE_THRESHOLD);
  });

  it("never makes 'points left out' an actionable insufficient-detail (that would lead with the writing drill)", () => {
    const question = {
      id: "q", subjectId: "s", topicIds: ["t"], kind: "short", stem: "A falling object reaches terminal speed.", totalMarks: 3,
      parts: [{ id: "p", label: "", prompt: "Explain why its acceleration becomes zero.", marks: 3, markScheme: ["Drag increases with speed", "At terminal speed drag equals weight", "Resultant force is zero"], modelAnswer: "" }],
    } as unknown as Question;
    const marked: MarkedPart[] = [{ partId: "p", awarded: 2, max: 3, creditedPoints: ["Drag increases with speed", "Resultant force is zero"], missedPoints: ["At terminal speed drag equals weight"], comment: "" }];
    const plan = diagnoseAttemptErrors({ question, marked, answers: { p: "Drag increases with speed until the resultant force is zero so it stops accelerating" } });
    expect(plan.parts[0] && isActionable(plan.parts[0]) && plan.parts[0].category === "insufficient-detail").toBe(false);
    expect(readQuestionGaps(question, marked, { p: "Drag increases with speed until the resultant force is zero so it stops accelerating" })[0]?.gap.kind).toBe("incomplete");
  });
});
