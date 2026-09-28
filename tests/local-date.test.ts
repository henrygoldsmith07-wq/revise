import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  isLocalDateKey,
  localDayOfInstant,
  localDaysBetween,
  todayLocal,
  toLocalDateKey,
} from "@/domain/local-date";
import { formatExamDate } from "@/domain/pace-forecast";
import { nextLessonStreak } from "@/state/lesson-streak";

describe("canonical local calendar days", () => {
  it("distinguishes IsoDate keys from IsoInstant values", () => {
    expect(isLocalDateKey("2026-09-28")).toBe(true);
    expect(isLocalDateKey("2026-09-28T00:00:00.000Z")).toBe(false);
    expect(isLocalDateKey("")).toBe(false);
    expect(isLocalDateKey(null)).toBe(false);
  });

  it("rolls the day at 23:59 → 00:00 in the student's zone", () => {
    const before = new Date("2026-09-28T22:59:00.000Z"); // 23:59 BST
    const after = new Date("2026-09-28T23:01:00.000Z"); // 00:01 BST next day
    expect(toLocalDateKey(before, "Europe/London")).toBe("2026-09-28");
    expect(toLocalDateKey(after, "Europe/London")).toBe("2026-09-29");
  });

  it("handles positive UTC offsets (Sydney) around midnight UTC", () => {
    // 05:00 UTC is 15:00 the same day in Sydney (+10/+11).
    expect(toLocalDateKey(new Date("2026-01-15T05:00:00.000Z"), "Australia/Sydney")).toBe("2026-01-15");
    // 15:00 UTC is 02:00 the next day in Sydney.
    expect(toLocalDateKey(new Date("2026-01-15T15:00:00.000Z"), "Australia/Sydney")).toBe("2026-01-16");
  });

  it("handles negative UTC offsets (New York) around midnight UTC", () => {
    // 03:00 UTC is 22:00/23:00 the previous day in New York.
    expect(toLocalDateKey(new Date("2026-01-15T03:00:00.000Z"), "America/New_York")).toBe("2026-01-14");
    // 10:00 UTC is 05:00 the same day in New York.
    expect(toLocalDateKey(new Date("2026-01-15T10:00:00.000Z"), "America/New_York")).toBe("2026-01-15");
  });

  it("survives the BST spring-forward transition", () => {
    // 2026-03-29: clocks jump 01:00 → 02:00 UTC... in London 00:59 GMT → 02:00 BST.
    expect(toLocalDateKey(new Date("2026-03-29T00:30:00.000Z"), "Europe/London")).toBe("2026-03-29");
    expect(toLocalDateKey(new Date("2026-03-29T01:30:00.000Z"), "Europe/London")).toBe("2026-03-29");
  });

  it("survives the BST fall-back transition", () => {
    // 2026-10-25: clocks fall back; 00:30 UTC and 01:30 UTC are both 2026-10-25 locally.
    expect(toLocalDateKey(new Date("2026-10-25T00:30:00.000Z"), "Europe/London")).toBe("2026-10-25");
    expect(toLocalDateKey(new Date("2026-10-25T01:30:00.000Z"), "Europe/London")).toBe("2026-10-25");
  });

  it("renders the authored exam date key identically in every zone", () => {
    expect(formatExamDate("2026-06-01")).toBe("1 June");
    expect(formatExamDate("2026-06-01T00:00:00.000Z")).toBe("1 June");
  });

  it("adds calendar days across month boundaries", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(localDaysBetween("2026-09-01", "2026-09-28")).toBe(27);
    expect(localDaysBetween("2026-09-28", "2026-09-28")).toBe(0);
  });

  it("keeps streaks on local days, not UTC days", () => {
    const streak = nextLessonStreak({ count: 2, lastDay: "2026-09-27" }, "2026-09-28", "2026-09-27");
    expect(streak).toEqual({ count: 3, lastDay: "2026-09-28" });
    // A 23:30 BST review and a 00:30 BST review fall on different local days.
    const late = localDayOfInstant("2026-09-28T22:30:00.000Z", "Europe/London");
    const early = localDayOfInstant("2026-09-28T23:30:00.000Z", "Europe/London");
    expect(late).toBe("2026-09-28");
    expect(early).toBe("2026-09-29");
  });

  it("todayLocal defaults to the device zone but accepts an explicit one", () => {
    const now = new Date("2026-09-28T23:30:00.000Z");
    expect(todayLocal(now, "Europe/London")).toBe("2026-09-29");
    expect(todayLocal(now, "America/New_York")).toBe("2026-09-28");
    expect(isLocalDateKey(todayLocal(now))).toBe(true);
  });
});
