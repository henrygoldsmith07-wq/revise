import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createCard,
  gradeCard,
  previewIntervals,
  forgettingCurve,
  retrievability,
  isDue,
  toDateOnly,
} from "../src/domain/scheduling";
import { computeTopicMastery, bayesianMastery, priorRemaining, weakTopics } from "../src/domain/mastery";
import { sessionFatigue, circadianFatigue, fatigueFactor, FATIGUE_FLOOR } from "../src/domain/fatigue";
import type { Attempt, Card, Id, Mistake, RecallGrade, ReviewLog, Topic } from "../src/domain/types";

// ---------------------------------------------------------------------------
// Property-based testing for the domain core.
//
// Unit tests pin specific cases; these generate thousands of chaotic histories
// (50 "Again"s in a row, 4-year gaps, random grade soup) and assert the
// mathematical invariants that must hold for *every* history: no NaNs, no
// negative stability, mastery in [0,1], monotone fatigue, converging priors.
// A violation here is a real bug in the learning maths, not a test flake.
// ---------------------------------------------------------------------------

const GRADES: RecallGrade[] = ["again", "hard", "good", "easy"];

/** Deterministic card factory — fast-check seeds its own randomness. */
function makeCard(id: string, now: Date): Card {
  return createCard(
    { id, userId: "u1", subjectId: "s1", topicId: "t1", front: "f", back: "b", origin: "manual" },
    now,
  );
}

/** Drive a card through `events` (grade + days-since-last-review) chronologically. */
function driveCard(card: Card, events: { grade: RecallGrade; gap: number }[], start: Date): Card {
  let current = card;
  let t = start.getTime();
  for (const event of events) {
    t += event.gap * 86_400_000;
    current = gradeCard(current, event.grade, new Date(t));
  }
  return current;
}

/** Grade + non-negative gap always travel together: independent arrays shrink
 *  unevenly and produce undefined gaps. Gaps are ≥ 0 — you cannot review
 *  before you last reviewed, and ts-fsrs rejects negative delta_t. */
const arbitraryEvents = fc.array(
  fc.record({
    grade: fc.constantFrom(...GRADES),
    gap: fc.integer({ min: 0, max: 1_500 }),
  }),
  { maxLength: 60 },
);

describe("FSRS scheduling invariants under chaotic histories", () => {
  it("stability, difficulty, reps and lapses stay finite and non-negative", () => {
    fc.assert(
      fc.property(arbitraryEvents, (events) => {
        const start = new Date("2024-01-01T12:00:00Z");
        const card = driveCard(makeCard("card", start), events, start);
        expect(Number.isFinite(card.stability)).toBe(true);
        expect(Number.isFinite(card.difficulty)).toBe(true);
        expect(card.stability).toBeGreaterThanOrEqual(0);
        expect(card.difficulty).toBeGreaterThanOrEqual(0);
        expect(card.reps).toBeGreaterThanOrEqual(0);
        expect(card.lapses).toBeGreaterThanOrEqual(0);
        expect(card.lapses).toBeLessThanOrEqual(card.reps);
      }),
      { numRuns: 1_000 },
    );
  });

  it("the due date is always a valid ISO date, never NaN", () => {
    fc.assert(
      fc.property(arbitraryEvents, (events) => {
        const start = new Date("2024-01-01T12:00:00Z");
        const card = driveCard(makeCard("card", start), events, start);
        expect(/^\d{4}-\d{2}-\d{2}$/.test(card.due)).toBe(true);
        expect(Number.isNaN(new Date(card.due).getTime())).toBe(false);
      }),
      { numRuns: 1_000 },
    );
  });

  it("retrievability and the forgetting curve stay in [0,1] for any elapsed time", () => {
    fc.assert(
      fc.property(
        arbitraryEvents,
        fc.integer({ min: 0, max: 4_000 }),
        (events, elapsedDays) => {
          const start = new Date("2024-01-01T12:00:00Z");
          const card = driveCard(makeCard("card", start), events, start);
          const r = retrievability(card, new Date(start.getTime() + elapsedDays * 86_400_000));
          expect(Number.isFinite(r)).toBe(true);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("the forgetting curve is monotonically decreasing in elapsed days", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3_650 }),
        fc.integer({ min: 1, max: 3_650 }),
        (d1, d2) => {
          const [a, b] = [Math.min(d1, d2), Math.max(d1, d2)];
          const s = fc.sample(fc.integer({ min: 1, max: 90 }), { numRuns: 1 })[0] ?? 10;
          expect(forgettingCurve(b, s)).toBeLessThanOrEqual(forgettingCurve(a, s));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("50 'Again's in a row never corrupt the card (lapse storm)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const start = new Date("2024-01-01T12:00:00Z");
        const card = driveCard(
          makeCard("card", start),
          Array.from({ length: n }, () => ({ grade: "again" as RecallGrade, gap: 0 })),
          start,
        );
        expect(Number.isFinite(card.stability)).toBe(true);
        expect(card.stability).toBeGreaterThanOrEqual(0);
        expect(card.difficulty).toBeGreaterThanOrEqual(0);
        expect(/^\d{4}-\d{2}-\d{2}$/.test(card.due)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("a 4-year wait then a grade never produces NaN or negative state", () => {
    fc.assert(
      fc.property(fc.constantFrom(...GRADES), (grade) => {
        const start = new Date("2020-01-01T12:00:00Z");
        const card = gradeCard(makeCard("card", start), grade, new Date("2024-01-01T12:00:00Z"));
        expect(Number.isFinite(card.stability)).toBe(true);
        expect(Number.isFinite(card.difficulty)).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("previewIntervals are finite, positive and ordered again ≤ hard ≤ good ≤ easy", () => {
    fc.assert(
      fc.property(arbitraryEvents, (events) => {
        const start = new Date("2024-01-01T12:00:00Z");
        const card = driveCard(makeCard("card", start), events, start);
        const p = previewIntervals(card, new Date());
        expect(p.again).toBeLessThanOrEqual(p.hard);
        expect(p.hard).toBeLessThanOrEqual(p.good);
        expect(p.good).toBeLessThanOrEqual(p.easy);
        expect(p.again).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });
});

// --- mastery invariants ------------------------------------------------------

function arbHistory() {
  return fc
    .record({
      cardCount: fc.integer({ min: 0, max: 40 }),
      logCount: fc.integer({ min: 0, max: 40 }),
      attemptCount: fc.integer({ min: 0, max: 15 }),
      mistakeCount: fc.integer({ min: 0, max: 8 }),
    })
    .map(({ cardCount, logCount, attemptCount, mistakeCount }) => {
      const start = new Date("2024-06-01T12:00:00Z");
      const cards: Card[] = [];
      for (let i = 0; i < cardCount; i++) {
        const events: { grade: RecallGrade; gap: number }[] = [];
        const n = (i * 7) % 9;
        for (let g = 0; g < n; g++) {
          events.push({ grade: GRADES[(i + g) % 4], gap: (i * 13 + g * 29) % 200 });
        }
        cards.push(driveCard(makeCard(`c${i}`, start), events, start));
      }
      const logs: ReviewLog[] = Array.from({ length: logCount }, (_, i) => ({
        id: `l${i}`,
        userId: "u1",
        cardId: `c${i % Math.max(1, cardCount)}`,
        topicId: "t0",
        grade: GRADES[i % 4],
        elapsedMs: 5_000,
        reviewedAt: start.toISOString(),
      }));
      const attempts: Attempt[] = Array.from({ length: attemptCount }, (_, i) => ({
        id: `a${i}`,
        userId: "u1",
        questionId: `q${i}`,
        subjectId: "s1",
        topicIds: ["t0"],
        answers: {},
        marked: [],
        awarded: (i * 3) % 7,
        max: 8,
        feedback: "",
        markedBy: "rubric",
        elapsedMs: 60_000,
        mode: "practice",
        createdAt: start.toISOString(),
      }));
      const mistakes: Mistake[] = Array.from({ length: mistakeCount }, (_, i) => ({
        id: `m${i}`,
        userId: "u1",
        subjectId: "s1",
        topicId: "t0",
        marksLost: 1,
        description: "d",
        category: "recall",
        resolved: i % 2 === 1,
        createdAt: start.toISOString(),
      }));
      return { topics: [arbTopicValue(0)], cards, reviewLogs: logs, attempts, mistakes };
    });
}

function arbTopicValue(n: number): Topic {
  return {
    id: `t${n}` as Id,
    subjectId: "s1" as Id,
    unitId: "u1" as Id,
    title: "Topic",
    order: n,
    intrinsicDifficulty: 3,
    summary: "s",
    keyPoints: [],
    commonErrors: [],
  };
}

describe("mastery invariants", () => {
  it("mastery, predicted mastery and retention stay in [0,1] for any history", () => {
    fc.assert(
      fc.property(arbHistory(), (history) => {
        const now = new Date("2025-01-15T12:00:00Z");
        const result = computeTopicMastery({ ...history, now });
        expect(result).toHaveLength(1);
        for (const tm of result) {
          expect(tm.mastery).toBeGreaterThanOrEqual(0);
          expect(tm.mastery).toBeLessThanOrEqual(1);
          expect(Number.isFinite(tm.mastery)).toBe(true);
          if (tm.predictedMastery != null) {
            expect(tm.predictedMastery).toBeGreaterThanOrEqual(0);
            expect(tm.predictedMastery).toBeLessThanOrEqual(1);
          }
          if (tm.retention != null) {
            expect(tm.retention).toBeGreaterThanOrEqual(0);
            expect(tm.retention).toBeLessThanOrEqual(1);
          }
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("the Bayesian prior converges onto raw performance as evidence grows", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 5_000 }),
        (raw, evidence) => {
          const predicted = bayesianMastery(raw, evidence);
          expect(predicted).toBeGreaterThanOrEqual(0);
          expect(predicted).toBeLessThanOrEqual(1);
          // Between raw and the cohort mean, monotonically closer as n grows.
          if (evidence === 0) expect(predicted).toBeCloseTo(0.45, 10);
          else {
            const lo = Math.min(raw, 0.45);
            const hi = Math.max(raw, 0.45);
            expect(predicted).toBeGreaterThanOrEqual(lo - 1e-12);
            expect(predicted).toBeLessThanOrEqual(hi + 1e-12);
          }
          // Prior share strictly decreases with evidence.
          expect(priorRemaining(evidence + 1)).toBeLessThanOrEqual(priorRemaining(evidence));
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("weakTopics only ever returns topics below the weak threshold", () => {
    fc.assert(
      fc.property(arbHistory(), (history) => {
        const result = computeTopicMastery({ ...history, now: new Date("2025-01-15T12:00:00Z") });
        for (const tm of weakTopics(result, 100)) {
          expect(tm.mastery).toBeLessThan(0.55);
        }
      }),
      { numRuns: 500 },
    );
  });
});

// --- fatigue invariants ------------------------------------------------------

describe("fatigue and circadian invariants", () => {
  it("session and circadian fatigue stay in [0,1] for any input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 24 * 60 }),
        fc.integer({ min: -5, max: 30 }),
        (minutes, hour) => {
          const s = sessionFatigue(minutes);
          const c = circadianFatigue(hour);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("session fatigue is monotonically non-decreasing in active minutes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_439 }),
        fc.integer({ min: 1, max: 1_440 }),
        (m, d) => {
          expect(sessionFatigue(m + d)).toBeGreaterThanOrEqual(sessionFatigue(m));
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("the compounded factor never drops below the floor and never exceeds 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 24 * 60 }),
        fc.integer({ min: -5, max: 30 }),
        fc.constantFrom("recall", "practice", "paper") as fc.Arbitrary<"recall" | "practice" | "paper">,
        (minutes, hour, activity) => {
          const f = fatigueFactor(activity, { activeMinutes: minutes, hourOfDay: hour });
          expect(f).toBeGreaterThanOrEqual(FATIGUE_FLOOR);
          expect(f).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// --- id/date hygiene ---------------------------------------------------------

describe("date helpers", () => {
  it("toDateOnly is stable and well-formed for any timestamp in a 20-year window", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 631_152_000_000 }), (offsetMs) => {
        const d = new Date(Date.UTC(2020, 0, 1) + offsetMs);
        const iso = toDateOnly(d);
        expect(/^\d{4}-\d{2}-\d{2}$/.test(iso)).toBe(true);
        expect(toDateOnly(new Date(d))).toBe(iso);
      }),
      { numRuns: 1_000 },
    );
  });

  it("isDue is false for a card scheduled in the future", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3_650 }), fc.integer({ min: 0, max: 3_649 }), (days, offset) => {
        const today = new Date("2025-01-10T12:00:00Z");
        const card = driveCard(
          makeCard("card", today),
          [{ grade: "good", gap: days }],
          today,
        );
        const checkDate = toDateOnly(new Date(today.getTime() + offset * 86_400_000));
        if (checkDate < card.due) expect(isDue(card, checkDate)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});
