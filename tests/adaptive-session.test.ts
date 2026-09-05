import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_SESSION_MINUTES,
  buildAdaptiveSession,
  scoreAdaptiveTopic,
} from "@/domain/adaptive-session";
import type { Card, ExamDate, Mistake, Question, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const SUBJECT = "bio";
const TOPIC = "bio.respiration";

function topic(id = TOPIC, order = 1): Topic {
  return {
    id,
    subjectId: SUBJECT,
    unitId: "bio.unit-1",
    title: id === TOPIC ? "Respiration" : "Transport",
    order,
    intrinsicDifficulty: 3,
    summary: "How cells release usable energy.",
    keyPoints: ["ATP is regenerated through linked reactions."],
    commonErrors: ["Confusing aerobic and anaerobic pathways."],
  };
}

function card(id: string, due = "2026-09-01"): Card {
  return {
    id,
    userId: "u",
    subjectId: SUBJECT,
    topicId: TOPIC,
    kind: "basic",
    front: "What is ATP?",
    back: "The cell's immediate energy currency.",
    tags: [],
    origin: "seed",
    due,
    stability: 2,
    difficulty: 5,
    reps: 2,
    lapses: 1,
    state: 2,
    lastReviewedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

function question(id: string, difficulty: 1 | 2 | 3 | 4 | 5): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    kind: "short",
    stem: `Question ${id}`,
    parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 2, markScheme: ["ATP"], modelAnswer: "ATP" }],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty,
    origin: difficulty >= 4 ? "past-paper" : "seed",
    createdAt: NOW.toISOString(),
  };
}

function mistake(id: string): Mistake {
  return {
    id,
    userId: "u",
    subjectId: SUBJECT,
    topicId: TOPIC,
    marksLost: 2,
    description: "You treated oxygen as a reactant in the wrong stage.",
    category: "interpretation",
    resolved: false,
    createdAt: "2026-09-04T12:00:00.000Z",
  };
}

function mastery(value: number, overrides: Partial<TopicMastery> = {}): TopicMastery {
  return {
    topicId: TOPIC,
    subjectId: SUBJECT,
    mastery: value,
    retention: value,
    confidence: value,
    cardsTotal: 3,
    cardsDue: 1,
    attempts: 2,
    accuracy: value,
    lastStudiedAt: "2026-08-20T12:00:00.000Z",
    weak: value < 0.55,
    ...overrides,
  };
}

const exam: ExamDate = { id: "exam", userId: "u", subjectId: SUBJECT, date: "2026-09-20", label: "Paper 1" };

describe("adaptive session optimizer", () => {
  it("combines FSRS, mastery, mistakes, exam timing and capability into one score", () => {
    const base = scoreAdaptiveTopic({
      topic: topic(),
      cards: [],
      reviewLogs: [],
      questions: [],
      attempts: [],
      mistakes: [],
      mastery: mastery(0.7, { cardsTotal: 0, cardsDue: 0, attempts: 0, lastStudiedAt: null }),
      exams: [],
      now: NOW,
    });
    const pressured = scoreAdaptiveTopic({
      topic: topic(),
      cards: [card("c1")],
      reviewLogs: [],
      questions: [question("q1", 3)],
      attempts: [],
      mistakes: [mistake("m1")],
      mastery: mastery(0.2),
      exams: [exam],
      now: NOW,
    });

    expect(pressured.score).toBeGreaterThan(base.score);
    expect(pressured.evidence.factors.fsrs).toBeGreaterThan(0);
    expect(pressured.evidence.factors.mastery).toBeGreaterThan(base.evidence.factors.mastery);
    expect(pressured.evidence.factors.mistakes).toBeGreaterThan(0);
    expect(pressured.evidence.factors.examProximity).toBeGreaterThan(0);
    expect(pressured.evidence.focusState).toBe("unknown");
  });

  it("builds the full adaptive ladder when the evidence supports it", () => {
    const plan = buildAdaptiveSession({
      topics: [topic()],
      subjectIds: [SUBJECT],
      cards: [card("c1"), card("c2"), card("c3")],
      reviewLogs: [],
      questions: [question("q1", 1), question("q2", 3), question("q3", 5)],
      attempts: [],
      mistakes: [mistake("m1")],
      mastery: [mastery(0.25)],
      exams: [exam],
      targetMinutes: ADAPTIVE_SESSION_MINUTES,
      now: NOW,
    });

    expect(plan).not.toBeNull();
    expect(plan!.totalMinutes).toBe(20);
    expect(plan!.steps.map((step) => step.kind)).toEqual([
      "overdue-retrieval",
      "misconception-repair",
      "explanation",
      "supported-practice",
      "independent-application",
      "transfer",
      "delayed-retrieval",
    ]);
    expect(plan!.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(20);
    expect(plan!.steps[0].cardIds).toEqual(["c1", "c2", "c3"]);
    expect(plan!.steps[0].href).toContain("limit=3");
    expect(plan!.steps[1].href).toContain("limit=1");
    expect(plan!.steps.at(-1)!.cardIds).toEqual(["c1", "c2", "c3"]);
  });

  it("does not create a due-card-only queue when nothing is due", () => {
    const plan = buildAdaptiveSession({
      topics: [topic()],
      subjectIds: [SUBJECT],
      cards: [],
      reviewLogs: [],
      questions: [question("q1", 2), question("q2", 4)],
      attempts: [],
      mistakes: [],
      mastery: [mastery(0)],
      exams: [],
      now: NOW,
    });

    expect(plan!.evidence.dueCount).toBe(0);
    expect(plan!.steps.some((step) => step.kind === "explanation")).toBe(true);
    expect(plan!.steps.some((step) => step.kind === "supported-practice")).toBe(true);
    expect(plan!.steps.at(-1)!.kind).toBe("delayed-retrieval");
    expect(plan!.totalMinutes).toBe(20);
  });

  it("pins a requested topic for a resumed route and clamps short budgets", () => {
    const other = topic("bio.transport", 2);
    const plan = buildAdaptiveSession({
      topics: [topic(), other],
      subjectIds: [SUBJECT],
      cards: [card("c1")],
      reviewLogs: [],
      questions: [question("q1", 2)],
      attempts: [],
      mistakes: [],
      mastery: [mastery(0.4), { ...mastery(0.8), topicId: other.id }],
      exams: [],
      targetMinutes: 5,
      topicId: other.id,
      now: NOW,
    });

    expect(plan!.topicId).toBe(other.id);
    expect(plan!.targetMinutes).toBe(12);
    expect(plan!.totalMinutes).toBe(12);
  });

  it("lets a near exam and low mastery beat a merely due topic", () => {
    const dueTopic = topic("bio.due", 1);
    const examTopic = {
      ...topic("chem.exam", 2),
      subjectId: "chem",
      unitId: "chem.unit-1",
      title: "Electrolysis",
    };
    const dueCards = [card("d1"), card("d2"), card("d3")].map((entry) => ({
      ...entry,
      subjectId: dueTopic.subjectId,
      topicId: dueTopic.id,
    }));
    const plan = buildAdaptiveSession({
      topics: [dueTopic, examTopic],
      subjectIds: ["bio", "chem"],
      cards: dueCards,
      reviewLogs: [],
      questions: [],
      attempts: [],
      mistakes: [],
      mastery: [
        { ...mastery(0.95), topicId: dueTopic.id },
        { ...mastery(0.1), topicId: examTopic.id, subjectId: "chem" },
      ],
      exams: [{ ...exam, subjectId: "chem", date: "2026-09-06" }],
      now: NOW,
    });

    expect(plan!.topicId).toBe(examTopic.id);
    expect(plan!.evidence.factors.examProximity).toBe(1);
    expect(plan!.evidence.factors.mastery).toBeGreaterThan(0.8);
  });
});
