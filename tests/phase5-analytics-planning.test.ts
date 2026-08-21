import { describe, expect, it } from "vitest";
import {
  retentionReport,
  marksPerHourReport,
  techniqueVsKnowledge,
  paperAnalytics,
  dashboardSnapshot,
  averageRetrievability,
} from "@/domain/retention-analytics";
import {
  effectiveMinutes,
  diminishingReturnsFactor,
  assessPlanRealism,
  rescheduleMissedPrioritised,
} from "@/domain/planner";
import {
  retentionNarrative,
  marksPerHourNarrative,
  techniqueVsKnowledgeNarrative,
  paperBreakdownNarrative,
  gradeCalibrationNarrative,
} from "@/domain/analytics";
import { createCard, gradeCard } from "@/domain/scheduling";
import type { Attempt, ReviewLog, Mistake, PlannedSession, TopicMastery, Topic, Availability } from "@/domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TODAY = "2025-06-10";
const NOW = new Date("2025-06-10T12:00:00.000Z");

function revLog(reviewedAt: string, grade: ReviewLog["grade"] = "good"): ReviewLog {
  return {
    id: `rl-${reviewedAt}-${Math.random().toString(36).slice(2, 6)}`,
    userId: "u",
    cardId: "c1",
    topicId: "t1",
    grade,
    elapsedMs: 5000,
    reviewedAt,
  };
}

function attempt(
  createdAt: string,
  awarded: number,
  max = 10,
  elapsedMs = 600_000,
  topicIds = ["t1"],
): Attempt {
  return {
    id: `a-${createdAt}-${awarded}`,
    userId: "u",
    questionId: "q1",
    subjectId: "maths",
    topicIds,
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs,
    mode: "practice",
    createdAt,
  };
}

function mistake(overrides: Partial<Mistake> & Pick<Mistake, "category">): Mistake {
  return {
    id: `m-${Math.random().toString(36).slice(2, 6)}`,
    userId: "u",
    subjectId: "maths",
    topicId: "t1",
    marksLost: 2,
    description: "lost marks",
    resolved: false,
    createdAt: "2025-06-09T09:00:00.000Z",
    ...overrides,
  } as Mistake;
}

const topic = (id: string, subjectId: string, intrinsicDifficulty: Topic["intrinsicDifficulty"] = 3): Topic => ({
  id,
  subjectId,
  unitId: "unit",
  title: `Topic ${id}`,
  order: 0,
  intrinsicDifficulty,
  summary: "summary",
  keyPoints: ["p"],
  commonErrors: ["e"],
});

function ids() {
  let n = 0;
  return () => `id-${n++}`;
}

// ---------------------------------------------------------------------------
// retentionReport
// ---------------------------------------------------------------------------
describe("retentionReport — 1/7/30d", () => {
  it("returns nulls and thin-evidence narrative when no logs", () => {
    const r = retentionReport({ reviewLogs: [], today: TODAY, now: NOW });
    expect(r.checkpoints).toHaveLength(3);
    expect(r.overallRetention).toBeNull();
    expect(r.narrative).toContain("Only 0 reviews");
  });

  it("measures retention from logs and surfaces per-checkpoint reviews", () => {
    // 12 reviews: 8 good (80%) spread across last 30d, all within window
    const logs: ReviewLog[] = [
      ...Array.from({ length: 8 }, (_, i) => revLog(`2025-06-${String(9 - i).padStart(2, "0")}T09:00:00.000Z`, "good")),
      ...Array.from({ length: 2 }, (_, i) => revLog(`2025-05-${String(20 + i).padStart(2, "0")}T09:00:00.000Z`, "again")),
      ...Array.from({ length: 10 }, (_, i) => revLog(`2025-05-${String(15 + i).padStart(2, "0")}T09:00:00.000Z`, "good")),
    ];
    const r = retentionReport({ reviewLogs: logs, today: TODAY, now: NOW });
    // 1d window only catches 2025-06-10? none — so 1d retention null, 7d/30d have data
    expect(r.checkpoints.find((c) => c.checkpoint === 30)!.reviews).toBeGreaterThanOrEqual(12);
    expect(r.checkpoints.find((c) => c.checkpoint === 30)!.retention).toBeGreaterThan(0.5);
    // Overall is gated on 30d reviews >= 20
    expect(r.overallRetention).not.toBeNull();
  });

  it("is honest on thin evidence — overallRetention null until 20 reviews", () => {
    const logs = Array.from({ length: 6 }, () => revLog("2025-06-09T09:00:00.000Z", "good"));
    const r = retentionReport({ reviewLogs: logs, today: TODAY, now: NOW });
    expect(r.overallRetention).toBeNull();
    expect(r.narrative).toContain("Only 6 reviews");
  });

  it("includes predictedRetention when cards supplied", () => {
    const card = createCard({ id: "c1", userId: "u", subjectId: "maths", topicId: "t1", front: "q", back: "a" }, new Date("2025-06-09T09:00:00.000Z"));
    const warmCard = gradeCard(card, "good", new Date("2025-06-09T09:00:00.000Z"));
    const logs = Array.from({ length: 22 }, () => revLog("2025-06-09T09:00:00.000Z", "good"));
    const r = retentionReport({ reviewLogs: logs, cards: [warmCard], today: TODAY, now: NOW });
    expect(r.checkpoints[0].predictedRetention).not.toBeNull();
    expect(r.overallRetention).not.toBeNull();
  });
});

describe("averageRetrievability", () => {
  it("returns null for empty, 0–1 for a real card", () => {
    expect(averageRetrievability([])).toBeNull();
    const card = createCard({ id: "c1", userId: "u", subjectId: "maths", topicId: "t1", front: "q", back: "a" }, new Date("2025-06-09T09:00:00.000Z"));
    const graded = gradeCard(card, "good", new Date("2025-06-09T09:00:00.000Z"));
    const v = averageRetrievability([graded], new Date("2025-06-10T12:00:00.000Z"));
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
    expect(v!).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// marksPerHourReport
// ---------------------------------------------------------------------------
describe("marksPerHourReport", () => {
  it("returns thin-evidence when < 6 attempts", () => {
    const a = [attempt("2025-06-09T09:00:00.000Z", 6), attempt("2025-06-08T09:00:00.000Z", 4)];
    const r = marksPerHourReport({ attempts: a, today: TODAY, now: NOW });
    expect(r.headlineMarksPerHour).toBeNull();
    expect(r.narrative).toContain("Only 2 timed attempts");
  });

  it("computes marks/hr from elapsedMs — 60 marks in 60 min = 60/hr", () => {
    // 6 attempts totalling 60 marks gained in 3600s (60 min) = 60/hr, but need 30d window
    const attempts: Attempt[] = Array.from({ length: 6 }, (_, i) =>
      attempt(`2025-06-0${Math.min(9, 5 + i)}T09:00:00.000Z`, 10, 10, 600_000),
    );
    const r = marksPerHourReport({ attempts, today: TODAY, now: NOW });
    const p30 = r.points.find((p) => p.windowLabel === "30d")!;
    expect(p30.attempts).toBe(6);
    expect(p30.marksGained).toBe(60);
    expect(p30.hours).toBeCloseTo(1, 1);
    expect(p30.marksPerHour).not.toBeNull();
    // 60 marks / 1h = 60
    expect(p30.marksPerHour).toBeCloseTo(60, 0.5);
    expect(r.headlineMarksPerHour).toBeCloseTo(60, 0.5);
  });

  it("windows correctly — 1d vs 30d differ", () => {
    const attempts: Attempt[] = [
      ...Array.from({ length: 3 }, () => attempt("2025-06-09T09:00:00.000Z", 8, 10, 600_000)),
      ...Array.from({ length: 3 }, () => attempt("2025-05-15T09:00:00.000Z", 2, 10, 600_000)),
    ];
    const r = marksPerHourReport({ attempts, today: TODAY, now: NOW });
    const p1 = r.points.find((p) => p.windowLabel === "1d")!;
    const p30 = r.points.find((p) => p.windowLabel === "30d")!;
    expect(p30.marksGained).toBeGreaterThan(p1.marksGained);
  });
});

// ---------------------------------------------------------------------------
// techniqueVsKnowledge
// ---------------------------------------------------------------------------
describe("techniqueVsKnowledge", () => {
  it("reports no-data state when no mistakes", () => {
    const r = techniqueVsKnowledge([]);
    expect(r.totalLost).toBe(0);
    expect(r.narrative).toContain("No marked mistakes");
  });

  it("classifies AO1 recall as knowledge", () => {
    const ms = [mistake({ category: "recall", ao: "AO1", misconception: "other", marksLost: 4 })];
    const r = techniqueVsKnowledge(ms);
    expect(r.knowledgeLost).toBeGreaterThan(r.techniqueLost);
    expect(r.knowledgeShare).toBeGreaterThan(0.6);
  });

  it("classifies communication/interpretation + rushed timing as technique", () => {
    const ms = [
      mistake({ category: "communication", misconception: "misread-command", marksLost: 3, timing: "rushed" }),
      mistake({ category: "interpretation", misconception: "graph-reading", marksLost: 3, timing: "slow" }),
    ];
    const r = techniqueVsKnowledge(ms);
    expect(r.techniqueShare).toBeGreaterThan(0.6);
    expect(r.drivers).toContain("rushing");
    expect(r.drivers).toContain("time-management");
  });

  it("is reliable only with >= 8 mistakes and >= 10 marks", () => {
    const few = Array.from({ length: 3 }, () => mistake({ category: "recall", marksLost: 2 }));
    expect(techniqueVsKnowledge(few).reliable).toBe(false);
    const enough = Array.from({ length: 8 }, () => mistake({ category: "recall", marksLost: 2, ao: "AO1" }));
    expect(techniqueVsKnowledge(enough).reliable).toBe(true);
  });

  it("splits unclassified roughly 50/50", () => {
    const ms = [mistake({ category: "unclassified", misconception: "other", marksLost: 4 })];
    const r = techniqueVsKnowledge(ms);
    expect(Math.abs(r.knowledgeShare - 0.5)).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// paperAnalytics
// ---------------------------------------------------------------------------
describe("paperAnalytics", () => {
  it("returns empty when no attempts", () => {
    expect(paperAnalytics({ attempts: [] })).toEqual([]);
  });

  it("groups by subject when paperSpecId is unknown", () => {
    const atts: Attempt[] = [
      attempt("2025-06-01T09:00:00.000Z", 8, 10, 600_000, ["tA"]),
      attempt("2025-06-02T09:00:00.000Z", 6, 10, 600_000, ["tB"]),
      { ...attempt("2025-06-03T09:00:00.000Z", 4, 10, 600_000, ["tA"]), subjectId: "physics" } as Attempt,
    ];
    const rows = paperAnalytics({ attempts: atts });
    expect(rows).toHaveLength(2);
    const maths = rows.find((r) => r.subjectId === "maths")!;
    expect(maths.marksGained).toBe(14);
    expect(maths.accuracy).toBeCloseTo(0.7, 2);
    expect(maths.marksPerHour).not.toBeNull();
  });

  it("identifies best/worst topic by accuracy", () => {
    const atts: Attempt[] = [
      attempt("2025-06-01T09:00:00.000Z", 9, 10, 600_000, ["tBest"]),
      attempt("2025-06-02T09:00:00.000Z", 2, 10, 600_000, ["tWorst"]),
    ];
    const rows = paperAnalytics({ attempts: atts });
    const r = rows[0];
    expect(r.bestTopicId).toBe("tBest");
    expect(r.worstTopicId).toBe("tWorst");
  });
});

// ---------------------------------------------------------------------------
// dashboardSnapshot
// ---------------------------------------------------------------------------
describe("dashboardSnapshot", () => {
  it("says not enough evidence when both logs and attempts empty", () => {
    const snap = dashboardSnapshot({ reviewLogs: [], attempts: [], mistakes: [], today: TODAY, now: NOW });
    expect(snap.headline).toContain("Not enough evidence");
  });

  it("surfaces technique bottleneck headline when reliable and technique-heavy", () => {
    const mistakes: Mistake[] = Array.from({ length: 8 }, () =>
      mistake({ category: "communication", misconception: "misread-command", marksLost: 2, timing: "rushed", ao: "AO2" }),
    );
    const snap = dashboardSnapshot({ reviewLogs: [], attempts: [], mistakes, today: TODAY, now: NOW });
    expect(snap.headline.toLowerCase()).toContain("technique");
  });
});

// ---------------------------------------------------------------------------
// effectiveMinutes / diminishingReturnsFactor
// ---------------------------------------------------------------------------
describe("effectiveMinutes + diminishingReturnsFactor", () => {
  it("is linear up to 25, then diminishes", () => {
    expect(effectiveMinutes(25)).toBeCloseTo(25, 1);
    expect(effectiveMinutes(50)).toBeCloseTo(25 + 25 * 0.75, 1);
    expect(effectiveMinutes(90)).toBeCloseTo(25 + 25 * 0.75 + 40 * 0.55, 1);
  });

  it("factor is 1 at 0, 1 at 25, and < 1 beyond 25", () => {
    expect(diminishingReturnsFactor(0)).toBe(1);
    expect(diminishingReturnsFactor(25)).toBeCloseTo(1, 2);
    expect(diminishingReturnsFactor(50)).toBeLessThan(1);
    expect(diminishingReturnsFactor(90)).toBeLessThan(diminishingReturnsFactor(50));
    expect(diminishingReturnsFactor(180)).toBeLessThan(diminishingReturnsFactor(90));
  });

  it("monotone increasing effective minutes even as factor drops", () => {
    let last = 0;
    for (const m of [10, 25, 50, 90, 120, 180]) {
      const e = effectiveMinutes(m);
      expect(e).toBeGreaterThan(last);
      last = e;
    }
  });
});

// ---------------------------------------------------------------------------
// assessPlanRealism
// ---------------------------------------------------------------------------
describe("assessPlanRealism", () => {
  const NOW_DATE = new Date("2025-06-02T08:00:00.000Z"); // Monday
  const topicsList = [topic("t1", "maths"), topic("t2", "maths")];

  function mkPlan(pendingCount: number, minutesEach = 30, startDate = "2025-06-02"): PlannedSession[] {
    const base = new Date(`${startDate}T00:00:00Z`);
    return Array.from({ length: pendingCount }, (_, i) => {
      const d = new Date(base.getTime() + Math.floor(i / 2) * 86_400_000).toISOString().slice(0, 10);
      return {
        id: `p-${i}`,
        userId: "u",
        date: d,
        startMinute: 960 + (i % 2) * 35,
        minutes: minutesEach,
        subjectId: "maths",
        activity: "practice" as const,
        reason: "test",
        status: "pending" as const,
      };
    });
  }

  it("reports blocking when plan exceeds availability", () => {
    const availability: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 60 * weekday === 1 ? 60 : 0 } as Availability));
    // Only Monday has 60 min -> horizon 7 days = 60 min total, but we plan 120
    const plan = mkPlan(4, 30);
    const report = assessPlanRealism(
      { userId: "u", topics: topicsList, mastery: [], exams: [], availability, sessionLengthMinutes: 30, subjectIds: ["maths"], horizonDays: 7, now: NOW_DATE },
      plan,
    );
    expect(report.feasible).toBe(false);
    expect(report.issues.some((i) => i.severity === "blocking")).toBe(true);
    expect(report.utilisation).toBeGreaterThan(1);
  });

  it("warns on high utilisation but stays feasible", () => {
    const availability: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 60 }));
    // 7*60=420 available, plan 380 ~ 90%
    const plan = mkPlan(12, 32); // 384
    const report = assessPlanRealism(
      { userId: "u", topics: topicsList, mastery: [], exams: [], availability, sessionLengthMinutes: 32, subjectIds: ["maths"], horizonDays: 7, now: NOW_DATE },
      plan,
    );
    expect(report.issues.some((i) => i.message.includes("90%") || i.message.includes("% of available time"))).toBe(true);
  });

  it("flags long single-day blocks via peakDayMinutes", () => {
    const availability: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 240 }));
    const plan: PlannedSession[] = Array.from({ length: 7 }, (_, i) => ({
      id: `p-${i}`,
      userId: "u",
      date: "2025-06-02",
      startMinute: 600 + i * 35,
      minutes: 30,
      subjectId: "maths",
      activity: "practice",
      reason: "x",
      status: "pending",
    })); // 210 on one day
    const report = assessPlanRealism(
      { userId: "u", topics: topicsList, mastery: [], exams: [], availability, sessionLengthMinutes: 30, subjectIds: ["maths"], horizonDays: 7, now: NOW_DATE },
      plan,
    );
    expect(report.peakDayMinutes).toBe(210);
    expect(report.issues.some((i) => i.message.includes("Peak day"))).toBe(true);
  });

  it("flags excessive sessionLengthMinutes", () => {
    const availability: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 240 }));
    const report = assessPlanRealism(
      { userId: "u", topics: topicsList, mastery: [], exams: [], availability, sessionLengthMinutes: 120, subjectIds: ["maths"], horizonDays: 7, now: NOW_DATE },
      [],
    );
    expect(report.issues.some((i) => i.message.includes("Sessions of 120 min"))).toBe(true);
  });

  it("is feasible for a modest plan", () => {
    const availability: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 120 }));
    const plan = mkPlan(4, 30);
    const report = assessPlanRealism(
      { userId: "u", topics: topicsList, mastery: [], exams: [], availability, sessionLengthMinutes: 30, subjectIds: ["maths"], horizonDays: 7, now: NOW_DATE },
      plan,
    );
    expect(report.feasible).toBe(true);
    expect(report.totalPlannedMinutes).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// rescheduleMissedPrioritised
// ---------------------------------------------------------------------------
describe("rescheduleMissedPrioritised", () => {
  const staleBase: PlannedSession[] = [
    { id: "s1", userId: "u", date: "2025-06-01", startMinute: 960, minutes: 30, subjectId: "maths", topicId: "tWeak", activity: "practice", reason: "weak", status: "pending" },
    { id: "s2", userId: "u", date: "2025-06-01", startMinute: 995, minutes: 30, subjectId: "maths", topicId: "tStrong", activity: "practice", reason: "ok", status: "pending" },
  ];

  it("prioritises weak-topic sessions first", () => {
    const mastery: TopicMastery[] = [
      { topicId: "tWeak", subjectId: "maths", mastery: 0.2, retention: 0.3, confidence: 0.2, cardsTotal: 5, cardsDue: 1, attempts: 3, accuracy: 0.3, lastStudiedAt: null, weak: true },
      { topicId: "tStrong", subjectId: "maths", mastery: 0.9, retention: 0.9, confidence: 0.9, cardsTotal: 5, cardsDue: 0, attempts: 5, accuracy: 0.9, lastStudiedAt: null, weak: false },
    ];
    const healed = rescheduleMissedPrioritised(staleBase, TODAY, 6, mastery, [], ids());
    // The weak one should be re-queued earlier (both go to TODAY, but weak appears first in prioritised stale order which determines target slot)
    const rescheduled = healed.filter((s) => s.reason.startsWith("Rescheduled"));
    expect(rescheduled).toHaveLength(2);
    // Originals marked missed
    expect(healed.find((s) => s.id === "s1")!.status).toBe("missed");
    expect(healed.find((s) => s.id === "s2")!.status).toBe("missed");
    // All rescheduled target >= TODAY
    for (const r of rescheduled) expect(r.date >= TODAY).toBe(true);
  });

  it("is a no-op when nothing missed", () => {
    const clean: PlannedSession[] = [{ ...staleBase[0], date: "2025-06-15" }];
    expect(rescheduleMissedPrioritised(clean, TODAY, 6, [], [], ids())).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// analytics narratives
// ---------------------------------------------------------------------------
describe("retentionNarrative", () => {
  it("builds a headline and bullets", () => {
    const logs = Array.from({ length: 22 }, () => revLog("2025-06-09T09:00:00.000Z", "good"));
    const report = retentionReport({ reviewLogs: logs, today: TODAY, now: NOW });
    const n = retentionNarrative(report);
    expect(n.headline).toContain("retention");
    expect(n.bullets!.length).toBe(3);
    expect(n.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("marksPerHourNarrative", () => {
  it("builds from a report with enough data", () => {
    const attempts: Attempt[] = Array.from({ length: 8 }, (_, i) =>
      attempt(`2025-06-0${Math.min(9, 5 + i)}T09:00:00.000Z`, 8, 10, 600_000),
    );
    const report = marksPerHourReport({ attempts, today: TODAY, now: NOW });
    const n = marksPerHourNarrative(report);
    expect(n.headline).toContain("marks/hour");
    expect(n.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("techniqueVsKnowledgeNarrative", () => {
  it("explains thin vs reliable evidence", () => {
    const thin = techniqueVsKnowledge([mistake({ category: "recall", marksLost: 2 })]);
    const thinN = techniqueVsKnowledgeNarrative(thin);
    expect(thinN.paragraphs.join(" ")).toContain("thin");

    const reliable = techniqueVsKnowledge(Array.from({ length: 8 }, () => mistake({ category: "recall", marksLost: 2, ao: "AO1" })));
    const relN = techniqueVsKnowledgeNarrative(reliable);
    expect(relN.bullets!.join(" ")).toContain("Reliable");
  });
});

describe("paperBreakdownNarrative", () => {
  it("returns null when no papers", () => {
    expect(paperBreakdownNarrative([], () => "T")).toBeNull();
  });

  it("summarises weakest paper when several", () => {
    const atts: Attempt[] = [
      attempt("2025-06-01T09:00:00.000Z", 2, 10, 600_000, ["tWorst"]),
      { ...attempt("2025-06-02T09:00:00.000Z", 9, 10, 600_000, ["tBest"]), subjectId: "physics" } as Attempt,
    ];
    const papers = paperAnalytics({ attempts: atts });
    const n = paperBreakdownNarrative(papers, (id) => id);
    expect(n).not.toBeNull();
    expect(n!.headline).toContain("Papers");
  });
});

describe("gradeCalibrationNarrative", () => {
  it("mentions confidence, range and trend", () => {
    const pred = {
      subjectId: "maths",
      percent: 62,
      grade: "B",
      bestCase: "A",
      worstCase: "C",
      confidence: 0.5,
      trend: 6,
      headroom: [{ topicId: "t1", potentialPercent: 3 }],
    };
    const n = gradeCalibrationNarrative(pred as never);
    expect(n.headline).toContain("Predicted B");
    expect(n.headline).toContain("range C–A");
    expect(n.paragraphs.join(" ")).toContain("Trending up");
  });

  it("switches wording at high confidence", () => {
    const pred = {
      subjectId: "maths",
      percent: 88,
      grade: "A",
      bestCase: "A*",
      worstCase: "A",
      confidence: 0.9,
      trend: 0,
      headroom: [],
    };
    const n = gradeCalibrationNarrative(pred as never);
    expect(n.paragraphs.join(" ")).toContain("Confident");
  });

  it("uses a plain-English evidence explanation and resolves the next lever", () => {
    const pred = {
      subjectId: "maths",
      percent: 62,
      grade: "B",
      bestCase: "A",
      worstCase: "C",
      confidence: 0.3,
      trend: 0,
      headroom: [{ topicId: "t1", potentialPercent: 3 }],
    };
    const n = gradeCalibrationNarrative(pred as never, (id) => id === "t1" ? "Electrolysis" : id);
    expect(n.paragraphs[0]).toContain("early estimate");
    expect(n.paragraphs[0]).toContain("marked answers");
    expect(n.bullets?.[2]).toContain("Electrolysis");
    expect(n.bullets?.[2]).not.toContain("t1");
  });
});
