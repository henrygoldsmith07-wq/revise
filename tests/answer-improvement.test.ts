import { describe, expect, it } from "vitest";
import { assessRewrite, improvementCues } from "@/domain/answer-improvement";
import type { Question, QuestionPart } from "@/domain/types";

const part: QuestionPart = {
  id: "q:a",
  label: "(a)",
  prompt: "Explain why the trolley slows down.",
  marks: 2,
  markScheme: ["Friction acts against the motion of the trolley", "Kinetic energy is transferred to thermal energy"],
  modelAnswer: "Friction opposes the motion, so kinetic energy is dissipated as heat in the surroundings.",
};

const question: Question = {
  id: "q",
  subjectId: "physics",
  topicIds: ["forces"],
  kind: "short",
  stem: "A trolley rolls to a stop.",
  parts: [part],
  totalMarks: 2,
  calculatorAllowed: false,
  difficulty: 2,
  origin: "seed",
  createdAt: "2026-01-01T09:00:00.000Z",
};

const original = "The trolley slows because friction acts against the motion of the trolley.";
const better = "Friction acts against the motion of the trolley, so some of its kinetic energy is transferred to thermal energy that warms the wheels and the floor.";

describe("improvement cues", () => {
  it("point at the ground without quoting the mark-scheme point", () => {
    const [cue] = improvementCues(["Kinetic energy is transferred to thermal energy"]);
    expect(cue).toMatch(/^Mark 1: say something specific about/);
    expect(cue).not.toContain("Kinetic energy is transferred to thermal energy");
    expect(cue!.match(/“/g)!.length).toBeLessThanOrEqual(3);
  });

  it("numbers the cues and treats numeric points differently", () => {
    const cues = improvementCues(["Kinetic energy is transferred", "Calculates the answer 24 J"]);
    expect(cues[0]).toMatch(/^Mark 1:/);
    expect(cues[1]).toMatch(/^Mark 2: check your final value/);
  });

  it("returns nothing when nothing was missed", () => {
    expect(improvementCues([])).toEqual([]);
  });
});

describe("assessing a rewrite", () => {
  it("asks for a change when the rewrite is empty or identical", () => {
    for (const rewrite of ["", "   ", original, `  ${original.toUpperCase()}  `]) {
      const result = assessRewrite({ question, part, original, rewrite });
      expect(result.verdict).toBe("unchanged");
      expect(result.gained).toBe(0);
      expect(result.message).toMatch(/change the answer first/i);
    }
  });

  it("credits the extra mark a rewrite earns, marking both answers with the same rubric", () => {
    const result = assessRewrite({ question, part, original, rewrite: better });
    expect(result.before.awarded).toBeLessThan(result.after.awarded);
    expect(result.gained).toBe(result.after.awarded - result.before.awarded);
    expect(["improved", "full-marks"]).toContain(result.verdict);
    expect(result.after.awarded).toBe(2);
    expect(result.verdict).toBe("full-marks");
    expect(result.remainingCues).toEqual([]);
  });

  it("keeps cueing for the points a rewrite still misses", () => {
    const result = assessRewrite({ question, part, original: "It slows down.", rewrite: original });
    expect(result.verdict).toBe("improved");
    expect(result.remainingCues).toHaveLength(result.after.max - result.after.awarded);
    expect(result.message).toMatch(/still to find/);
  });

  it("does not reward pasting the model answer", () => {
    const result = assessRewrite({ question, part, original, rewrite: part.modelAnswer });
    expect(result.verdict).toBe("copied");
    expect(result.gained).toBe(0);
    expect(result.after).toBe(result.before);
  });

  it("never reports a negative gain when the rewrite is worse", () => {
    const result = assessRewrite({ question, part, original: better, rewrite: "It stops eventually." });
    expect(result.verdict).toBe("lower");
    expect(result.gained).toBe(0);
  });
});
