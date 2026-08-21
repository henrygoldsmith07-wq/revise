import { describe, expect, it } from "vitest";
import { buildPlan } from "@/domain/planner";
import { computeFingerprint, fingerprintKey, replanDynamically } from "@/domain/replan";
import type {
  Availability,
  ExamDate,
  PlannedSession,
  Subject,
  Topic,
  TopicMastery,
} from "@/domain/types";

const NOW = new Date("2025-06-02T08:00:00.000Z"); // a Monday
const TODAY = "2025-06-02";

function ids() {
  let n = 0;
  return () => `id-${n++}`;
}

const topic = (id: string, subjectId: string): Topic => ({
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

const mastery = (topicId: string, subjectId: string, value: number): TopicMastery => ({
  topicId,
  subjectId,
  mastery: value,
  retention: value,
  confidence: value,
  cardsTotal: 5,
  cardsDue: 0,
  attempts: 3,
  accuracy: value,
  lastStudiedAt: null,
  weak: value < 0.55,
});

const subject = (id: string): Subject => ({
  id,
  qualificationId: "q",
  name: id,
  papers: [],
  gradeBoundaries: [
    { grade: "A", percent: 80 },
    { grade: "B", percent: 70 },
    { grade: "C", percent: 50 },
  ],
});

const everyDay = (minutes: number): Availability[] =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes }));

const baseInput = () => ({
  userId: "u",
  topics: [topic("m1", "maths"), topic("m2", "maths"), topic("p1", "physics")],
  subjects: [subject("maths"), subject("physics")],
  mastery: [mastery("m1", "maths", 0.4), mastery("m2", "maths", 0.4), mastery("p1", "physics", 0.9)],
  exams: [] as ExamDate[],
  availability: everyDay(90),
  sessionLengthMinutes: 30,
  subjectIds: ["maths", "physics"],
  targetGrades: {} as Record<string, string>,
  now: NOW,
  horizonDays: 7,
  idFactory: ids(),
});

describe("computeFingerprint", () => {
  it("is stable for identical inputs and changes when a replan-relevant field changes", () => {
    const a = computeFingerprint({
      exams: [{ id: "e1", userId: "u", subjectId: "maths", date: "2025-06-09", label: "Unit 3" }],
      targetGrades: { maths: "A" },
      availability: everyDay(90),
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
    });
    const same = computeFingerprint({
      exams: [{ id: "e1", userId: "u", subjectId: "maths", date: "2025-06-09", label: "Unit 3" }],
      targetGrades: { maths: "A" },
      availability: everyDay(90),
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
    });
    expect(fingerprintKey(a)).toBe(fingerprintKey(same));

    const moved = computeFingerprint({
      exams: [{ id: "e1", userId: "u", subjectId: "maths", date: "2025-06-16", label: "Unit 3" }],
      targetGrades: { maths: "A" },
      availability: everyDay(90),
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
    });
    expect(fingerprintKey(moved)).not.toBe(fingerprintKey(a));
  });
});

describe("replanDynamically", () => {
  it("is a no-op when nothing changed and nothing was missed", () => {
    const existing = buildPlan({ ...baseInput(), existing: [] });
    const result = replanDynamically({
      ...baseInput(),
      existing,
      previous: computeFingerprint(baseInput()),
    });
    expect(result.changed).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.summary).toBeNull();
    expect(result.plan).toEqual(existing);
  });

  it("rolls missed sessions forward and reports the reason", () => {
    const stale: PlannedSession = {
      id: "stale",
      userId: "u",
      date: "2025-05-30",
      startMinute: 960,
      minutes: 30,
      subjectId: "maths",
      activity: "practice",
      reason: "weak topic",
      status: "pending",
    };
    const result = replanDynamically({
      ...baseInput(),
      existing: [stale],
      previous: computeFingerprint(baseInput()),
    });
    expect(result.changed).toBe(true);
    expect(result.reasons).toContain("sessions-missed");
    expect(result.plan.find((s) => s.id === "stale")?.status).toBe("missed");
    expect(result.plan.some((s) => s.status === "pending" && s.date >= TODAY)).toBe(true);
    expect(result.summary).toContain("missed");
  });

  it("rebuilds when an exam date moves, preserving completed history", () => {
    const done: PlannedSession = {
      id: "done",
      userId: "u",
      date: "2025-06-01",
      startMinute: 960,
      minutes: 30,
      subjectId: "maths",
      activity: "flashcards",
      reason: "done",
      status: "done",
    };
    const previous = computeFingerprint(baseInput());
    const result = replanDynamically({
      ...baseInput(),
      exams: [{ id: "e1", userId: "u", subjectId: "maths", date: "2025-06-09", label: "Unit 3" }],
      existing: [done],
      previous,
    });
    expect(result.changed).toBe(true);
    expect(result.reasons).toContain("exam-changed");
    expect(result.plan.some((s) => s.id === "done")).toBe(true);
    expect(result.summary).toContain("exam");
  });

  it("reports a target-grade change as the trigger", () => {
    const previous = computeFingerprint(baseInput());
    const result = replanDynamically({
      ...baseInput(),
      targetGrades: { maths: "A" },
      existing: [],
      previous,
    });
    expect(result.changed).toBe(true);
    expect(result.reasons).toContain("target-changed");
    expect(result.summary).toContain("target grade");
  });
});

describe("buildPlan target-gap weighting", () => {
  it("gives a subject chasing a higher target more of the week", () => {
    const input = {
      ...baseInput(),
      mastery: [
        mastery("m1", "maths", 0.5),
        mastery("m2", "maths", 0.5),
        mastery("p1", "physics", 0.5),
      ],
      subjects: [subject("maths"), subject("physics")],
      targetGrades: { maths: "A", physics: "C" },
      availability: everyDay(180),
      sessionLengthMinutes: 30,
      horizonDays: 7,
      existing: [],
    };
    const plan = buildPlan(input);
    const maths = plan.filter((s) => s.subjectId === "maths").length;
    const physics = plan.filter((s) => s.subjectId === "physics").length;
    expect(maths).toBeGreaterThan(physics);
  });
});
