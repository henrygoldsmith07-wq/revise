import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dueForecast, reviewCalendar } from "@/domain/review-stats";
import { createCard } from "@/domain/scheduling";
import type { Card } from "@/domain/types";

const TODAY = "2026-11-11"; // a Wednesday

function card(id: string, patch: Partial<Card>): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "s", topicId: "s.t", front: "Q", back: "A" }, new Date("2026-10-01T12:00:00Z")),
    reps: 2,
    state: 2,
    lastReviewedAt: "2026-11-01T12:00:00.000Z",
    ...patch,
  };
}

const at = (day: string) => `${day}T12:00:00.000Z`;

describe("the future-due forecast", () => {
  it("counts studied cards by due day, with overdue cards in today", () => {
    const forecast = dueForecast(
      [
        card("overdue", { due: "2026-11-08" }),
        card("today", { due: TODAY }),
        card("tomorrow-a", { due: "2026-11-12" }),
        card("tomorrow-b", { due: "2026-11-12" }),
        card("next-week", { due: "2026-11-18" }),
        card("beyond", { due: "2027-01-30" }),
      ],
      TODAY,
      30,
    );
    expect(forecast.days).toHaveLength(30);
    expect(forecast.days[0]).toEqual({ date: TODAY, count: 2 });
    expect(forecast.overdue).toBe(1);
    expect(forecast.dueToday).toBe(2);
    expect(forecast.dueTomorrow).toBe(2);
    expect(forecast.nextSevenDays).toBe(4);
    expect(forecast.days[7]).toEqual({ date: "2026-11-18", count: 1 });
    expect(forecast.days.reduce((sum, day) => sum + day.count, 0)).toBe(5);
    expect(forecast.busiest).toEqual({ date: TODAY, count: 2 });
  });

  it("leaves out new and suspended cards, and moves a buried card to the day it returns", () => {
    const forecast = dueForecast(
      [
        card("new", { due: TODAY, reps: 0, state: 0 }),
        card("suspended", { due: TODAY, suspended: true }),
        card("buried", { due: TODAY, buriedUntil: "2026-11-12" }),
      ],
      TODAY,
    );
    expect(forecast.dueToday).toBe(0);
    expect(forecast.dueTomorrow).toBe(1);
  });

  it("reports no busiest day when nothing is due", () => {
    expect(dueForecast([], TODAY).busiest).toBeNull();
  });
});

describe("the review calendar", () => {
  it("lays out Monday-to-Sunday weeks ending this week, with future days blank", () => {
    const calendar = reviewCalendar([], TODAY, 4);
    expect(calendar.weeks).toHaveLength(4);
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    expect(calendar.weeks[0]![0]!.date).toBe("2026-10-19"); // a Monday, three weeks before this week's
    const thisWeek = calendar.weeks.at(-1)!;
    expect(thisWeek[2]!.date).toBe(TODAY);
    expect(thisWeek.slice(3).every((day) => day === null)).toBe(true);
    expect(calendar.daysInRange).toBe(24);
  });

  it("counts reviews per day and shades days by the learner's own spread", () => {
    const logs = [
      ...Array.from({ length: 1 }, () => ({ reviewedAt: at("2026-11-02") })),
      ...Array.from({ length: 5 }, () => ({ reviewedAt: at("2026-11-04") })),
      ...Array.from({ length: 10 }, () => ({ reviewedAt: at("2026-11-06") })),
      ...Array.from({ length: 40 }, () => ({ reviewedAt: at(TODAY) })),
      { reviewedAt: at("2025-01-01") }, // outside the window
    ];
    const calendar = reviewCalendar(logs, TODAY, 4);
    const days = new Map(calendar.weeks.flat().filter(Boolean).map((day) => [day!.date, day!]));
    expect(days.get("2026-11-02")).toMatchObject({ count: 1, level: 1 });
    expect(days.get(TODAY)).toMatchObject({ count: 40, level: 4 });
    expect(days.get("2026-11-03")).toMatchObject({ count: 0, level: 0 });
    expect((days.get("2026-11-04")!.level)).toBeLessThan(days.get("2026-11-06")!.level);
    expect(calendar.daysStudied).toBe(4);
    expect(calendar.totalReviews).toBe(56);
    expect(calendar.averageOnStudyDays).toBe(14);
  });
});

describe("deck numbers next to the forecast", () => {
  it("separates reviews owed from new cards, and averages ease over studied cards only", async () => {
    const { deckStats, retentionVerdict } = await import("@/domain/card-stats");
    const studied = card("studied", { due: "2026-11-01", stability: 12 });
    const fresh = card("fresh", { due: TODAY, reps: 0, state: 0, stability: 0, lastReviewedAt: null });
    const stats = deckStats([studied, fresh], [], TODAY);
    expect(stats.due).toBe(2);
    expect(stats.dueReviews).toBe(1);
    expect(stats.averageStability).toBe(12);
    expect(deckStats([fresh], [], TODAY).averageEase).toBe(0);
    expect(retentionVerdict(0.83, 50, 0.8)).toContain("right on the 80% target");
    expect(retentionVerdict(0.83, 50)).toContain("slightly under the 90% target");
  });
});

describe("wiring", () => {
  it("Study opens the statistics and Review offers card info", () => {
    const study = readFileSync("src/app/study/page.tsx", "utf8");
    expect(study).toContain("<FlashcardStatistics cards={enrolledCards} logs={enrolledLogs} target={desiredRetention(store.settings.desiredRetention)} />");
    expect(study).toContain('params.get("stats") === "1"');
    const review = readFileSync("src/app/review/page.tsx", "utf8");
    expect(review).toContain("<CardInfo card={current} logs={store.reviewLogs} />");
    expect(readFileSync("src/components/FlashcardStatistics.tsx", "utf8")).toContain("<DeckStatsPanel");
  });
});
