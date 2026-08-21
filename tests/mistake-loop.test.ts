import { describe, expect, it } from "vitest";
import {
  applyRetestToMistake,
  evaluateMistakeRetest,
} from "@/domain/mistakes";
import { remediationForMistake } from "@/domain/remediation";
import type { Attempt, Mistake, Question, Topic } from "@/domain/types";

const question: Question = {
  id: "q1",
  subjectId: "chem",
  topicIds: ["chem.kinetics"],
  kind: "structured",
  stem: "Explain why the rate decreases.",
  parts: [
    {
      id: "p1",
      label: "(a)",
      prompt: "Explain the change.",
      marks: 2,
      markScheme: ["States fewer successful collisions", "Links this to a lower rate"],
      modelAnswer: "There are fewer successful collisions, so the rate decreases.",
    },
  ],
  totalMarks: 2,
  calculatorAllowed: true,
  difficulty: 2,
  origin: "seed",
  createdAt: "2025-06-01T09:00:00.000Z",
};

const topic: Topic = {
  id: "chem.kinetics",
  subjectId: "chem",
  unitId: "chem.unit",
  title: "Kinetics",
  order: 0,
  intrinsicDifficulty: 2,
  summary: "Rates and collisions.",
  keyPoints: ["Fewer successful collisions means a lower rate"],
  commonErrors: ["Fewer successful collisions cause a lower rate"],
};

const mistake: Mistake = {
  id: "m1",
  userId: "u1",
  subjectId: "chem",
  topicId: "chem.kinetics",
  questionId: "q1",
  attemptId: "a1",
  partId: "p1",
  point: "Links this to a lower rate",
  marksLost: 1,
  description: "Dropped 1 mark: Links this to a lower rate",
  category: "method",
  resolved: false,
  createdAt: "2025-06-01T09:00:00.000Z",
};

function attempt(marked: Attempt["marked"]): Attempt {
  return {
    id: "a2",
    userId: "u1",
    questionId: "q1",
    subjectId: "chem",
    topicIds: ["chem.kinetics"],
    answers: { p1: "There are fewer successful collisions." },
    marked,
    awarded: marked.reduce((sum, part) => sum + part.awarded, 0),
    max: marked.reduce((sum, part) => sum + part.max, 0),
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    retestMistakeId: "m1",
    createdAt: "2025-06-02T09:00:00.000Z",
  };
}

describe("mistake → remediation → retest loop", () => {
  it("keeps a partial retest open", () => {
    const retest = attempt([
      {
        partId: "p1",
        awarded: 1,
        max: 2,
        creditedPoints: ["States fewer successful collisions"],
        missedPoints: ["Links this to a lower rate"],
        comment: "",
      },
    ]);

    const evaluation = evaluateMistakeRetest(mistake, question, retest);
    expect(evaluation.status).toBe("still-open");
    expect(evaluation.pointRelearned).toBe(false);
    expect(applyRetestToMistake(mistake, evaluation, retest)).toMatchObject({
      resolved: false,
      retestCount: 1,
      lastRetestAttemptId: "a2",
    });
  });

  it("resolves only when the affected part is complete and the lost point is credited", () => {
    const retest = attempt([
      {
        partId: "p1",
        awarded: 2,
        max: 2,
        creditedPoints: ["States fewer successful collisions", "Links this to a lower rate"],
        missedPoints: [],
        comment: "",
      },
    ]);

    const evaluation = evaluateMistakeRetest(mistake, question, retest);
    expect(evaluation.status).toBe("resolved");
    expect(evaluation.feedback).toContain("2/2");
    expect(applyRetestToMistake(mistake, evaluation, retest)).toMatchObject({
      resolved: true,
      resolvedAt: retest.createdAt,
      retestCount: 1,
    });
  });

  it("rejects an attempt for a different question", () => {
    const retest = { ...attempt([]), questionId: "other-question" };
    expect(evaluateMistakeRetest(mistake, question, retest).status).toBe("not-applicable");
  });

  it("rebuilds remediation from the original answer and missed point", () => {
    const original: Pick<Attempt, "answers" | "marked"> = {
      answers: { p1: "There are fewer successful collisions." },
      marked: [
        {
          partId: "p1",
          awarded: 1,
          max: 2,
          creditedPoints: ["States fewer successful collisions"],
          missedPoints: ["Links this to a lower rate"],
          comment: "",
        },
      ],
    };
    const action = remediationForMistake(mistake, question, original, topic);
    expect(action).not.toBeNull();
    expect(action?.action.length).toBeGreaterThan(20);
    expect(action?.evidence).toContain("There are fewer successful collisions");
  });
});
