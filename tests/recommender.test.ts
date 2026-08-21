import { describe, expect, it } from "vitest";
import { daysToExam, examUrgency, recommend } from "@/domain/recommender";
import { createCard } from "@/domain/scheduling";
import type { Card, ExamDate, Mistake, PlannedSession, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2025-06-02T17:00:00.000Z");
const TODAY = "2025-06-02";

const topic = (id: string, subjectId = "maths"): Topic => ({
  id,
  subjectId,
  unitId: "unit",
  title: `Topic ${id}`,
  order: 0,
  intrinsicDifficulty: 3,
  summary: "summary",
  keyPoints: ["point"],
  commonErrors: ["error"],
});

const mastery = (topicId: string, value: number, subjectId = "maths"): TopicMastery => ({
  topicId,
  subjectId,
  mastery: value,
  retention: value,
  confidence: value,
  cardsTotal: value === 0 ? 0 : 6,
  cardsDue: 0,
  attempts: value === 0 ? 0 : 3,
  accuracy: value,
  lastStudiedAt: null,
  weak: value > 0 && value < 0.55,
});

function dueCard(id: string, due: string, subjectId = "maths"): Card {
  return {
    ...createCard({ id, userId: "u", subjectId, topicId: "t1", front: "f", back: "b" }, NOW),
    due,
    state: 2,
  };
}

const base = {
  topics: [topic("t1")],
  mastery: [mastery("t1", 0.6)],
  cards: [] as Card[],
  mistakes: [] as Mistake[],
  exams: [] as ExamDate[],
  plan: [] as PlannedSession[],
  sessionLengthMinutes: 25,
  subjectIds: ["maths"],
  now: NOW,
};

describe("examUrgency and daysToExam", () => {
  it("counts only future exams, nearest first", () => {
    const exams: ExamDate[] = [
      { id: "past", userId: "u", subjectId: "maths", date: "2025-05-01", label: "old" },
      { id: "far", userId: "u", subjectId: "maths", date: "2025-08-01", label: "far" },
      { id: "near", userId: "u", subjectId: "maths", date: "2025-06-12", label: "near" },
    ];
    expect(daysToExam(exams, "maths", TODAY)).toBe(10);
    expect(daysToExam(exams, "physics", TODAY)).toBeNull();
  });

  it("rises smoothly as the exam approaches and never spikes", () => {
    expect(examUrgency(null)).toBe(1);
    expect(examUrgency(200)).toBeLessThan(examUrgency(30));
    expect(examUrgency(30)).toBeLessThan(examUrgency(5));
    expect(examUrgency(0)).toBe(2);
    expect(examUrgency(1)).toBeLessThanOrEqual(2);
  });
});

describe("recommend", () => {
  it("puts due reviews first when a backlog exists", () => {
    const result = recommend({
      ...base,
      cards: Array.from({ length: 25 }, (_, i) => dueCard(`c${i}`, "2025-05-28")),
    });
    expect(result[0].activity).toBe("flashcards");
    expect(result[0].reason).toContain("overdue");
  });

  it("surfaces mistake repair once mistakes accumulate", () => {
    const mistakes: Mistake[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      userId: "u",
      subjectId: "maths",
      topicId: "t1",
      marksLost: 1,
      description: "dropped marks",
      category: "method",
      resolved: false,
      createdAt: NOW.toISOString(),
    }));
    const result = recommend({ ...base, mistakes });
    expect(result.some((r) => r.activity === "mistakes")).toBe(true);
  });

  it("ignores resolved mistakes", () => {
    const mistakes: Mistake[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      userId: "u",
      subjectId: "maths",
      topicId: "t1",
      marksLost: 1,
      description: "fixed",
      category: "method",
      resolved: true,
      createdAt: NOW.toISOString(),
    }));
    expect(recommend({ ...base, mistakes }).some((r) => r.activity === "mistakes")).toBe(false);
  });

  it("routes never-studied topics to a first pass rather than remediation", () => {
    const result = recommend({
      ...base,
      topics: [topic("fresh")],
      mastery: [mastery("fresh", 0)],
    });
    const fresh = result.find((r) => r.topicId === "fresh");
    expect(fresh?.activity).toBe("learn");
  });

  it("targets the weakest topic for question practice", () => {
    const result = recommend({
      ...base,
      topics: [topic("weak"), topic("ok")],
      mastery: [mastery("weak", 0.2), mastery("ok", 0.5)],
    });
    const practice = result.filter((r) => r.activity === "practice");
    expect(practice[0].topicId).toBe("weak");
  });

  it("only suggests full papers when the subject is solid or the exam is close", () => {
    const notReady = recommend({ ...base, mastery: [mastery("t1", 0.3)] });
    expect(notReady.some((r) => r.activity === "paper")).toBe(false);

    const examSoon = recommend({
      ...base,
      mastery: [mastery("t1", 0.3)],
      exams: [{ id: "e", userId: "u", subjectId: "maths", date: "2025-06-10", label: "Unit 3" }],
    });
    expect(examSoon.some((r) => r.activity === "paper")).toBe(true);
  });

  it("boosts an activity that is already in today's plan", () => {
    const plan: PlannedSession[] = [
      {
        id: "p1",
        userId: "u",
        date: TODAY,
        startMinute: 1020,
        minutes: 25,
        subjectId: "maths",
        topicId: "t1",
        activity: "practice",
        reason: "planned",
        status: "pending",
      },
    ];
    const withoutPlan = recommend({ ...base, mastery: [mastery("t1", 0.3)] });
    const withPlan = recommend({ ...base, mastery: [mastery("t1", 0.3)], plan });

    const before = withoutPlan.find((r) => r.activity === "practice")!.score;
    const after = withPlan.find((r) => r.activity === "practice")!;
    expect(after.score).toBeGreaterThan(before);
    expect(after.plannedSessionId).toBe("p1");
  });

  it("scales everything by exam proximity", () => {
    const calm = recommend({ ...base, cards: [dueCard("c1", TODAY)] })[0].score;
    const urgent = recommend({
      ...base,
      cards: [dueCard("c1", TODAY)],
      exams: [{ id: "e", userId: "u", subjectId: "maths", date: "2025-06-05", label: "soon" }],
    })[0].score;
    expect(urgent).toBeGreaterThan(calm);
  });

  it("never recommends a subject the student has dropped", () => {
    const result = recommend({
      ...base,
      cards: [dueCard("c1", TODAY, "physics")],
      subjectIds: ["maths"],
    });
    expect(result.every((r) => r.subjectId === "maths")).toBe(true);
  });

  it("returns results sorted by score with no duplicate activities", () => {
    const result = recommend({
      ...base,
      cards: Array.from({ length: 10 }, (_, i) => dueCard(`c${i}`, TODAY)),
      topics: [topic("t1"), topic("t2")],
      mastery: [mastery("t1", 0.3), mastery("t2", 0)],
    });
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const keys = result.map((r) => `${r.activity}:${r.subjectId}:${r.topicId ?? "-"}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("always gives a human-readable reason", () => {
    const result = recommend({ ...base, cards: [dueCard("c1", TODAY)] });
    for (const rec of result) {
      expect(rec.reason.length).toBeGreaterThan(10);
    }
  });
});
