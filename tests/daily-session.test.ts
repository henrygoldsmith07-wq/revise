import { describe, expect, it } from "vitest";
import { createCard } from "@/domain/scheduling";
import type { Card, Mistake } from "@/domain/types";
import {
  buildDailySessionPlan,
  endsOnRetrieval,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
} from "@/domain/daily-session";
import { FATIGUE_MESSAGE, fatigueLock, memoryQuality } from "@/domain/fatigue";
import { shapeForMastery } from "@/domain/session-structure";

// The default daily session: one 18-minute memory session made of labelled
// blocks. These tests pin the contract the UI renders — phase order, the
// visible caps, and the overnight rule.

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TODAY = "2025-06-10";
const SUBJECT = "aqa-gcse-physics";

function card(id: string, overrides: Partial<Card> = {}): Card {
  const topicId = overrides.topicId ?? `${SUBJECT}.warmup`;
  return {
    ...createCard(
      { id, userId: "u", subjectId: SUBJECT, topicId, front: `Front ${id}`, back: `Back ${id}` },
      NOW,
    ),
    ...overrides,
  };
}

function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "u",
    subjectId: SUBJECT,
    topicId: `${SUBJECT}.kinematics-dynamics`,
    marksLost: 1,
    description: id,
    category: "recall",
    resolved: false,
    createdAt: `${TODAY}T08:00:00.000Z`,
    ...overrides,
  };
}

const MASTERY = new Map([
  [`${SUBJECT}.kinematics-dynamics`, 0.2],
  [`${SUBJECT}.waves`, 0.6],
]);

function dueCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) =>
    card(`due-${i}`, { due: "2025-06-09", state: 2, lastReviewedAt: "2025-06-01T09:00:00.000Z" }),
  );
}

function plan(overrides: {
  cards?: Card[];
  mistakes?: Mistake[];
  totalMinutes?: number;
}) {
  return buildDailySessionPlan({
    cards: overrides.cards ?? dueCards(18).concat(newCards(6)),
    mistakes: overrides.mistakes ?? [mistake("m1")],
    masteryByTopic: MASTERY,
    subjectIds: [SUBJECT],
    on: TODAY,
    ...overrides,
  });
}

function newCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => card(`new-${i}`, { state: 0, due: TODAY }));
}

describe("daily session plan", () => {
  it("defaults to 18 minutes in four labelled blocks", () => {
    const p = plan({});
    expect(p.totalMinutes).toBe(18);
    expect(p.phases.map((s) => s.kind)).toEqual(["warmup", "reviews", "exam-question", "mistake-repair"]);
    expect(p.phases.map((s) => s.minutes)).toEqual([2, 8, 5, 3]);
    expect(p.phases.reduce((a, s) => a + s.minutes, 0)).toBe(18);
  });

  it("labels every block with why it sticks", () => {
    const p = plan({});
    expect(p.phases[0].why).toBe("Wake last night's memory");
    expect(p.phases[1].why).toBe("FSRS job");
    expect(p.phases[2].why).toBe("Stops flashcard-only memory");
    expect(p.phases[3].why).toBe("Error correction before sleep");
  });

  it("surfaces the queue split after the scheduler's 25% new cap", () => {
    const p = plan({ cards: dueCards(18).concat(newCards(6)) });
    expect(p.newCount).toBe(6);
    expect(p.reviewCount).toBe(18);
    expect(p.phases[1].detail).toContain("6 new");
  });

  it("only adds the repair block for today's unresolved misses", () => {
    const withoutMisses = plan({ mistakes: [] });
    expect(withoutMisses.phases.map((s) => s.kind)).not.toContain("mistake-repair");
    expect(withoutMisses.phases[1].minutes).toBe(11);

    const staleMiss = plan({ mistakes: [mistake("m-old", { createdAt: "2025-06-08T08:00:00.000Z" })] });
    expect(staleMiss.phases.map((s) => s.kind)).not.toContain("mistake-repair");
  });

  it("clamps the requested length into the 12–25 minute cap", () => {
    const long = plan({ totalMinutes: 40 });
    expect(long.totalMinutes).toBe(MAX_SESSION_MINUTES);
    const short = plan({ totalMinutes: 5 });
    expect(short.totalMinutes).toBe(MIN_SESSION_MINUTES);
    for (const p of [long, short]) {
      expect(p.phases.reduce((a, s) => a + s.minutes, 0)).toBe(p.totalMinutes);
      expect(endsOnRetrieval(p)).toBe(true);
    }
  });

  it("labels the shape from the weakest topic's mastery", () => {
    expect(plan({}).shape).toBe("scaffolded");
    const strong = buildDailySessionPlan({
      cards: dueCards(18).concat(newCards(6)),
      mistakes: [mistake("m1")],
      masteryByTopic: new Map([[`${SUBJECT}.kinematics-dynamics`, 0.9]]),
      subjectIds: [SUBJECT],
      on: TODAY,
    });
    expect(strong.shape).toBe("retrieval");
    expect(shapeForMastery(0.5)).toBe("balanced");
  });

  it("always ends on retrieval — the overnight rule", () => {
    for (const minutes of [MIN_SESSION_MINUTES, 18, MAX_SESSION_MINUTES]) {
      const p = plan({ totalMinutes: minutes, mistakes: [] });
      expect(endsOnRetrieval(p), `${minutes} min`).toBe(true);
    }
  });
});

describe("fatigue lock", () => {
  it("stays silent inside the cap and locks past it", () => {
    expect(fatigueLock(18)).toBeNull();
    expect(fatigueLock(MAX_SESSION_MINUTES)).toBeNull();
    const locked = fatigueLock(MAX_SESSION_MINUTES + 1);
    expect(locked).not.toBeNull();
    expect(locked!.message).toBe(FATIGUE_MESSAGE);
  });

  it("decays memory quality monotonically", () => {
    let last = memoryQuality(1);
    for (let m = 2; m <= 60; m++) {
      const q = memoryQuality(m);
      expect(q).toBeLessThanOrEqual(last);
      last = q;
    }
    expect(memoryQuality(MAX_SESSION_MINUTES + 1)).toBeLessThan(1);
  });
});
