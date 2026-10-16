import { addLocalDays, localDaysBetween, toLocalDateKey } from "./local-date";
import type { Attempt, Card, ExamDate, ReviewLog } from "./types";

import type { SundayPlanSnapshot } from "./types-sunday-plan";
export type { SundayPlanSnapshot } from "./types-sunday-plan";

export interface SundayPlanInput {
  now: Date;
  /** Explicit zone makes local Sunday boundaries deterministic, including DST. */
  timeZone: string;
  subjectIds: readonly string[];
  /** Keeps reviews of a since-deleted card attributable to an enrolled topic. */
  subjectTopicIds?: readonly string[];
  attempts: ReadonlyArray<Pick<Attempt, "id" | "subjectId" | "topicIds" | "createdAt">>;
  reviewLogs: ReadonlyArray<Pick<ReviewLog, "id" | "topicId" | "reviewedAt">>;
  cards: ReadonlyArray<Pick<Card, "id" | "subjectId" | "topicId" | "due" | "state" | "reps" | "suspended" | "buriedUntil">>;
  examDates: ReadonlyArray<Pick<ExamDate, "date" | "label" | "subjectId">>;
}

/** Calendar arithmetic uses date keys, not elapsed 24-hour periods. */
export function sundayWeekStart(now: Date, timeZone: string): string {
  const today = toLocalDateKey(now, timeZone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addLocalDays(today, -weekday);
}

/** First snapshot wins for a Sunday week. Clock/zone rollback cannot resend it. */
export function retainedSundayPlan(existing: SundayPlanSnapshot | undefined, now: Date, timeZone: string): SundayPlanSnapshot | null {
  return existing?.version === 1 && existing.weekStart >= sundayWeekStart(now, timeZone) ? existing : null;
}

/** A read-only preview uses exactly the same evidence rules as the saved message. */
export function buildSundayPlan(input: SundayPlanInput): SundayPlanSnapshot {
  const { now, timeZone } = input;
  const today = toLocalDateKey(now, timeZone);
  const weekStart = sundayWeekStart(now, timeZone);
  const from = addLocalDays(weekStart, -7);
  const previousFrom = addLocalDays(from, -7);
  const subjects = new Set(input.subjectIds);
  const cards = input.cards.filter((card) => subjects.has(card.subjectId));
  const topicIds = new Set([...cards.map((card) => card.topicId), ...(input.subjectTopicIds ?? [])]);
  const validInstant = (instant: string) => Number.isFinite(Date.parse(instant)) && Date.parse(instant) <= now.getTime();
  const attempts = [...new Map(input.attempts.filter((attempt) => subjects.has(attempt.subjectId) && validInstant(attempt.createdAt)).map((row) => [row.id, row])).values()];
  for (const attempt of attempts) for (const topicId of attempt.topicIds) topicIds.add(topicId);
  const reviews = [...new Map(input.reviewLogs.filter((review) => validInstant(review.reviewedAt) && topicIds.has(review.topicId)).map((row) => [row.id, row])).values()];
  const inWindow = (instant: string, start: string, end: string) => {
    const day = toLocalDateKey(new Date(instant), timeZone);
    return day >= start && day < end;
  };
  const lastAttempts = attempts.filter((row) => inWindow(row.createdAt, from, weekStart));
  const lastReviews = reviews.filter((row) => inWindow(row.reviewedAt, from, weekStart));
  const practicedTopics = new Set([...lastAttempts.flatMap((row) => row.topicIds), ...lastReviews.map((row) => row.topicId)]);
  const latestActivityAt = [...attempts.map((row) => row.createdAt), ...reviews.map((row) => row.reviewedAt)].sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const dueReviews = cards.filter((card) => card.state !== 0 && card.reps > 0 && !card.suspended && (!card.buriedUntil || card.buriedUntil <= today) && card.due <= today).length;
  // A date must really exist, not just look like YYYY-MM-DD (e.g. 30 February).
  const realDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && addLocalDays(date, 0) === date;
  const exam = input.examDates.filter((row) => subjects.has(row.subjectId) && realDate(row.date) && row.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.subjectId.localeCompare(b.subjectId))[0];
  const nearestExam = exam ? { date: exam.date, label: exam.label, subjectId: exam.subjectId, days: localDaysBetween(today, exam.date) } : null;
  const actions: SundayPlanSnapshot["actions"] = [];
  if (dueReviews > 0) actions.push({ label: "Review due cards", href: "/review", reason: `${dueReviews} previously studied card${dueReviews === 1 ? " is" : "s are"} due at capture.` });
  if (nearestExam) actions.push({ label: "Practise for your next exam", href: `/practice?subject=${encodeURIComponent(nearestExam.subjectId)}`, reason: `${nearestExam.label || "Exam"}: ${nearestExam.date}, a date you saved.` });
  else actions.push({ label: "Add a real exam date", href: "/settings", reason: "No upcoming exam date is saved; this plan does not invent one." });
  if (dueReviews === 0 && !nearestExam) actions.push({ label: lastAttempts.length + lastReviews.length > 0 ? "Choose your next practice" : "Start a quick check", href: lastAttempts.length + lastReviews.length > 0 ? "/practice" : "/diagnostic", reason: "Build practice evidence with a short session." });
  return {
    version: 1,
    weekStart,
    nextSunday: addLocalDays(weekStart, 7),
    capturedAt: now.toISOString(),
    timeZone,
    lastWeek: {
      from,
      through: addLocalDays(weekStart, -1),
      attempts: lastAttempts.length,
      reviews: lastReviews.length,
      topics: practicedTopics.size,
      previousAttempts: attempts.filter((row) => inWindow(row.createdAt, previousFrom, from)).length,
      previousReviews: reviews.filter((row) => inWindow(row.reviewedAt, previousFrom, from)).length,
    },
    latestActivityAt,
    freshness: !latestActivityAt ? "no-data" : toLocalDateKey(new Date(latestActivityAt), timeZone) < from ? "old" : "recent",
    dueReviews,
    nearestExam,
    actions,
  };
}

export function sundayActivityMessage(plan: SundayPlanSnapshot): string {
  const week = plan.lastWeek;
  if (week.attempts + week.reviews === 0) return "No practice answers or card reviews were recorded last week on this device.";
  const current = week.attempts + week.reviews;
  const previous = week.previousAttempts + week.previousReviews;
  const difference = current - previous;
  const change = difference === 0 ? "the same number of recorded activities as the week before" : `${Math.abs(difference)} ${difference > 0 ? "more" : "fewer"} recorded activit${Math.abs(difference) === 1 ? "y" : "ies"} than the week before`;
  return `${week.attempts} practice answer${week.attempts === 1 ? "" : "s"} and ${week.reviews} card review${week.reviews === 1 ? "" : "s"} across ${week.topics} topic${week.topics === 1 ? "" : "s"}; ${change}.`;
}
