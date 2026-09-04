import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { forecastUntouched, REVIEW_PACE_WINDOW_DAYS, daysUntil } from "@/domain/pace-forecast";
import { allTopics } from "@/domain/curriculum";
import type { ExamDate, Id, ReviewLog, TopicMastery } from "@/domain/types";

// ---------------------------------------------------------------------------
// Honest pace forecast: measured numbers only, no fake pass percentages.
// ---------------------------------------------------------------------------

const SUBJECT = "aqa-alevel-biology";
const TOPICS = allTopics([SUBJECT]).map((t) => t.id);
const topic = (i: number) => TOPICS[i];

const NOW = new Date("2026-06-01T12:00:00.000Z");

const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

function log(daysAgo: number, topicId: Id): ReviewLog {
  return {
    id: `log-${daysAgo}-${topicId}`,
    userId: "u1",
    cardId: "c1",
    topicId,
    grade: "good",
    elapsedMs: 8000,
    reviewedAt: iso(daysAgo),
  };
}

function mastery(topicId: Id, attempts: number): TopicMastery {
  return {
    topicId,
    subjectId: SUBJECT,
    mastery: attempts > 0 ? 0.7 : 0,
    retention: attempts > 0 ? 0.8 : 0,
    confidence: attempts > 0 ? 0.9 : 0,
    attempts,
    cardsTotal: 40,
    cardsDue: 0,
    accuracy: attempts > 0 ? 0.7 : 0,
    weak: false,
    lastStudiedAt: attempts > 0 ? iso(0) : null,
  };
}

function exam(subjectId: Id, date: string, label = `${subjectId} exam`): ExamDate {
  return { id: `exam-${subjectId}`, userId: "u1", subjectId, date, label };
}

describe("forecastUntouched — honest pace projection", () => {
  it("measures the nearest upcoming exam date in whole days", () => {
    expect(daysUntil(NOW, "2026-06-20")).toBe(19);
    expect(daysUntil(NOW, "2026-06-01")).toBe(0);
    expect(daysUntil(NOW, "2026-05-30")).toBe(-2);
  });

  it("counts untouched topics as topics with zero evidence", () => {
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [mastery(topic(0), 12)],
      reviewLogs: [],
      examDates: [exam(SUBJECT, "2026-06-20")],
    });
    expect(fc).not.toBeNull();
    expect(fc!.untouchedNow).toBe(TOPICS.length - 1);
  });

  it("returns null when every topic has evidence — nothing left to forecast", () => {
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: TOPICS.map((t, i) => mastery(t, 1 + (i % 3))),
      reviewLogs: [],
      examDates: [exam(SUBJECT, "2026-06-20")],
    });
    expect(fc).toBeNull();
  });

  it("returns null when no enrolled subject has an exam date", () => {
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [],
      reviewLogs: [],
      examDates: [exam("edexcel-gcse-maths", "2026-06-20")],
    });
    expect(fc).toBeNull();
  });

  it("picks the nearest date across enrolled subjects", () => {
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT, "aqa-alevel-chemistry"],
      mastery: [],
      reviewLogs: [],
      examDates: [exam("aqa-alevel-chemistry", "2026-07-10"), exam(SUBJECT, "2026-06-15")],
    });
    expect(fc!.daysUntilExam).toBe(14);
  });

  it("projects linearly from the measured pace, including idle days", () => {
    // 7 days: 3 distinct topics touched Mon–Fri, nothing Sat–Sun -> pace 15/7.
    const [t1, t2, t3] = [topic(0), topic(1), topic(2)];
    const logs = [
      log(6, t1), log(6, t2), log(6, t3),
      log(5, t1), log(5, t2),
      log(4, t1), log(4, t2), log(4, t3),
      log(3, t2), log(3, t3),
      log(2, t1), log(2, t2), log(2, t3),
      log(1, t2),
      log(0, t1), log(0, t3),
    ];
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [],
      reviewLogs: logs,
      examDates: [exam(SUBJECT, "2026-06-22")], // 21 days out
    });
    expect(fc).not.toBeNull();
    expect(fc!.activeDays).toBe(7);
    expect(fc!.topicsPerDay).toBeCloseTo(16 / REVIEW_PACE_WINDOW_DAYS);
    // projectedCovered = floor(16/7 * 21) = 48, more than any enrolled deck
    // has untouched -> the honest reading is "on track".
    expect(fc!.projectedCovered).toBe(48);
    expect(fc!.projectedUntouched).toBe(Math.max(0, fc!.untouchedNow - 48));
  });

  it("clamps the projection at zero and says on-track, never a percentage", () => {
    const [t1, t2, t3] = [topic(0), topic(1), topic(2)];
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [],
      reviewLogs: [log(0, t1), log(0, t2), log(0, t3)],
      examDates: [exam(SUBJECT, "2026-06-05")], // 4 days
    });
    // pace = 3/7 -> covers floor(3/7*4)=1 topic; the rest stay untouched.
    expect(fc!.projectedCovered).toBe(1);
    expect(fc!.projectedUntouched).toBe(fc!.untouchedNow - 1);
    expect(fc!.sentence).toContain(`${fc!.untouchedNow - 1} of ${fc!.untouchedNow} untouched topics`);
    expect(fc!.sentence).toContain("still untouched");
    expect(fc!.sentence).not.toContain("%");
  });

  it("says the grim truth when there is no activity at all", () => {
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [],
      reviewLogs: [],
      examDates: [exam(SUBJECT, "2026-06-20")],
    });
    expect(fc!.activeDays).toBe(0);
    expect(fc!.topicsPerDay).toBe(0);
    expect(fc!.sentence).toContain("No reviews in the last 7 days");
    expect(fc!.sentence).toContain("stay untouched");
    expect(fc!.sentence).not.toContain("%");
  });

  it("ignores reviews older than the window — pace is the last 7 days only", () => {
    const [t1, t2, t3] = [topic(0), topic(1), topic(2)];
    const stale = [
      log(40, t1), log(40, t2), log(40, t3),
      log(39, t1), log(39, t2),
      log(38, t1),
    ];
    const fc = forecastUntouched({
      now: NOW,
      subjectIds: [SUBJECT],
      mastery: [],
      reviewLogs: stale,
      examDates: [exam(SUBJECT, "2026-06-20")],
    });
    expect(fc!.activeDays).toBe(0);
    expect(fc!.topicsPerDay).toBe(0);
  });
});

describe("Today page — honest forecast wiring", () => {
  const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

  it("renders the pace forecast line on both the due and fallback branches", () => {
    const source = page();
    expect(source).toContain("PaceForecastLine");
    expect(source).toContain("forecastUntouched");
    // Both branches pass it through.
    expect(source.match(/<PaceForecastLine/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("never shows a pass percentage anywhere on Today", () => {
    expect(page()).not.toContain("pass %");
    expect(page()).not.toContain("predicted grade");
  });
});