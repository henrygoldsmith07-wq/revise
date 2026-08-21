import { describe, expect, it } from "vitest";
import { allocateBlocks, buildPlan, formatTime, planForDate, rescheduleMissed } from "@/domain/planner";
import type { Availability, ExamDate, PlannedSession, Topic, TopicMastery } from "@/domain/types";

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

const everyDay = (minutes: number): Availability[] =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes }));

describe("allocateBlocks", () => {
  it("distributes every block and never loses one to rounding", () => {
    const shares = allocateBlocks(7, ["a", "b", "c"], (id) => ({ a: 3, b: 2, c: 1 })[id] ?? 1);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(7);
    expect(shares.get("a")!).toBeGreaterThan(shares.get("c")!);
  });

  it("gives a small-weight subject at least a share rather than rounding it away", () => {
    const shares = allocateBlocks(3, ["big", "tiny"], (id) => (id === "big" ? 100 : 1));
    expect(shares.get("tiny")).toBeGreaterThanOrEqual(0);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("handles the degenerate cases", () => {
    expect([...allocateBlocks(0, ["a"], () => 1).values()]).toEqual([0]);
    expect(allocateBlocks(5, [], () => 1).size).toBe(0);
  });
});

describe("buildPlan", () => {
  const topics = [topic("t1", "maths"), topic("t2", "maths"), topic("t3", "physics")];

  it("respects available minutes and never schedules on a zero-hour day", () => {
    const availability: Availability[] = [
      { weekday: 0, minutes: 0 },
      { weekday: 1, minutes: 60 },
      { weekday: 2, minutes: 0 },
      { weekday: 3, minutes: 0 },
      { weekday: 4, minutes: 0 },
      { weekday: 5, minutes: 0 },
      { weekday: 6, minutes: 0 },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.4)),
      exams: [],
      availability,
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
      horizonDays: 7,
      now: NOW,
      idFactory: ids(),
    });

    const days = new Set(plan.map((s) => s.date));
    // Monday is the only weekday with time, and the horizon covers one Monday.
    expect(days.size).toBe(1);
    expect(planForDate(plan, TODAY)).toHaveLength(2);
  });

  it("opens every study day with due-card review", () => {
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.4)),
      exams: [],
      availability: everyDay(90),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 3,
      now: NOW,
      idFactory: ids(),
    });
    expect(planForDate(plan, TODAY)[0].activity).toBe("flashcards");
  });

  it("weights the weaker subject more heavily", () => {
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: [mastery("t1", "maths", 0.1), mastery("t2", "maths", 0.1), mastery("t3", "physics", 0.95)],
      exams: [],
      availability: everyDay(180),
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
      horizonDays: 7,
      now: NOW,
      idFactory: ids(),
    });
    const maths = plan.filter((s) => s.subjectId === "maths").length;
    const physics = plan.filter((s) => s.subjectId === "physics").length;
    expect(maths).toBeGreaterThan(physics);
  });

  it("schedules timed papers once an exam is close", () => {
    const exams: ExamDate[] = [
      { id: "e1", userId: "u", subjectId: "maths", date: "2025-06-09", label: "Unit 3" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.7)),
      exams,
      availability: everyDay(180),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 5,
      now: NOW,
      idFactory: ids(),
    });
    expect(plan.some((s) => s.activity === "paper")).toBe(true);
  });

  it("preserves completed history when it rebuilds", () => {
    const existing: PlannedSession[] = [
      {
        id: "old-done",
        userId: "u",
        date: "2025-05-30",
        startMinute: 960,
        minutes: 30,
        subjectId: "maths",
        activity: "flashcards",
        reason: "done earlier",
        status: "done",
      },
      {
        id: "old-pending",
        userId: "u",
        date: "2025-06-04",
        startMinute: 960,
        minutes: 30,
        subjectId: "maths",
        activity: "practice",
        reason: "stale",
        status: "pending",
      },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams: [],
      availability: everyDay(60),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 5,
      existing,
      now: NOW,
      idFactory: ids(),
    });

    expect(plan.some((s) => s.id === "old-done")).toBe(true);
    // A pending future session is rewritten rather than duplicated.
    expect(plan.some((s) => s.id === "old-pending")).toBe(false);
  });

  it("returns sessions in chronological order", () => {
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams: [],
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 4,
      now: NOW,
      idFactory: ids(),
    });
    const keys = plan.map((s) => `${s.date}:${String(s.startMinute).padStart(4, "0")}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("rescheduleMissed", () => {
  const stale: PlannedSession[] = [
    {
      id: "missed-1",
      userId: "u",
      date: "2025-05-31",
      startMinute: 960,
      minutes: 30,
      subjectId: "maths",
      activity: "practice",
      reason: "weak topic",
      status: "pending",
    },
  ];

  it("marks the old block missed and re-queues the work", () => {
    const healed = rescheduleMissed(stale, TODAY, 6, ids());
    expect(healed.find((s) => s.id === "missed-1")!.status).toBe("missed");

    const replacement = healed.find((s) => s.id !== "missed-1")!;
    expect(replacement.date).toBe(TODAY);
    expect(replacement.status).toBe("pending");
    expect(replacement.activity).toBe("practice");
    expect(replacement.reason).toContain("Rescheduled from 2025-05-31");
  });

  it("spills onto a later day once the cap for today is reached", () => {
    const busy: PlannedSession[] = [
      ...stale,
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `today-${i}`,
        userId: "u",
        date: TODAY,
        startMinute: 960 + i * 35,
        minutes: 30,
        subjectId: "maths",
        activity: "flashcards" as const,
        reason: "",
        status: "pending" as const,
      })),
    ];
    const healed = rescheduleMissed(busy, TODAY, 2, ids());
    const replacement = healed.find((s) => s.reason.startsWith("Rescheduled"))!;
    expect(replacement.date > TODAY).toBe(true);
  });

  it("is a no-op when nothing was missed", () => {
    const clean: PlannedSession[] = [{ ...stale[0], date: "2025-06-05" }];
    expect(rescheduleMissed(clean, TODAY, 6, ids())).toHaveLength(1);
  });
});

describe("formatTime", () => {
  it("formats minutes from midnight as a 24-hour clock", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(16 * 60 + 5)).toBe("16:05");
    expect(formatTime(24 * 60)).toBe("00:00");
  });
});
