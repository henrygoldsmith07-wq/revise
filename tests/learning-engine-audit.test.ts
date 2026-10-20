import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmptyCard, fsrs, generatorParameters } from "ts-fsrs";
import { createCard, dueCountByDay, forgettingCurve, gradeCard, replayStabilityBefore, retrievability } from "@/domain/scheduling";
import { validateFsrs, validateFsrsHoldout } from "@/domain/fsrs-tuning";
import { buildPlan, rescheduleMissed } from "@/domain/planner";
import { replanDynamically } from "@/domain/replan";
import { computeTopicMastery, topicHasEvidence, untouchedTopics } from "@/domain/mastery";
import { coldStartRemaining, coldStartSignals } from "@/domain/recommender-enhancements";
import { recommend } from "@/domain/recommender";
import { daysToNearestExam } from "@/domain/revision-engine";
import { planColdStart } from "@/domain/cold-start";
import { summariseExamReadiness, type ExamReadiness } from "@/domain/exam-readiness";
import type { Availability, Card, ExamDate, PlannedSession, ReviewLog, Topic } from "@/domain/types";
import { question as mkQuestion } from "./helpers-recovery";

// ---------------------------------------------------------------------------
// Regression tests for the learning-engine audit findings. Each block failed
// against the code before its fix. Calendar-day tests pin the process time
// zone for the duration of their block (Node re-reads process.env.TZ on
// assignment), restoring it afterwards.
// ---------------------------------------------------------------------------

function inTimeZone(zone: string, body: () => void): void {
  describe(`in ${zone}`, () => {
    let previous: string | undefined;
    beforeAll(() => {
      previous = process.env.TZ;
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    });
    body();
  });
}

const topic = (id: string, subjectId = "maths"): Topic => ({
  id, subjectId, unitId: "unit", title: `Topic ${id}`, order: 0, intrinsicDifficulty: 3,
  summary: "summary", keyPoints: ["point"], commonErrors: ["error"],
});

const everyDay = (minutes: number): Availability[] => Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes }));

function ids() {
  let n = 0;
  return () => `id-${n++}`;
}

// --- 1. Forgetting curve matches the installed scheduler --------------------
describe("forgetting curve", () => {
  const reference = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false }));

  it("matches ts-fsrs's own retrievability (FSRS-6 decay = -w[20])", () => {
    // The reviewer's probe: S = 2.31 days, 23 days elapsed.
    expect(forgettingCurve(23, 2.31)).toBeCloseTo(reference.forgetting_curve(23, 2.31), 6);
    expect(forgettingCurve(23, 2.31)).toBeCloseTo(0.693, 3);
    for (const [t, s] of [[1, 1], [10, 10], [5, 30], [90, 12], [365, 4]] as const) {
      expect(forgettingCurve(t, s)).toBeCloseTo(reference.forgetting_curve(t, s), 6);
    }
  });

  it("still predicts 90% recall at exactly one stability period", () => {
    expect(forgettingCurve(10, 10)).toBeCloseTo(0.9, 6);
  });

  it("gives the same retrievability as the scheduler for a graded card", () => {
    const start = new Date("2026-01-05T09:00:00Z");
    let card = createCard({ id: "c", userId: "u", subjectId: "s", topicId: "t", front: "f", back: "b" }, start);
    card = gradeCard(card, "good", start);
    card = gradeCard(card, "hard", new Date("2026-01-08T09:00:00Z"));
    const later = new Date("2026-01-31T09:00:00Z");
    const fsrsCard = {
      ...createEmptyCard(start),
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: new Date(card.lastReviewedAt!),
    };
    expect(retrievability(card, later)).toBeCloseTo(reference.get_retrievability(fsrsCard, later, false), 6);
  });
});

// --- 2. FSRS holdout predicts from history, not the card's final state -------
describe("FSRS calibration", () => {
  function history(): { card: Card; logs: ReviewLog[] } {
    let card = createCard({ id: "c1", userId: "u", subjectId: "s", topicId: "t1", front: "f", back: "b" }, new Date("2025-01-01T09:00:00Z"));
    const logs: ReviewLog[] = [];
    let cursor = new Date("2025-01-01T09:00:00Z");
    for (let i = 0; i < 80; i++) {
      const grade = i % 5 === 0 ? ("again" as const) : ("good" as const);
      card = gradeCard(card, grade, cursor);
      logs.push({ id: `l${i}`, userId: "u", cardId: card.id, topicId: "t1", grade, elapsedMs: 1000, reviewedAt: cursor.toISOString() });
      // Review a little before the due date, at most a fortnight apart, so stability varies.
      const next = Math.min(Date.parse(`${card.due}T09:00:00Z`), cursor.getTime() + 14 * 86_400_000);
      cursor = new Date(Math.max(cursor.getTime() + 86_400_000, next));
    }
    return { card, logs };
  }

  it("replays the stability the live scheduler had before each review", () => {
    let card = createCard({ id: "c", userId: "u", subjectId: "s", topicId: "t", front: "f", back: "b" }, new Date("2025-01-01T09:00:00Z"));
    const logs: ReviewLog[] = [];
    const expected: (number | null)[] = [];
    const days = [0, 1, 4, 12, 13, 40];
    const grades = ["good", "good", "again", "good", "easy", "hard"] as const;
    days.forEach((d, i) => {
      const at = new Date(Date.parse("2025-01-01T09:00:00Z") + d * 86_400_000);
      expected.push(card.reps > 0 ? card.stability : null);
      card = gradeCard(card, grades[i]!, at);
      logs.push({ id: `l${i}`, userId: "u", cardId: "c", topicId: "t", grade: grades[i]!, elapsedMs: 1, reviewedAt: at.toISOString() });
    });
    const replayed = replayStabilityBefore(logs);
    expect(replayed[0]).toBeNull();
    replayed.forEach((s, i) => (s === null ? expect(expected[i]).toBeNull() : expect(s).toBeCloseTo(expected[i]!, 9)));
  });

  it("holdout metrics do not depend on the card's current (post-holdout) stability", () => {
    const { card, logs } = history();
    const a = validateFsrsHoldout({ cards: [{ ...card, stability: 0.5 }], logs });
    const b = validateFsrsHoldout({ cards: [{ ...card, stability: 400 }], logs });
    expect(a?.holdoutLogs).toBeGreaterThanOrEqual(20);
    expect(a?.holdout?.buckets).toEqual(b?.holdout?.buckets);
    expect(a?.holdout?.ece).toBe(b?.holdout?.ece);
  });

  it("full-history validation also predicts each review from the stability before it", () => {
    const { card, logs } = history();
    const a = validateFsrs({ cards: [{ ...card, stability: 0.5 }], logs });
    const b = validateFsrs({ cards: [{ ...card, stability: 400 }], logs });
    expect(a.buckets).toEqual(b.buckets);
  });
});

// --- 3. Rebuilding today respects what is already done and the clock --------
describe("buildPlan rebuild today", () => {
  inTimeZone("Europe/London", () => {
    // Sunday 2 November 2025, 21:00 GMT (no BST).
    const NOW = new Date("2025-11-02T21:00:00Z");
    const TODAY = "2025-11-02";
    const topics = [topic("t1"), topic("t2")];
    const done: PlannedSession = {
      id: "done-1", userId: "u", date: TODAY, startMinute: 16 * 60, minutes: 45, subjectId: "maths",
      activity: "practice", reason: "done earlier", status: "done",
    };

    it("never exceeds the day's minutes, overlaps a kept block or starts in the past", () => {
      const plan = buildPlan({
        userId: "u", topics, mastery: [], exams: [], availability: everyDay(90), sessionLengthMinutes: 45,
        subjectIds: ["maths"], horizonDays: 1, now: NOW, existing: [done], idFactory: ids(),
      });
      const today = plan.filter((s) => s.date === TODAY).sort((a, b) => a.startMinute - b.startMinute);
      const total = today.filter((s) => s.status !== "missed").reduce((sum, s) => sum + s.minutes, 0);
      expect(total).toBeLessThanOrEqual(90);
      for (let i = 1; i < today.length; i++) {
        expect(today[i]!.startMinute).toBeGreaterThanOrEqual(today[i - 1]!.startMinute + today[i - 1]!.minutes);
      }
      for (const s of today.filter((x) => x.status === "pending")) expect(s.startMinute).toBeGreaterThanOrEqual(21 * 60);
      expect(today.filter((x) => x.status === "pending")).toHaveLength(1);
    });

    it("a short day gets work that fits it, never a block longer than the day", () => {
      const plan = buildPlan({
        userId: "u", topics, mastery: [], exams: [], availability: everyDay(20), sessionLengthMinutes: 45,
        subjectIds: ["maths"], horizonDays: 3, now: new Date("2025-11-03T08:00:00Z"), idFactory: ids(),
      });
      const byDate = new Map<string, number>();
      for (const s of plan) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.minutes);
      for (const minutes of byDate.values()) expect(minutes).toBeLessThanOrEqual(20);
    });
  });
});

// --- 4. Missed work never rolls onto or past the exam ----------------------
describe("rescheduleMissed and replanDynamically", () => {
  const TODAY = "2025-06-02"; // Monday
  const missed: PlannedSession = {
    id: "m1", userId: "u", date: "2025-05-31", startMinute: 960, minutes: 30, subjectId: "physics",
    activity: "practice", reason: "weak topic", status: "pending",
  };
  const fullToday: PlannedSession[] = Array.from({ length: 2 }, (_, i) => ({
    id: `t${i}`, userId: "u", date: TODAY, startMinute: 960 + i * 35, minutes: 30, subjectId: "physics",
    activity: "flashcards" as const, reason: "", status: "pending" as const,
  }));
  const exam: ExamDate = { id: "e", userId: "u", subjectId: "physics", date: "2025-06-03", label: "Unit 1" };

  it("does not roll a missed block onto the subject's exam day", () => {
    const healed = rescheduleMissed([missed, ...fullToday], TODAY, 2, ids(), { exams: [exam], availability: everyDay(90) });
    expect(healed.find((s) => s.id === "m1")?.status).toBe("missed");
    const rolled = healed.filter((s) => s.reason.startsWith("Rescheduled"));
    for (const s of rolled) expect(s.date < exam.date).toBe(true);
    expect(rolled).toHaveLength(0);
  });

  it("skips days with no availability", () => {
    const availability = everyDay(90).map((a) => (a.weekday === 1 ? { ...a, minutes: 0 } : a));
    const healed = rescheduleMissed([missed], TODAY, 6, ids(), { exams: [], availability });
    const rolled = healed.find((s) => s.reason.startsWith("Rescheduled"))!;
    expect(rolled.date).toBe("2025-06-03");
  });

  it("still rolls missed work onto a planned study day before the exam", () => {
    const later: ExamDate = { ...exam, date: "2025-06-10" };
    const healed = rescheduleMissed([missed, ...fullToday], TODAY, 6, ids(), { exams: [later], availability: everyDay(60) });
    const rolled = healed.filter((s) => s.reason.startsWith("Rescheduled"));
    expect(rolled.map((s) => s.date)).toEqual([TODAY]);
    // It goes after the day's last block, not on top of it.
    expect(rolled[0]!.startMinute).toBeGreaterThanOrEqual(960 + 35 + 30);
  });

  it("only reports missed work as rolled forward when it survives the rebuild", () => {
    const result = replanDynamically({
      userId: "u", topics: [topic("p1", "physics")], subjects: [], mastery: [], exams: [],
      availability: everyDay(90), sessionLengthMinutes: 30, subjectIds: ["physics"], targetGrades: {},
      existing: [missed], now: new Date("2025-06-02T08:00:00Z"), horizonDays: 3, idFactory: ids(),
      previous: { exams: "", targets: "", availability: "changed", sessionLength: 30, subjects: "physics" },
    });
    const survivors = result.plan.filter((s) => s.reason.startsWith("Rescheduled"));
    expect(survivors).toHaveLength(0);
    expect(result.summary).not.toMatch(/rolled forward/);
    expect(result.summary).toMatch(/missed/);
  });
});

// --- 5. Installed seed cards are not study evidence -------------------------
describe("installed, never-studied cards", () => {
  const NOW = new Date("2026-10-18T10:00:00Z");
  const seeded = (id: string, topicId: string): Card => createCard({ id, userId: "u", subjectId: "maths", topicId, front: "f", back: "b", origin: "seed" }, NOW);

  it("leave a topic untouched for mastery, cold-start and the recommender", () => {
    const topics = [topic("t1"), topic("t2")];
    const cards = [seeded("c1", "t1"), seeded("c2", "t1"), seeded("c3", "t2")];
    const mastery = computeTopicMastery({ topics, cards, attempts: [], reviewLogs: [], mistakes: [], now: NOW });
    expect(mastery.map((m) => m.cardsTotal)).toEqual([2, 1]);
    expect(untouchedTopics(mastery).map((m) => m.topicId)).toEqual(["t1", "t2"]);
    expect(mastery.some(topicHasEvidence)).toBe(false);
    expect(coldStartRemaining(mastery)).toBe(2);
    expect(coldStartSignals({ topics, mastery }).every((s) => s.reason === "untouched")).toBe(true);

    const recs = recommend({ topics, mastery, cards, mistakes: [], exams: [], plan: [], sessionLengthMinutes: 25, subjectIds: ["maths"], now: NOW });
    expect(recs.some((r) => r.activity === "learn")).toBe(true);
  });

  it("a studied card does make the topic touched", () => {
    const topics = [topic("t1")];
    const studied = gradeCard(seeded("c1", "t1"), "good", NOW);
    const mastery = computeTopicMastery({ topics, cards: [studied], attempts: [], reviewLogs: [], mistakes: [], now: NOW });
    expect(untouchedTopics(mastery)).toHaveLength(0);
    expect(topicHasEvidence(mastery[0]!)).toBe(true);
  });
});

// --- 6. Days to exam use the local calendar ---------------------------------
describe("days to exam use local days", () => {
  const examOn = (subjectId: string, date: string): ExamDate => ({ id: `e-${subjectId}-${date}`, userId: "u", subjectId, date, label: "x" });

  inTimeZone("Europe/London", () => {
    // 00:30 BST on 11 June is still 10 June in UTC.
    const now = new Date("2026-06-10T23:30:00Z");
    it("an exam today is 0 days away and yesterday's exam is over", () => {
      expect(daysToNearestExam([examOn("p", "2026-06-11")], "p", now)).toBe(0);
      expect(daysToNearestExam([examOn("p", "2026-06-10")], "p", now)).toBeNull();
    });
    it("cold start does not prioritise a subject whose exam was yesterday", () => {
      const pool = (subjectId: string) => ["a", "b"].flatMap((t) => Array.from({ length: 6 }, (_, i) =>
        mkQuestion(`${subjectId}-${t}-${i}`, `${subjectId}:${t}`, { subjectId, kind: i % 2 ? "calculation" : "short", family: `${subjectId}-${t}-f${i}` } as never)));
      const plan = planColdStart({
        subjectIds: ["physics", "biology"], attempts: [], mistakes: [], reviewLogs: [],
        questions: [...pool("physics"), ...pool("biology")],
        examDates: [examOn("physics", "2026-06-10"), examOn("biology", "2026-06-20")],
        topicSubject: (id) => id.split(":")[0], now,
      });
      expect(plan?.subjectId).toBe("biology");
    });
  });

  inTimeZone("America/New_York", () => {
    // 23:30 EDT on 10 June is already 11 June in UTC.
    const now = new Date("2026-06-11T03:30:00Z");
    it("an exam tomorrow is 1 day away", () => {
      expect(daysToNearestExam([examOn("p", "2026-06-11")], "p", now)).toBe(1);
      expect(daysToNearestExam([examOn("p", "2026-06-10")], "p", now)).toBe(0);
    });
  });
});

// --- 7. Due forecast labels local days ------------------------------------
describe("dueCountByDay", () => {
  inTimeZone("America/New_York", () => {
    it("starts on the requested day and counts consecutive local days", () => {
      const rows = dueCountByDay([], 3, "2026-10-18");
      expect(rows.map((r) => r.date)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
    });
    it("spans a DST change without skipping or repeating a day", () => {
      const rows = dueCountByDay([], 4, "2026-10-31");
      expect(rows.map((r) => r.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
    });
  });
});

// --- 8. Readiness summary cannot outrun its least-evidenced subject ---------
describe("summariseExamReadiness", () => {
  const row = (subjectId: string, status: ExamReadiness["status"], score: number, confidence: number): ExamReadiness => ({
    subjectId, targetGrade: null, targetPercent: null, predictedGrade: "C", predictedPercent: 55, examDays: null, gapPercent: null,
    score, confidence, status, signals: [], blockers: [], nextAction: { label: "x", action: "practice" } as ExamReadiness["nextAction"],
    evidence: { topics: 1, evidencedTopics: 0, attempts: 0, reviews: 0, transferChecks: 0, paceAttempts: 0 },
  });

  it("is building evidence when any subject is, at the weakest confidence", () => {
    const summary = summariseExamReadiness([row("a", "nearly-ready", 0.7, 0.65), row("b", "building-evidence", 0.3, 0.1)]);
    expect(summary.status).toBe("building-evidence");
    expect(summary.confidence).toBe(0.1);
  });

  it("still surfaces an evidenced at-risk subject", () => {
    const summary = summariseExamReadiness([row("a", "at-risk", 0.3, 0.6), row("b", "building-evidence", 0.3, 0.1)]);
    expect(summary.status).toBe("at-risk");
  });
});
