import { describe, expect, it } from "vitest";
import { RUN_THRESHOLD, attemptExtendsRun, gradeExtendsRun, liveStreak, nextRun, studyWeek, trailingRun, weekStart } from "@/domain/study-week";

// Instants built from local components, so the day they land on is the same
// on every machine whatever its time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("studyWeek", () => {
  it("runs Monday to Sunday around today", () => {
    // Wednesday 28 October 2026.
    const week = studyWeek([], "2026-10-28");
    expect(week.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(week.map((d) => d.letter).join("")).toBe("MTWTFSS");
    expect(week.find((d) => d.isToday)?.date).toBe("2026-10-28");
    expect(week.filter((d) => d.future).length).toBe(4);
  });

  it("marks a day once however many answers it holds, and ignores other weeks", () => {
    const week = studyWeek([at(2026, 10, 26, 9), at(2026, 10, 26, 21), at(2026, 10, 28), at(2026, 10, 25), at(2026, 11, 2)], "2026-10-28");
    expect(week.filter((d) => d.studied).map((d) => d.date)).toEqual(["2026-10-26", "2026-10-28"]);
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });
});

describe("liveStreak", () => {
  it("keeps the run through the one-day grace and drops it after", () => {
    const streak = { current: 6, lastActiveDate: "2026-10-26" };
    expect(liveStreak(streak, "2026-10-26")).toBe(6);
    expect(liveStreak(streak, "2026-10-27")).toBe(6);
    expect(liveStreak(streak, "2026-10-28")).toBe(6);
    expect(liveStreak(streak, "2026-10-29")).toBe(0);
  });

  it("is zero before anything has been studied", () => {
    expect(liveStreak({ current: 0, lastActiveDate: null }, "2026-10-28")).toBe(0);
  });
});

describe("in-session runs", () => {
  it("counts only full marks and recalled cards", () => {
    expect(attemptExtendsRun({ awarded: 4, max: 4 })).toBe(true);
    expect(attemptExtendsRun({ awarded: 3, max: 4 })).toBe(false);
    expect(attemptExtendsRun({ awarded: 0, max: 0 })).toBe(false);
    expect(gradeExtendsRun("good")).toBe(true);
    expect(gradeExtendsRun("easy")).toBe(true);
    expect(gradeExtendsRun("hard")).toBe(false);
    expect(gradeExtendsRun("again")).toBe(false);
  });

  it("resets on a miss and only shows from the threshold", () => {
    let run = 0;
    for (const hit of [true, true, true, false, true]) run = nextRun(run, hit);
    expect(run).toBe(1);
    expect(trailingRun([true, false, true, true, true])).toBe(3);
    expect(trailingRun([])).toBe(0);
    expect(RUN_THRESHOLD).toBe(3);
  });
});
