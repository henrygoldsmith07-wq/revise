import { describe, expect, it } from "vitest";
import { markMcq, markPart, withMarkEvidence } from "@/domain/marking";
import type { MarkedPart, Question, QuestionPart } from "@/domain/types";

const part = (overrides: Partial<QuestionPart> = {}): QuestionPart => ({
  id: "p1",
  label: "(a)",
  prompt: "Explain the change.",
  marks: 3,
  markScheme: [
    "Concentration of reactants decreases",
    "Fewer successful collisions per second",
    "So the rate decreases",
  ],
  modelAnswer: "As concentration decreases there are fewer successful collisions, so the rate decreases.",
  ...overrides,
});

const question = (partOverride: Partial<QuestionPart> = {}): Question => ({
  id: "q1",
  subjectId: "chem",
  topicIds: ["chem.kinetics"],
  kind: "structured",
  stem: "Explain the change.",
  parts: [part(partOverride)],
  totalMarks: 3,
  calculatorAllowed: true,
  difficulty: 3,
  origin: "seed",
  createdAt: "2026-08-18T00:00:00.000Z",
});

describe("evidence-based mark explanations", () => {
  it("links an awarded point to an exact excerpt from the submitted answer", () => {
    const result = markPart(part(), "The concentration of reactants decreases.");
    const evidence = result.evidence?.find((item) => item.point === "Concentration of reactants decreases");

    expect(evidence).toMatchObject({ status: "credited", evidenceStrength: "strong" });
    expect(evidence?.evidence).toContain("concentration of reactants decreases");
    expect(evidence?.explanation).toContain("Awarded");
  });

  it("shows partial wording as partial evidence instead of inventing a match", () => {
    const result = markPart(
      part({ markScheme: ["Uses conservation of momentum"] }),
      "The momentum changes.",
    );
    const evidence = result.evidence?.[0];

    expect(result.missedPoints).toEqual(["Uses conservation of momentum"]);
    expect(evidence).toMatchObject({ status: "missed", evidenceStrength: "partial" });
    expect(evidence?.evidence).toContain("momentum changes");
    expect(evidence?.explanation).toContain("does not cover the full point");
  });

  it("states when a missed point has no supporting answer evidence", () => {
    const result = markPart(part({ markScheme: ["Explains the equilibrium shift"] }), "No idea.");
    const evidence = result.evidence?.[0];

    expect(evidence).toMatchObject({ status: "missed", evidence: null, evidenceStrength: "none" });
    expect(evidence?.explanation).toContain("No matching evidence");
  });

  it("makes incomplete AI marking responses auditable rather than silently filling them", () => {
    const marked: MarkedPart = {
      partId: "p1",
      awarded: 1,
      max: 3,
      creditedPoints: ["Concentration of reactants decreases"],
      missedPoints: [],
      comment: "Partial credit.",
    };
    const result = withMarkEvidence(question(), { p1: "The concentration of reactants decreases." }, { marked: [marked], feedback: "AI feedback" });
    const unreported = result.marked[0]?.evidence?.find((item) => item.point === "Fewer successful collisions per second");

    expect(unreported).toMatchObject({ status: "unreported" });
    expect(unreported?.explanation).toContain("did not report");
  });

  it("uses numerical equivalence as evidence for calculation points", () => {
    const result = markPart(
      part({ marks: 1, markScheme: ["Answer 36.75 N"], prompt: "Find the tension." }),
      "T = 36.75",
    );

    expect(result.evidence?.[0]).toMatchObject({ status: "credited", evidenceStrength: "strong" });
    expect(result.evidence?.[0]?.evidence).toContain("36.75");
  });

  it("uses the selected option as evidence for multiple-choice marking", () => {
    const mcq: Question = {
      ...question(),
      kind: "mcq",
      options: ["Wrong", "Correct"],
      correctIndex: 1,
      totalMarks: 1,
      parts: [part({ marks: 1, markScheme: ["Correct option"] })],
    };
    const result = markMcq(mcq, 1);

    expect(result.evidence?.[0]).toMatchObject({ status: "credited", evidenceStrength: "strong" });
    expect(result.evidence?.[0]?.evidence).toContain("Correct");
  });
});
