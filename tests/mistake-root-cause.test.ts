import { describe, expect, it } from "vitest";
import { misconceptionsForTopic } from "@/content";
import { buildMistakeRootCauseReport } from "@/domain/mistake-root-cause";
import type { Attempt, Mistake, Question, QuestionPart, Topic } from "@/domain/types";

function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "u1",
    subjectId: "wjec-alevel-maths",
    topicId: "wjec-alevel-maths.algebra",
    marksLost: 1,
    description: "Dropped a mark",
    category: "method",
    resolved: false,
    createdAt: `2026-08-${String(Number(id.slice(1)) + 1).padStart(2, "0")}T09:00:00.000Z`,
    ...overrides,
  };
}

function attempt(id: string, answer = ""): Attempt {
  return {
    id,
    userId: "u1",
    questionId: "q1",
    subjectId: "wjec-alevel-maths",
    topicIds: ["wjec-alevel-maths.algebra"],
    answers: { "p1": answer },
    marked: [{ partId: "p1", awarded: 0, max: 2, creditedPoints: [], missedPoints: ["Solves -2x < 6 correctly"], comment: "" }],
    awarded: 0,
    max: 2,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 90_000,
    mode: "practice",
    createdAt: "2026-08-01T09:00:00.000Z",
  };
}

const algebraTopic: Topic = {
  id: "wjec-alevel-maths.algebra",
  subjectId: "wjec-alevel-maths",
  unitId: "u1",
  title: "Algebra",
  order: 0,
  intrinsicDifficulty: 2,
  summary: "Algebra",
  keyPoints: [],
  commonErrors: [],
};

const part: QuestionPart = {
  id: "p1",
  label: "(a)",
  prompt: "Solve -2x < 6.",
  marks: 2,
  markScheme: ["Solves -2x < 6 correctly"],
  modelAnswer: "x > -3",
};

const question: Question = {
  id: "q1",
  subjectId: "wjec-alevel-maths",
  topicIds: [algebraTopic.id],
  kind: "structured",
  stem: "Solve the inequality.",
  parts: [part],
  totalMarks: 2,
  calculatorAllowed: false,
  difficulty: 2,
  origin: "seed",
  createdAt: "2026-08-01T09:00:00.000Z",
};

describe("mistake root-cause diagnosis", () => {
  it("returns no data for an empty or already-resolved mistake set", () => {
    const report = buildMistakeRootCauseReport({
      mistakes: [mistake("m1", { resolved: true })],
    });

    expect(report.quality).toBe("no-data");
    expect(report.rootCauses).toHaveLength(0);
  });

  it("ranks repeated mark loss above a larger one-off signal", () => {
    const report = buildMistakeRootCauseReport({
      mistakes: [
        mistake("m1", { id: "m1", misconception: "graph-reading", marksLost: 1, attemptId: "a1" }),
        mistake("m2", { id: "m2", misconception: "graph-reading", marksLost: 1, attemptId: "a2" }),
        mistake("m3", { id: "m3", misconception: "units", marksLost: 2, attemptId: "a3" }),
      ],
    });

    expect(report.rootCauses[0]?.label).toBe("Reading graphs or data");
    expect(report.rootCauses[0]?.confidence).toBe("emerging");
    expect(report.rootCauses[0]?.marksLost).toBe(2);
    expect(report.rootCauses[0]?.score).toBeGreaterThan(report.rootCauses[1]?.score ?? 0);
  });

  it("keeps timing and command-word evidence as separate causes", () => {
    const report = buildMistakeRootCauseReport({
      mistakes: [
        mistake("m1", { id: "m1", misconception: "misread-command", command: "evaluate", category: "communication", timing: "rushed", attemptId: "a1" }),
        mistake("m2", { id: "m2", misconception: "misread-command", command: "evaluate", category: "communication", timing: "rushed", attemptId: "a2" }),
      ],
    });

    expect(report.rootCauses.some((cause) => cause.id === "timing:rushed")).toBe(true);
    expect(report.rootCauses.some((cause) => cause.id === "command:evaluate")).toBe(true);
    expect(report.rootCauses.find((cause) => cause.id === "timing:rushed")?.confidence).toBe("emerging");
  });

  it("uses the answer and authored library to name a concrete misconception", () => {
    const report = buildMistakeRootCauseReport({
      mistakes: [mistake("m1", {
        questionId: "q1",
        attemptId: "a1",
        partId: "p1",
        point: "Solves -2x < 6 correctly",
        misconception: "rearrangement",
      })],
      attempts: [attempt("a1", "I divided both sides of -2x < 6 by -2 and kept the sign, writing x < -3")],
      questions: [question],
      topics: [algebraTopic],
      misconceptions: misconceptionsForTopic(algebraTopic.id),
    });

    const cause = report.rootCauses[0]!;
    expect(cause.source).toBe("authored");
    expect(cause.misconceptionId).toBe("seed-misconception:inequality-sign-reversal");
    expect(cause.nextStep).toMatch(/reverse the inequality sign/i);
  });

  it("does not call a single marked answer an established pattern", () => {
    const report = buildMistakeRootCauseReport({
      mistakes: [mistake("m1", { marksLost: 4, attemptId: "a1" })],
    });

    expect(report.quality).toBe("early-signal");
    expect(report.rootCauses[0]?.confidence).toBe("early-signal");
  });
});
