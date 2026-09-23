import { describe, expect, it } from "vitest";
import { examUrgency } from "@/domain/recommender";
import { buildPlan } from "@/domain/planner";
import {
  allocateDay,
  buildSubjectEvidence,
  breadthPhaseFactor,
  reviewBlocksNeeded,
  type AllocOpportunity,
} from "@/domain/subject-allocation";
import type { Availability, Card, ExamDate, Id, Mistake, PlannedSession, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2025-06-02T08:00:00.000Z"); // a Monday
const TODAY = "2025-06-02";

function ids() {
  let n = 0;
  return () => `id-${n++}`;
}

// --- evidence fixtures -------------------------------------------------------

function card(subjectId: string, overrides: Partial<Card> = {}): Card {
  return {
    id: `c-${Math.random()}`,
    userId: "u",
    subjectId,
    topicId: `${subjectId}.t1`,
    kind: "basic",
    front: "front",
    back: "back",
    tags: [],
    origin: "seed",
    due: TODAY,
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: 2, // Review
    lastReviewedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mistake(subjectId: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: `m-${Math.random()}`,
    userId: "u",
    subjectId,
    topicId: `${subjectId}.t1`,
    description: "missed it",
    category: "recall",
    marksLost: 1,
    resolved: false,
    createdAt: "2025-06-01T10:00:00.000Z",
    ...overrides,
  };
}

// --- allocator fixtures ------------------------------------------------------

function opp(subjectId: string, o: Partial<AllocOpportunity> = {}): AllocOpportunity {
  return {
    subjectId,
    dueCards: 0,
    overdueCards: 0,
    openMistakes: 0,
    recentLossMarks: 0,
    masteryAvg: 0.4,
    untouchedShare: 0,
    daysToExam: null,
    urgency: 1,
    targetBoost: 1,
    phase: "foundation",
    ...o,
  };
}

const sum = (m: Map<Id, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("buildSubjectEvidence", () => {
  it("counts review cards that are due and separates the overdue subset", () => {
    const cards: Card[] = [
      card("bio", { state: 2, due: "2025-06-02" }), // due today
      card("bio", { state: 2, due: "2025-05-30" }), // overdue
      card("bio", { state: 0, due: "2025-06-02" }), // New — never reviewed, not due
      card("bio", { state: 2, due: "2025-06-09" }), // future — not due yet
      card("bio", { state: 2, due: "2025-05-30", suspended: true }), // suspended
      card("bio", { state: 2, due: "2025-05-30", buriedUntil: "2025-06-03" }), // buried
      card("chem", { state: 3, due: "2025-06-01" }),
    ];
    const evidence = buildSubjectEvidence(cards, [], [], TODAY);
    expect(evidence.get("bio")).toEqual({
      subjectId: "bio",
      dueCards: 2,
      overdueCards: 1,
      openMistakes: 0,
      recentLossMarks: 0,
    });
    expect(evidence.get("chem")?.dueCards).toBe(1);
  });

  it("counts open mistakes and marks lost in the last seven days only", () => {
    const mistakes: Mistake[] = [
      mistake("bio"),
      mistake("bio", { resolved: true }),
      mistake("chem"),
    ];
    const old = "2025-05-20T10:00:00.000Z"; // older than 7 days before 2025-06-02
    const evidence = buildSubjectEvidence(
      [],
      mistakes,
      [
        {
          id: "a1",
          userId: "u",
          questionId: "q1",
          subjectId: "bio",
          topicIds: ["bio.t1"],
          answers: {},
          marked: [],
          awarded: 6,
          max: 10,
          feedback: "f",
          markedBy: "rubric",
          elapsedMs: 100,
          mode: "practice",
          createdAt: "2025-06-01T10:00:00.000Z",
        },
        {
          id: "a2",
          userId: "u",
          questionId: "q2",
          subjectId: "bio",
          topicIds: ["bio.t2"],
          answers: {},
          marked: [],
          awarded: 10,
          max: 10,
          feedback: "f",
          markedBy: "rubric",
          elapsedMs: 100,
          mode: "practice",
          createdAt: "2025-06-01T10:00:00.000Z",
        },
        {
          id: "a3",
          userId: "u",
          questionId: "q3",
          subjectId: "bio",
          topicIds: ["bio.t3"],
          answers: {},
          marked: [],
          awarded: 1,
          max: 5,
          feedback: "f",
          markedBy: "rubric",
          elapsedMs: 100,
          mode: "practice",
          createdAt: old,
        },
      ],
      TODAY,
    );
    const bio = evidence.get("bio")!;
    expect(bio.openMistakes).toBe(1); // resolved one ignored
    expect(bio.recentLossMarks).toBe(4); // 6/10 → 4 lost; perfect run → 0; old run ignored
    expect(evidence.get("chem")?.openMistakes).toBe(1);
    expect(evidence.get("chem")?.recentLossMarks).toBe(0);
  });
});

describe("reviewBlocksNeeded", () => {
  it("returns zero with nothing due and one block for any real backlog", () => {
    expect(reviewBlocksNeeded(0, 0)).toBe(0);
    expect(reviewBlocksNeeded(1, 0)).toBe(1);
    expect(reviewBlocksNeeded(18, 0)).toBe(1);
  });

  it("asks for more blocks when the backlog exceeds a block and caps at three", () => {
    expect(reviewBlocksNeeded(19, 0)).toBe(2);
    expect(reviewBlocksNeeded(60, 0)).toBe(3); // capped — never a whole day of one subject's reviews
  });

  it("weighs overdue cards heavier: same raw count, worse recency wins", () => {
    // 12 cards due today → 12 pressure → 1 block.
    expect(reviewBlocksNeeded(12, 0)).toBe(1);
    // 8 overdue + 2 today → 8×1.6 + 2 = 14.8 → still 1…
    expect(reviewBlocksNeeded(10, 8)).toBe(1);
    // …but heavy overdue pushes into a second block where fresh cards would not.
    expect(reviewBlocksNeeded(20, 20)).toBe(2);
    expect(reviewBlocksNeeded(20, 0)).toBe(2);
    expect(reviewBlocksNeeded(12, 12)).toBe(2); // pressure 19.2
    expect(reviewBlocksNeeded(15, 15)).toBe(2); // pressure 24
  });
});

describe("allocateDay — scarce window, several subjects", () => {
  it("gives the due backlog the window before any other work, and lets a small backlog keep its own block", () => {
    // The user's scenario: Biology + French + Maths share 90 minutes (3 blocks).
    const outcome = allocateDay(3, [
      opp("Biology", { dueCards: 24, recentLossMarks: 2, masteryAvg: 0.4, untouchedShare: 0.3 }), // needs 2 review blocks
      opp("French", { dueCards: 2, masteryAvg: 0.55, untouchedShare: 0.2 }), // needs 1
      opp("Maths", { masteryAvg: 0.95, untouchedShare: 0 }), // nothing due, nothing at risk
    ]);
    expect(outcome.fallback).toBe(false);
    expect(outcome.shares.get("Biology")).toBe(2);
    expect(outcome.shares.get("French")).toBe(1);
    expect(outcome.shares.get("Maths")).toBe(0);
    expect(sum(outcome.shares)).toBe(3);
    expect(outcome.notes[0]).toContain("Biology leads today");
    expect(outcome.notes[0]).toContain("24 cards due");
  });

  it("lets marks at risk outrank a secure subject when nothing is due", () => {
    const outcome = allocateDay(3, [
      opp("Biology", { recentLossMarks: 4, masteryAvg: 0.35 }), // losing marks right now
      opp("French", { masteryAvg: 0.5, untouchedShare: 0.2 }), // light breadth, no losses
      opp("Maths", { masteryAvg: 0.95, untouchedShare: 0 }), // secure
    ]);
    // Biology wins the return-ranked blocks, and the leftover keep-warm block
    // tops up the weakest subject (still Biology) rather than the secure one.
    expect((outcome.shares.get("Biology") ?? 0)).toBeGreaterThan(outcome.shares.get("Maths") ?? 0);
    expect(outcome.shares.get("Maths")).toBe(0);
    expect(sum(outcome.shares)).toBe(3);
  });

  it("prefers the more overdue subject when both carry the same raw load", () => {
    const outcome = allocateDay(1, [
      opp("Biology", { dueCards: 8, overdueCards: 0 }),
      opp("French", { dueCards: 8, overdueCards: 8 }),
    ]);
    expect(outcome.shares.get("French")).toBe(1);
    expect(outcome.shares.get("Biology")).toBe(0);
  });

  it("scales the claim by exam proximity", () => {
    const outcome = allocateDay(1, [
      opp("Biology", { dueCards: 2, daysToExam: 60, urgency: examUrgency(60) }),
      opp("French", { dueCards: 2, daysToExam: 5, urgency: examUrgency(5) }),
    ]);
    // French's exam is 5 days out; both subjects need one review block.
    expect(outcome.shares.get("French")).toBe(1);
    expect(outcome.shares.get("Biology")).toBe(0);
  });

  it("names the outranked subject honestly: it waits, it is not idle", () => {
    const outcome = allocateDay(1, [
      opp("Biology", { dueCards: 60, masteryAvg: 0.3 }),
      opp("Chemistry", { dueCards: 4, masteryAvg: 0.5 }), // has a real (small) backlog
    ]);
    expect(outcome.shares.get("Biology")).toBe(1);
    expect(outcome.shares.get("Chemistry")).toBe(0);
    expect(outcome.notes.some((n) => n.includes("Chemistry waits") && n.includes("Biology takes the window"))).toBe(true);
    expect(outcome.notes.some((n) => n.includes("nothing due"))).toBe(false);
  });

  it("never lets one subject's backlog eat an entire multi-subject day", () => {
    const outcome = allocateDay(4, [
      opp("Biology", { dueCards: 60, masteryAvg: 0.3 }), // review cap 3
      opp("French", { dueCards: 2, masteryAvg: 0.5 }),
    ]);
    expect(outcome.shares.get("Biology")).toBe(3);
    expect(outcome.shares.get("French")).toBe(1);
    expect(sum(outcome.shares)).toBe(4);
  });

  it("falls back (no opinion) when nothing distinguishes the subjects", () => {
    const outcome = allocateDay(3, [
      opp("Biology", { masteryAvg: 0.3 }),
      opp("French", { masteryAvg: 0.6 }),
      opp("Maths", { masteryAvg: 0.95 }),
    ]);
    expect(outcome.fallback).toBe(true);
    expect(sum(outcome.shares)).toBe(0);
  });

  it("handles the degenerate cases", () => {
    expect(allocateDay(0, [opp("Bio")]).fallback).toBe(true);
    expect(allocateDay(3, []).fallback).toBe(true);
  });
});

describe("breadthPhaseFactor", () => {
  it("keeps first-pass breadth valuable until the countdown forbids it", () => {
    expect(breadthPhaseFactor("foundation")).toBe(1);
    expect(breadthPhaseFactor("application")).toBe(1);
    expect(breadthPhaseFactor("technique")).toBe(0.4);
    expect(breadthPhaseFactor("final")).toBe(0);
  });
});

// --- planner integration -----------------------------------------------------

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

const mondayOnly = (minutes: number): Availability[] =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: weekday === 1 ? minutes : 0 }));

describe("buildPlan with evidence", () => {
  const topics = [topic("t1", "maths"), topic("t2", "maths"), topic("t3", "physics")];
  const base = {
    userId: "u",
    topics,
    mastery: [mastery("t1", "maths", 0.1), mastery("t2", "maths", 0.1), mastery("t3", "physics", 0.9)],
    exams: [] as ExamDate[],
    availability: mondayOnly(90),
    sessionLengthMinutes: 30,
    subjectIds: ["maths", "physics"],
    horizonDays: 7,
    now: NOW,
    idFactory: ids(),
  };

  const planFor = (plan: PlannedSession[]) =>
    plan.filter((s) => s.date === TODAY).sort((a, b) => a.startMinute - b.startMinute);

  it("hands a due backlog its review blocks and opens with review, not deficit share", () => {
    // Physics is secure (0.9) but has 30 cards due; maths is weak but nothing is due.
    const evidence = new Map<Id, { subjectId: Id; dueCards: number; overdueCards: number; openMistakes: number; recentLossMarks: number }>([
      ["physics", { subjectId: "physics", dueCards: 30, overdueCards: 0, openMistakes: 0, recentLossMarks: 0 }],
    ]);
    const plan = planFor(buildPlan({ ...base, evidence }));
    const physics = plan.filter((s) => s.subjectId === "physics");
    const maths = plan.filter((s) => s.subjectId === "maths");
    expect(physics.length).toBeGreaterThan(maths.length);
    expect(physics[0]?.activity).toBe("flashcards"); // reviews first
    expect(physics.filter((s) => s.activity === "flashcards").length).toBeGreaterThanOrEqual(2);
  });

  it("does not open with a hollow review block when evidence says nothing is due", () => {
    const evidence = new Map<Id, never>(); // present but empty: the subject truly has nothing due
    const plan = planFor(
      buildPlan({
        ...base,
        subjectIds: ["maths"],
        mastery: [mastery("t1", "maths", 0.4), mastery("t2", "maths", 0.4)],
        evidence,
      }),
    );
    expect(plan.length).toBeGreaterThan(0);
    for (const session of plan) expect(session.activity).not.toBe("flashcards");
  });

  it("keeps the review-first opening when evidence is absent (unchanged behaviour)", () => {
    const plan = planFor(buildPlan({ ...base, subjectIds: ["maths"] }));
    expect(plan[0]?.activity).toBe("flashcards");
  });
});
