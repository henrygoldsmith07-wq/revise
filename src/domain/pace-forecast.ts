// ---------------------------------------------------------------------------
// Honest pace forecast: "at this pace, X topics still untouched before your
// date". No fake pass percentages.
//
// The app must never invent a projection. Every number here is measured:
//   - untouched      topics with zero evidence, counted from the mastery map;
//   - pace           distinct topics touched per day, averaged over the last
//                    REVIEW_PACE_WINDOW_DAYS *including idle days* — a student
//                    who studied once this week gets a slower pace than one
//                    who studied every day, because that is the honest
//                    sustained rate;
//   - days to exam   the nearest enrolled exam date at or after today;
//   - projected      untouched − pace × days, clamped at 0.
//
// The output is deliberately a count, never a "you'll pass with 92%" claim.
// Pure domain: no React, no storage, injectable clock.
// ---------------------------------------------------------------------------

import type { ExamDate, Id, ReviewLog, TopicMastery } from "./types";
import { allTopics } from "./curriculum";

/** How far back the pace is measured, in calendar days (inclusive of today). */
export const REVIEW_PACE_WINDOW_DAYS = 7;

export interface PaceForecastInput {
  now: Date;
  /** Subjects the student is enrolled on (settings.subjectIds). */
  subjectIds: Id[];
  mastery: TopicMastery[];
  /** Card-grade events; the pace signal. */
  reviewLogs: ReviewLog[];
  /** Enrolled exam dates (store.exams). */
  examDates: ExamDate[];
}

export interface PaceForecast {
  /** Nearest enrolled exam date at or after today, if any. */
  daysUntilExam: number | null;
  examLabel: string | null;
  /** Topics with zero evidence across enrolled subjects. */
  untouchedNow: number;
  /** Distinct topics touched per day, averaged over the window (may be 0). */
  topicsPerDay: number;
  /** Days inside the window that had at least one review. */
  activeDays: number;
  /** How many of the untouched topics the pace is projected to start. */
  projectedCovered: number;
  /** untouchedNow − projectedCovered, clamped at 0. */
  projectedUntouched: number;
  /** One honest plain-language sentence; never contains a percentage. */
  sentence: string;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Calendar-day distance from `now` to an IsoDate, in whole days (≥ 0). */
export function daysUntil(now: Date, isoDate: string): number {
  const target = Date.parse(`${dateKey(isoDate)}T00:00:00.000Z`);
  const today = Date.parse(`${dateKey(now.toISOString())}T00:00:00.000Z`);
  return Math.round((target - today) / 86_400_000);
}

export function formatExamDate(isoDate: string): string {
  const d = new Date(`${dateKey(isoDate)}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function forecastUntouched(input: PaceForecastInput): PaceForecast | null {
  const { now, subjectIds, mastery, reviewLogs, examDates } = input;

  // --- untouched topics (zero evidence) ------------------------------------
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));
  const topics = allTopics(subjectIds);
  const untouchedIds = topics.filter((t) => (masteryByTopic.get(t.id)?.attempts ?? 0) <= 0);
  const untouchedNow = untouchedIds.length;
  if (untouchedNow === 0) return null; // nothing left to forecast about

  // --- nearest enrolled exam date ------------------------------------------
  const enrolled = new Set(subjectIds);
  const upcoming = examDates
    .filter((e) => enrolled.has(e.subjectId))
    .map((e) => ({ days: daysUntil(now, e.date), label: e.label, date: e.date }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days);
  if (upcoming.length === 0) return null; // no date yet — no forecast to make

  const nearest = upcoming[0];
  const daysUntilExam = nearest.days;

  // --- pace: distinct topics touched per day over the window ----------------
  const windowStart = new Date(now.getTime() - (REVIEW_PACE_WINDOW_DAYS - 1) * 86_400_000);
  const startKey = dateKey(windowStart.toISOString());
  const todayKey = dateKey(now.toISOString());

  const touchedByDay = new Map<string, Set<Id>>();
  for (const log of reviewLogs) {
    const key = dateKey(log.reviewedAt);
    if (key < startKey || key > todayKey) continue;
    let set = touchedByDay.get(key);
    if (!set) {
      set = new Set();
      touchedByDay.set(key, set);
    }
    set.add(log.topicId);
  }

  const activeDays = touchedByDay.size;
  // Sustained pace: total topic-touches ÷ window length, so idle days count.
  let touches = 0;
  for (const set of touchedByDay.values()) touches += set.size;
  const topicsPerDay = activeDays === 0 ? 0 : touches / REVIEW_PACE_WINDOW_DAYS;

  const projectedCovered = Math.floor(topicsPerDay * daysUntilExam);
  const projectedUntouched = Math.max(0, untouchedNow - projectedCovered);

  const dateLabel = formatExamDate(nearest.date);
  // Labels often already end in "exam" ("Biology exam") — never read
  // "Biology exam exam".
  const raw = nearest.label ?? "";
  const target = raw ? (raw.toLowerCase().endsWith(" exam") ? raw : `${raw} exam`) : "your exam";

  let sentence: string;
  if (activeDays === 0) {
    sentence = `No reviews in the last ${REVIEW_PACE_WINDOW_DAYS} days — at this pace, all ${untouchedNow} untouched ${
      untouchedNow === 1 ? "topic" : "topics"
    } stay untouched before the ${target} on ${dateLabel}.`;
  } else if (projectedUntouched > 0) {
    sentence = `At this pace, ${projectedUntouched} of ${untouchedNow} untouched ${
      untouchedNow === 1 ? "topic" : "topics"
    } still untouched before the ${target} on ${dateLabel}.`;
  } else {
    sentence = `On track — at this pace, every untouched topic is covered before the ${target} on ${dateLabel}.`;
  }

  return {
    daysUntilExam,
    examLabel: target,
    untouchedNow,
    topicsPerDay,
    activeDays,
    projectedCovered,
    projectedUntouched,
    sentence,
  };
}