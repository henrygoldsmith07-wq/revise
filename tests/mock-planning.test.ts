import { describe, expect, it } from "vitest";
import { buildMockStudyPlan, mockTopicIds } from "@/domain/mock-planning";
import type { Attempt, Paper, Question, Topic, TopicMastery } from "@/domain/types";

const SUBJECT = "mock-subject";
const TOPIC_A = `${SUBJECT}.algebra`;
const TOPIC_B = `${SUBJECT}.geometry`;

const topics: Topic[] = [
  {
    id: TOPIC_A,
    subjectId: SUBJECT,
    unitId: `${SUBJECT}.unit-1`,
    title: "Algebra",
    order: 1,
    intrinsicDifficulty: 2,
    summary: "Equations and functions.",
    keyPoints: ["Rearrange an equation."],
    commonErrors: [],
  },
  {
    id: TOPIC_B,
    subjectId: SUBJECT,
    unitId: `${SUBJECT}.unit-1`,
    title: "Geometry",
    order: 2,
    intrinsicDifficulty: 3,
    summary: "Angles and shape properties.",
    keyPoints: ["Use the angle rule."],
    commonErrors: [],
  },
];

const questions: Question[] = [
  {
    id: "q-algebra",
    subjectId: SUBJECT,
    topicIds: [TOPIC_A],
    kind: "structured",
    stem: "Solve the equation.",
    parts: [],
    totalMarks: 4,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "q-mixed",
    subjectId: SUBJECT,
    topicIds: [TOPIC_A, TOPIC_B],
    kind: "structured",
    stem: "Use algebra and geometry together.",
    parts: [],
    totalMarks: 6,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "past-paper",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "q-unmapped",
    subjectId: SUBJECT,
    topicIds: ["unknown-topic"],
    kind: "structured",
    stem: "An imported question that needs filing.",
    parts: [],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "past-paper",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const paper: Paper = {
  id: "paper-1",
  userId: "local",
  subjectId: SUBJECT,
  title: "Spring mock",
  totalMarks: 12,
  questionIds: questions.map((question) => question.id),
  status: "extracted",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function mastery(topicId: string, value: number, attempts = 4): TopicMastery {
  return {
    topicId,
    subjectId: SUBJECT,
    mastery: value,
    retention: value,
    confidence: value,
    cardsTotal: 4,
    cardsDue: 0,
    attempts,
    accuracy: value,
    lastStudiedAt: "2026-01-01T00:00:00.000Z",
    weak: value < 0.6,
  };
}

function attempt(id: string, questionId: string, topicIds: string[], awarded: number, max: number): Attempt {
  return {
    id,
    userId: "local",
    questionId,
    subjectId: SUBJECT,
    topicIds,
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 30_000,
    mode: "practice",
    createdAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("mock preparation planning", () => {
  it("maps paper topics and splits multi-topic marks without inflating coverage", () => {
    const plan = buildMockStudyPlan({ paper, questions, topics, mastery: [], attempts: [] });

    expect(plan.questionCount).toBe(3);
    expect(plan.unmappedQuestionCount).toBe(1);
    expect(plan.mappedMarks).toBe(10);
    expect(plan.topics).toHaveLength(2);
    expect(plan.topics.find((topic) => topic.topicId === TOPIC_A)).toMatchObject({
      questionCount: 2,
      marks: 7,
      markShare: 0.7,
      need: "learn",
    });
    expect(plan.topics.find((topic) => topic.topicId === TOPIC_B)).toMatchObject({
      questionCount: 1,
      marks: 3,
      markShare: 0.3,
      need: "learn",
    });
    expect(plan.steps.filter((step) => step.activity === "recall")).toHaveLength(plan.topics.length);
    expect(mockTopicIds(plan)).toEqual(plan.topics.map((topic) => topic.topicId));
  });

  it("turns readiness evidence into written learning, practice and a final mock step", () => {
    const plan = buildMockStudyPlan({
      paper,
      questions: questions.slice(0, 2),
      topics,
      mastery: [mastery(TOPIC_A, 0.9), mastery(TOPIC_B, 0.45)],
      attempts: [
        attempt("a1", "q-algebra", [TOPIC_A], 4, 4),
        attempt("a2", "q-mixed", [TOPIC_A, TOPIC_B], 2, 6),
      ],
    });

    expect(plan.topics[0]?.topicId).toBe(TOPIC_B);
    expect(plan.topics.find((topic) => topic.topicId === TOPIC_B)?.need).toBe("learn");
    expect(plan.steps[0]).toMatchObject({ activity: "learn", topicId: TOPIC_B });
    const bRecallIndex = plan.steps.findIndex((step) => step.activity === "recall" && step.topicId === TOPIC_B);
    const bPracticeIndex = plan.steps.findIndex((step) => step.activity === "practice" && step.topicId === TOPIC_B);
    expect(bRecallIndex).toBeGreaterThanOrEqual(0);
    expect(bRecallIndex).toBeLessThan(bPracticeIndex);
    expect(plan.steps.some((step) => step.activity === "recall" && step.topicId === TOPIC_A)).toBe(true);
    expect(plan.steps.some((step) => step.activity === "practice" && step.topicId === TOPIC_B)).toBe(true);
    expect(plan.steps.some((step) => step.activity === "practice" && step.topicId === TOPIC_A)).toBe(true);
    expect(plan.steps.at(-1)).toMatchObject({ activity: "paper", title: "Sit Spring mock" });
    expect(plan.steps.map((step) => step.activity)).not.toContain("video");

    const securePlan = buildMockStudyPlan({
      paper,
      questions: questions.slice(0, 1),
      topics,
      mastery: [mastery(TOPIC_A, 0.95)],
      attempts: [attempt("a-secure", "q-algebra", [TOPIC_A], 4, 4)],
    });
    expect(securePlan.steps.some((step) => step.activity === "recall" && step.topicId === TOPIC_A)).toBe(true);
  });
});
