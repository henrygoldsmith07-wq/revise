import { describe, expect, it } from "vitest";
import { buildIcsCalendar, foldIcsLine, icsDateTime, icsEscape, isoDatePlusDays } from "@/domain/calendar-export";
import type { ExamDate, PlannedSession } from "@/domain/types";

// The .ics export: only pending sessions, all future exams as all-day events,
// CRLF line endings, 75-octet folding, escaping that survives commas,
// semicolons and newlines in reason text.

function session(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: "s1",
    userId: "u1",
    date: "2026-10-06",
    startMinute: 17 * 60 + 30,
    minutes: 20,
    subjectId: "wjec-physics",
    topicId: "t1",
    activity: "practice",
    reason: "Weak on application",
    status: "pending",
    ...overrides,
  };
}

function exam(overrides: Partial<ExamDate> = {}): ExamDate {
  return {
    id: "e1",
    userId: "u1",
    subjectId: "wjec-physics",
    date: "2026-11-12",
    label: "Paper 1",
    ...overrides,
  };
}

describe("icsEscape", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    expect(icsEscape("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e");
  });
});

describe("icsDateTime", () => {
  it("formats a floating local datetime", () => {
    expect(icsDateTime("2026-10-06", 1050)).toBe("20261006T173000");
    expect(icsDateTime("2026-10-06", 0)).toBe("20261006T000000");
  });
});

describe("isoDatePlusDays", () => {
  it("crosses month and year boundaries", () => {
    expect(isoDatePlusDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(isoDatePlusDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("foldIcsLine", () => {
  it("keeps short lines whole and folds long ones with a space continuation", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
    const long = "DESCRIPTION:" + "x".repeat(120);
    const folded = foldIcsLine(long);
    const [head, tail] = folded.split("\r\n ");
    expect(head.length).toBeLessThanOrEqual(75);
    expect((head + tail).slice("DESCRIPTION:".length)).toBe("x".repeat(120));
  });
});

describe("buildIcsCalendar", () => {
  it("exports pending sessions as timed events with CRLF endings", () => {
    const ics = buildIcsCalendar({
      sessions: [session()],
      exams: [],
      subjectName: () => "Physics",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:s1@revise.app");
    expect(ics).toContain("DTSTART:20261006T173000");
    expect(ics).toContain("DTEND:20261006T175000");
    expect(ics).toContain("SUMMARY:Physics — Exam questions");
    expect(ics).toContain("DESCRIPTION:Weak on application");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).not.toContain("\n[^\r]");
  });

  it("exports exams as all-day events ending the next day", () => {
    const ics = buildIcsCalendar({ sessions: [], exams: [exam()], subjectName: () => "Physics" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261112");
    expect(ics).toContain("DTEND;VALUE=DATE:20261113");
    expect(ics).toContain("SUMMARY:Physics exam");
  });

  it("skips completed, skipped and missed sessions", () => {
    const ics = buildIcsCalendar({
      sessions: [
        session({ id: "s-done", status: "done" }),
        session({ id: "s-skip", status: "skipped" }),
        session({ id: "s-miss", status: "missed" }),
      ],
      exams: [],
      subjectName: () => "Physics",
    });
    expect(ics).not.toContain("s-done");
    expect(ics).not.toContain("s-skip");
    expect(ics).not.toContain("s-miss");
  });

  it("escapes commas and semicolons from reasons and labels", () => {
    const ics = buildIcsCalendar({
      sessions: [session({ reason: "Two things: recall, then repair" })],
      exams: [exam({ label: "Unit 1, 2 & 3" })],
      subjectName: () => "Physics",
    });
    expect(ics).toContain("Two things: recall\\, then repair");
    expect(ics).toContain("Unit 1\\, 2 & 3");
  });

  it("folds long content lines so no physical line exceeds 75 octets", () => {
    const ics = buildIcsCalendar({
      sessions: [session({ id: "s-long", reason: "r".repeat(160) })],
      exams: [],
      subjectName: () => "Physics",
    });
    expect(ics).toContain("\r\n ");
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, "")).toContain(`r`.repeat(160));
  });

  it("produces a valid empty calendar when there is nothing ahead", () => {
    const ics = buildIcsCalendar({ sessions: [], exams: [], subjectName: () => "Physics" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
