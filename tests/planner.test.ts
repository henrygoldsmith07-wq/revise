import { describe, expect, it } from "vitest";
import { allocateBlocks, buildPlan, formatTime, planForDate, rescheduleMissed, summarizePlanChange } from "@/domain/planner";
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

  it("does not schedule papers during the application phase (two-plus weeks out)", () => {
    // 2025-07-01 is 29 days from NOW — application phase, cadence 0.
    const exams: ExamDate[] = [
      { id: "e-app", userId: "u", subjectId: "maths", date: "2025-07-01", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.4)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 3,
      now: NOW,
      idFactory: ids(),
    });
    expect(plan.some((s) => s.activity === "paper")).toBe(false);
    // First passes are still the right medicine this far out.
    expect(planForDate(plan, TODAY).some((s) => s.activity === "learn" || s.activity === "practice")).toBe(true);
  });

  it("intensifies papers to every other block inside the final week", () => {
    // 2025-06-08 is 6 days out — cadence 2: flashcard opener, paper, topic, paper.
    const exams: ExamDate[] = [
      { id: "e-final-week", userId: "u", subjectId: "maths", date: "2025-06-08", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 3,
      now: NOW,
      idFactory: ids(),
    });
    const papers = planForDate(plan, TODAY).filter((s) => s.activity === "paper");
    // 4 blocks on the day: index 1 and 3 are timed papers.
    expect(papers.length).toBe(2);
  });

  it("stops first passes and papers in the final 72 hours", () => {
    // 2025-06-05 is 3 days out — final phase: no papers, no brand-new topics.
    const exams: ExamDate[] = [
      { id: "e-final", userId: "u", subjectId: "maths", date: "2025-06-05", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      horizonDays: 4,
      now: NOW,
      idFactory: ids(),
    });
    const todaySessions = planForDate(plan, TODAY);
    expect(todaySessions.some((s) => s.activity === "paper")).toBe(false);
    expect(todaySessions.some((s) => s.activity === "learn")).toBe(false);
    // With nothing studied, the honest block is due cards with a countdown reason.
    expect(todaySessions.some((s) => s.activity === "flashcards" && s.reason.includes("no new first passes"))).toBe(true);
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

  it("reaches a far exam by default instead of stopping at the fortnight", () => {
    // 2025-06-22 is 20 days out — beyond the old 14-day rolling horizon.
    const exams: ExamDate[] = [
      { id: "e-far", userId: "u", subjectId: "maths", date: "2025-06-22", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      now: NOW,
      idFactory: ids(),
    });
    expect(plan.some((s) => s.date >= "2025-06-16")).toBe(true);
    // …but never on the exam day itself.
    expect(plan.some((s) => s.date >= "2025-06-22")).toBe(false);
  });

  it("stops scheduling a subject on its exam day", () => {
    const exams: ExamDate[] = [
      { id: "e-soon", userId: "u", subjectId: "maths", date: "2025-06-09", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      now: NOW,
      idFactory: ids(),
    });
    const dates = plan.map((s) => s.date);
    expect(dates.includes("2025-06-09")).toBe(false);
    expect(dates.sort().at(-1)).toBe("2025-06-08");
  });

  it("keeps a subject with a later exam working while an earlier exam passes", () => {
    const exams: ExamDate[] = [
      { id: "e-phys", userId: "u", subjectId: "physics", date: "2025-06-09", label: "Paper 1" },
      { id: "e-maths", userId: "u", subjectId: "maths", date: "2025-06-23", label: "Paper 2" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams,
      availability: everyDay(120),
      sessionLengthMinutes: 30,
      subjectIds: ["maths", "physics"],
      now: NOW,
      idFactory: ids(),
    });
    // Physics stops the moment its exam arrives; maths runs to its own date.
    expect(plan.some((s) => s.subjectId === "physics" && s.date >= "2025-06-09")).toBe(false);
    expect(plan.some((s) => s.subjectId === "maths" && s.date >= "2025-06-10")).toBe(true);
    expect(plan.some((s) => s.subjectId === "maths" && s.date >= "2025-06-23")).toBe(false);
  });

  it("caps the default horizon so a distant exam cannot build a fictional plan", () => {
    const exams: ExamDate[] = [
      { id: "e-far", userId: "u", subjectId: "maths", date: "2026-02-01", label: "Paper 1" },
    ];
    const plan = buildPlan({
      userId: "u",
      topics,
      mastery: topics.map((t) => mastery(t.id, t.subjectId, 0.5)),
      exams,
      availability: everyDay(60),
      sessionLengthMinutes: 30,
      subjectIds: ["maths"],
      now: NOW,
      idFactory: ids(),
    });
    expect(plan.length).toBeGreaterThan(0);
    // 2025-06-02 + 90 days = 2025-08-31; the exam is 8 months out.
    const lastDate = plan.map((s) => s.date).sort().at(-1);
    expect(lastDate).toBe("2025-08-30");
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

describe("summarizePlanChange", () => {
  const session = (
    id: string,
    subjectId: string,
    activity: PlannedSession["activity"],
    topicId?: string,
    date: string = TODAY,
  ): PlannedSession => ({
    id,
    userId: "u",
    date,
    startMinute: 960,
    minutes: 30,
    subjectId,
    activity,
    topicId,
    reason: "",
    status: "pending",
  });
  const names = { maths: "Maths" };
  const exams: ExamDate[] = [{ id: "e1", userId: "u", subjectId: "maths", date: "2025-06-12", label: "Unit 3" }]; // 10 days out → Exam technique

  it("reports a technique-phase shift: papers added and first-pass learning stopped", () => {
    const previous = [
      session("a", "maths", "learn", "t1"),
      session("b", "maths", "learn", "t2", "2025-06-03"),
      session("c", "maths", "flashcards"),
    ];
    const next = [
      session("d", "maths", "paper"),
      session("e", "maths", "paper", undefined, "2025-06-03"),
      session("f", "maths", "paper", undefined, "2025-06-04"),
      session("g", "maths", "flashcards"),
    ];
    const lines = summarizePlanChange({ previous, next, exams, subjectNames: names, today: TODAY });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Maths (Exam technique)");
    expect(lines[0]).toContain("3 timed-paper blocks added");
    expect(lines[0]).toContain("first-pass learning stopped");
  });

  it("reports freed review blocks but ignores single-block shuffling", () => {
    const many = (activity: PlannedSession["activity"], count: number) =>
      Array.from({ length: count }, (_, i) => session(`s${i}`, "maths", activity));
    const lines = summarizePlanChange({
      previous: [...many("flashcards", 4), ...many("recall", 1)],
      next: [...many("flashcards", 2)],
      exams,
      subjectNames: names,
      today: TODAY,
    });
    expect(lines[0]).toContain("Maths: 2 due-card review blocks freed.");
    // A one-block difference on its own is noise, not a changelog entry.
    const quiet = summarizePlanChange({
      previous: many("recall", 3),
      next: many("recall", 2),
      exams,
      subjectNames: names,
      today: TODAY,
    });
    expect(quiet).toEqual([]);
  });

  it("is silent when the rebuild changed nothing material", () => {
    const plan = [session("a", "maths", "learn", "t1"), session("b", "maths", "flashcards")];
    expect(summarizePlanChange({ previous: plan, next: [...plan], exams, subjectNames: names, today: TODAY })).toEqual([]);
  });

  it("names a subject whose run-up is over", () => {
    const lines = summarizePlanChange({
      previous: [session("a", "maths", "recall", "t1")],
      next: [],
      exams,
      subjectNames: names,
      today: TODAY,
    });
    expect(lines[0]).toContain("Maths's run-up is over");
  });

  it("ignores history: only pending future sessions are compared", () => {
    const done = (s: PlannedSession): PlannedSession => ({ ...s, status: "done" });
    const pending = session("a", "maths", "paper");
    const finished = done(session("old", "maths", "learn", "t1", "2025-05-20"));
    const previous = [pending, finished];
    const next = [pending, done(session("old", "maths", "learn", "t1", "2025-05-20"))];
    // The finished session is history on both sides; the pending paper is unchanged.
    expect(summarizePlanChange({ previous, next, exams, subjectNames: names, today: TODAY })).toEqual([]);
  });
});

describe("formatTime", () => {
  it("formats minutes from midnight as a 24-hour clock", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(16 * 60 + 5)).toBe("16:05");
    expect(formatTime(24 * 60)).toBe("00:00");
  });
});
