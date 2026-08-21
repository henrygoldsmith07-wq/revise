import { describe, expect, it } from "vitest";
import { markMcq, markPart, markQuestion, pointCoverage, tokenise } from "@/domain/marking";
import { classifyMistake, mistakePatterns, mistakesFromAttempt, shouldResolve } from "@/domain/mistakes";
import { createCard } from "@/domain/scheduling";
import type { Attempt, Question, QuestionPart } from "@/domain/types";

const part = (overrides: Partial<QuestionPart> = {}): QuestionPart => ({
  id: "p1",
  label: "(a)",
  prompt: "Explain why the rate of reaction decreases over time.",
  marks: 3,
  markScheme: [
    "Concentration of reactants decreases",
    "Fewer successful collisions per second",
    "So the rate decreases",
  ],
  modelAnswer: "As the reaction proceeds the concentration of reactants falls, so there are fewer successful collisions per second and the rate decreases.",
  ...overrides,
});

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  subjectId: "chem",
  topicIds: ["chem.kinetics"],
  kind: "structured",
  stem: "A student investigates a reaction.",
  parts: [part()],
  totalMarks: 3,
  calculatorAllowed: true,
  difficulty: 3,
  origin: "seed",
  createdAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("tokenise", () => {
  it("drops stop words and stems inflections so wording can vary", () => {
    const tokens = tokenise("The concentration of the reactants decreases");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("of")).toBe(false);
    expect([...tokens].some((t) => "concentration".startsWith(t))).toBe(true);
  });

  it("agrees across related word forms", () => {
    const a = tokenise("oxidised");
    const b = tokenise("oxidation");
    expect([...a].some((t) => [...b].includes(t))).toBe(true);
  });
});

describe("pointCoverage", () => {
  it("scores full coverage for a matching answer and zero for an unrelated one", () => {
    expect(pointCoverage("Concentration of reactants decreases", "the concentration of reactants decreases")).toBe(1);
    expect(pointCoverage("Concentration of reactants decreases", "the moon is made of cheese")).toBe(0);
  });
});

describe("markPart", () => {
  it("awards full marks for an answer that hits every scheme point", () => {
    const marked = markPart(
      part(),
      "The concentration of the reactants decreases, so there are fewer successful collisions each second and the rate decreases.",
    );
    expect(marked.awarded).toBe(3);
    expect(marked.missedPoints).toHaveLength(0);
  });

  it("awards partial marks and names what is missing", () => {
    const marked = markPart(part(), "The concentration of the reactants decreases over time.");
    expect(marked.awarded).toBeGreaterThan(0);
    expect(marked.awarded).toBeLessThan(3);
    expect(marked.missedPoints.length).toBeGreaterThan(0);
    expect(marked.comment).toContain("Still missing");
  });

  it("gives nothing for a blank answer", () => {
    const marked = markPart(part(), "   ");
    expect(marked.awarded).toBe(0);
  });

  it("caps a two-word answer at one mark however many keywords it contains", () => {
    const marked = markPart(part(), "concentration decreases");
    expect(marked.awarded).toBeLessThanOrEqual(1);
  });

  it("credits a numeric answer that matches the scheme", () => {
    const marked = markPart(
      part({ marks: 1, markScheme: ["Answer 36.75 N"], prompt: "Find the tension." }),
      "T = 36.75",
    );
    expect(marked.awarded).toBe(1);
  });
});

describe("markMcq and markQuestion", () => {
  const mcq = question({
    kind: "mcq",
    options: ["A", "B", "C", "D"],
    correctIndex: 2,
    totalMarks: 1,
    parts: [part({ marks: 1, markScheme: ["C is correct"] })],
  });

  it("marks the right option correct and names the answer when wrong", () => {
    expect(markMcq(mcq, 2).awarded).toBe(1);
    const wrong = markMcq(mcq, 0);
    expect(wrong.awarded).toBe(0);
    expect(wrong.comment).toContain("C");
  });

  it("routes MCQs through the choice index rather than prose matching", () => {
    const result = markQuestion(mcq, { p1: "2" });
    expect(result.awarded).toBe(1);
    expect(result.max).toBe(1);
  });

  it("produces examiner-voice feedback that states the score", () => {
    const result = markQuestion(question(), { p1: "no idea" });
    expect(result.feedback).toContain(`/${result.max}`);
    expect(result.feedback.length).toBeGreaterThan(40);
  });
});

describe("mistake capture", () => {
  const attempt: Attempt = {
    id: "a1",
    userId: "u",
    questionId: "q1",
    subjectId: "chem",
    topicIds: ["chem.kinetics"],
    answers: { p1: "concentration falls" },
    marked: [
      {
        partId: "p1",
        awarded: 1,
        max: 3,
        creditedPoints: ["Concentration of reactants decreases"],
        missedPoints: ["Fewer successful collisions per second", "So the rate decreases"],
        comment: "",
      },
    ],
    awarded: 1,
    max: 3,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 5000,
    mode: "practice",
    createdAt: "2025-06-01T09:00:00.000Z",
  };

  it("turns each dropped-mark part into a mistake and a card", () => {
    let n = 0;
    const drafts = mistakesFromAttempt(attempt, question(), () => `gen-${n++}`, new Date("2025-06-01T09:00:00Z"));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].mistake.description).toContain("Dropped 2 mark");
    expect(drafts[0].card.kind).toBe("mistake");
    expect(drafts[0].card.sourceMistakeId).toBe(drafts[0].mistake.id);
    expect(drafts[0].card.back).toBe(question().parts[0].modelAnswer);
  });

  it("produces nothing for a full-marks attempt", () => {
    const full: Attempt = {
      ...attempt,
      marked: [{ ...attempt.marked[0], awarded: 3, missedPoints: [] }],
      awarded: 3,
    };
    expect(mistakesFromAttempt(full, question())).toHaveLength(0);
  });

  it("classifies mistakes by what the question asked for", () => {
    expect(classifyMistake("Explain why the rate falls", [])).toBe("communication");
    expect(classifyMistake("Calculate the concentration", ["significant figures"])).toBe("arithmetic");
    expect(classifyMistake("Name the process", [])).toBe("recall");
    expect(classifyMistake("Something else entirely", [])).toBe("unclassified");
  });

  it("only resolves a mistake once its card is genuinely secure", () => {
    const base = createCard(
      { id: "c1", userId: "u", subjectId: "chem", topicId: "chem.kinetics", front: "f", back: "b" },
      new Date("2025-06-01T09:00:00Z"),
    );
    expect(shouldResolve({ ...base, reps: 1, stability: 30 })).toBe(false);
    expect(shouldResolve({ ...base, reps: 3, stability: 3 })).toBe(false);
    expect(shouldResolve({ ...base, reps: 3, stability: 10, lapses: 1 })).toBe(false);
    expect(shouldResolve({ ...base, reps: 3, stability: 10, lapses: 0 })).toBe(true);
  });

  it("groups mistakes into patterns, most frequent first", () => {
    const patterns = mistakePatterns([
      { ...attempt, id: "x" } as never,
      ...[1, 2, 3].map((i) => ({
        id: `m${i}`,
        userId: "u",
        subjectId: "chem",
        topicId: "chem.kinetics",
        marksLost: 1,
        description: "d",
        category: "arithmetic" as const,
        resolved: false,
        createdAt: "2025-06-01T09:00:00.000Z",
      })),
      {
        id: "m9",
        userId: "u",
        subjectId: "chem",
        topicId: "chem.equilibria",
        marksLost: 1,
        description: "d",
        category: "method" as const,
        resolved: false,
        createdAt: "2025-06-01T09:00:00.000Z",
      },
    ]);
    expect(patterns[0].category).toBe("arithmetic");
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].insight.length).toBeGreaterThan(20);
  });
});

describe("mistake enrichment — assessment depth", () => {
  it("mistakes carry command, misconception, marksLost, ao and timing", () => {
    const a: Attempt = {
      id: "a9",
      userId: "u",
      questionId: "q1",
      subjectId: "chem",
      topicIds: ["chem.kinetics"],
      answers: { p1: "concentration falls" },
      marked: [
        { partId: "p1", awarded: 1, max: 3, creditedPoints: ["Concentration of reactants decreases"], missedPoints: ["Fewer successful collisions per second — method skipped"], comment: "" },
      ],
      awarded: 1,
      max: 3,
      feedback: "",
      markedBy: "rubric",
      elapsedMs: 180_000,
      mode: "practice",
      createdAt: "2025-06-01T09:00:00.000Z",
    };
    let n = 0;
    const [draft] = mistakesFromAttempt(a, question(), () => `gen-${n++}`, new Date("2025-06-01T09:00:00Z"));
    expect(draft.mistake.marksLost).toBe(2);
    expect(typeof draft.mistake.command).toBe("string");
    expect(typeof draft.mistake.misconception).toBe("string");
    expect(typeof draft.mistake.timing).toBe("string");
  });
});
