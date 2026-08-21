import { describe, expect, it } from "vitest";
import {
  measureQuestionBankDiscrimination,
  measureQuestionDiscrimination,
} from "@/domain/question-discrimination";
import { buildAssessmentInsight } from "@/domain/assessment";
import type { Attempt, Question } from "@/domain/types";

function attempt(input: {
  userId: string;
  questionId: string;
  awarded: number;
  max?: number;
  createdAt: string;
  subjectId?: string;
}): Attempt {
  return {
    id: `${input.questionId}-${input.userId}-${input.createdAt}`,
    userId: input.userId,
    questionId: input.questionId,
    subjectId: input.subjectId ?? "maths",
    topicIds: ["algebra"],
    answers: {},
    marked: [],
    awarded: input.awarded,
    max: input.max ?? 10,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: input.createdAt,
  };
}

const question = { id: "q-target", subjectId: "maths" } as const;

function questionRecord(id: string): Question {
  return {
    id,
    subjectId: "maths",
    topicIds: ["algebra"],
    kind: "short",
    stem: id,
    parts: [],
    totalMarks: 10,
    calculatorAllowed: false,
    difficulty: 3,
    origin: "ai",
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("measureQuestionDiscrimination", () => {
  it("uses latest attempts and leave-one-question-out ability for a strong item", () => {
    const abilities = [0.1, 0.3, 0.4, 0.6, 0.8, 1];
    const itemScores = [0, 0.2, 0.4, 0.6, 0.9, 1];
    const attempts = abilities.flatMap((ability, index) => [
      attempt({
        userId: `u-${index}`,
        questionId: "q-baseline",
        awarded: Math.round(ability * 10),
        createdAt: `2025-06-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
      }),
      attempt({
        userId: `u-${index}`,
        questionId: question.id,
        awarded: Math.round(itemScores[index] * 10),
        createdAt: `2025-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    ]);
    attempts.push(
      attempt({
        userId: "u-1",
        questionId: question.id,
        awarded: 10,
        createdAt: "2025-06-01T08:00:00.000Z",
      }),
    );

    const measurement = measureQuestionDiscrimination({
      question,
      attempts,
      options: { minSampleSize: 5 },
    });

    expect(measurement.sampleSize).toBe(6);
    expect(measurement.usableSampleSize).toBe(6);
    expect(measurement.abilitySource).toBe("leave-one-question-out");
    expect(measurement.facility).toBeCloseTo(0.517, 3);
    expect(measurement.discrimination).toBeGreaterThan(0.98);
    expect(measurement.band).toBe("strong");
    expect(measurement.reliable).toBe(true);
    expect(measurement.confidenceInterval).not.toBeNull();
  });

  it("accepts external ability scores and omits learners without usable ability", () => {
    const attempts = [1, 2, 3, 4, 5].map((awarded, index) =>
      attempt({
        userId: `u-${index}`,
        questionId: question.id,
        awarded: awarded * 2,
        createdAt: `2025-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const abilityByUserId = new Map<string, number>([
      ["u-0", 1],
      ["u-1", 2],
      ["u-2", 3],
      ["u-3", 4],
      ["u-4", Number.NaN],
    ]);

    const measurement = measureQuestionDiscrimination({
      question,
      attempts,
      abilityByUserId,
      options: { minSampleSize: 4 },
    });

    expect(measurement.sampleSize).toBe(5);
    expect(measurement.usableSampleSize).toBe(4);
    expect(measurement.abilitySource).toBe("provided");
    expect(measurement.discrimination).toBeCloseTo(1, 5);
    expect(measurement.band).toBe("strong");
  });

  it("is honest when the cohort is too small", () => {
    const attempts = [0, 5, 10, 10].map((awarded, index) =>
      attempt({
        userId: `u-${index}`,
        questionId: question.id,
        awarded,
        createdAt: `2025-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );

    const measurement = measureQuestionDiscrimination({
      question,
      attempts,
      abilityByUserId: new Map(attempts.map((a, index) => [a.userId, index + 1])),
    });

    expect(measurement.sampleSize).toBe(4);
    expect(measurement.usableSampleSize).toBe(4);
    expect(measurement.discrimination).toBeNull();
    expect(measurement.band).toBe("insufficient-data");
    expect(measurement.confidenceInterval).toBeNull();
    expect(measurement.reliable).toBe(false);
  });

  it("distinguishes no variance and reverse discrimination", () => {
    const noVarianceAttempts = [0, 1, 2, 3, 4].map((index) =>
      attempt({
        userId: `same-${index}`,
        questionId: question.id,
        awarded: 5,
        createdAt: `2025-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const noVariance = measureQuestionDiscrimination({
      question,
      attempts: noVarianceAttempts,
      abilityByUserId: new Map(noVarianceAttempts.map((a, index) => [a.userId, index + 1])),
    });

    expect(noVariance.discrimination).toBeNull();
    expect(noVariance.band).toBe("no-variance");

    const reverseAttempts = [10, 8, 6, 2, 0].map((awarded, index) =>
      attempt({
        userId: `reverse-${index}`,
        questionId: question.id,
        awarded,
        createdAt: `2025-07-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const reverse = measureQuestionDiscrimination({
      question,
      attempts: reverseAttempts,
      abilityByUserId: new Map(reverseAttempts.map((a, index) => [a.userId, index + 1])),
    });

    expect(reverse.discrimination).toBeLessThan(-0.9);
    expect(reverse.band).toBe("reverse");
    expect(reverse.reliable).toBe(true);
  });

  it("measures every question in a bank in input order", () => {
    const questions = [question, { id: "q-other", subjectId: "maths" }];
    const attempts = [0, 1, 2, 3, 4].flatMap((index) => [
      attempt({
        userId: `u-${index}`,
        questionId: question.id,
        awarded: index * 2,
        createdAt: `2025-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
      attempt({
        userId: `u-${index}`,
        questionId: "q-other",
        awarded: index * 2,
        createdAt: `2025-08-${String(index + 1).padStart(2, "0")}T11:00:00.000Z`,
      }),
    ]);

    const measurements = measureQuestionBankDiscrimination({
      questions,
      attempts,
      options: { minSampleSize: 5 },
    });

    expect(measurements.map((measurement) => measurement.questionId)).toEqual(["q-target", "q-other"]);
    expect(measurements[0].band).toBe("strong");
    expect(measurements[1].band).toBe("strong");
  });

  it("publishes the measurements through the assessment insight", () => {
    const target = questionRecord(question.id);
    const baseline = questionRecord("q-baseline");
    const attempts = [0, 1, 2, 3, 4].flatMap((index) => [
      attempt({
        userId: `u-${index}`,
        questionId: target.id,
        awarded: index * 2,
        createdAt: `2025-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
      attempt({
        userId: `u-${index}`,
        questionId: baseline.id,
        awarded: index * 2,
        createdAt: `2025-09-${String(index + 1).padStart(2, "0")}T11:00:00.000Z`,
      }),
    ]);

    const insight = buildAssessmentInsight({
      attempts,
      mistakes: [],
      mastery: [],
      questionsById: new Map([
        [target.id, target],
        [baseline.id, baseline],
      ]),
    });

    expect(insight.questionDiscrimination).toHaveLength(2);
    expect(insight.questionDiscrimination?.find((measurement) => measurement.questionId === target.id)?.band).toBe("strong");
  });
});
