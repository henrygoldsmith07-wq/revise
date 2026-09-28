// ---------------------------------------------------------------------------
// Canonical local calendar-day utility.
//
// Revise has two different day concepts and they must never be confused:
//
// - IsoInstant (full ISO-8601 UTC timestamp): when something happened.
//   Ordering, recency math and sync freshness use instants.
// - IsoDate (YYYY-MM-DD): a calendar day as the student experiences it —
//   due cards, streaks, exam countdowns, planner days, mistake dues,
//   forecasts. A day flips at local midnight, never at UTC midnight.
//
// `new Date().toISOString().slice(0, 10)` is the UTC day, which is the wrong
// answer for every calendar concept west or east of Greenwich around midnight
// (and on every DST transition). All calendar-day code must go through this
// module. True UTC-day needs (rate limiting, filename stamps, deterministic
// synthetic fixtures) keep their own explicit UTC helpers and must not import
// from here.
// ---------------------------------------------------------------------------

import type { IsoDate } from "./types";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the value is a YYYY-MM-DD calendar-day string. */
export function isLocalDateKey(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [y = NaN, m = NaN, d = NaN] = value.split("-").map(Number);
  return y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/**
 * Calendar-day key for an instant in a time zone.
 *
 * Defaults to the device's local zone (what the student means by "today").
 * Pass an explicit IANA zone in tests or server-side rendering to make the
 * conversion deterministic regardless of the machine's TZ.
 */
export function toLocalDateKey(date: Date, timeZone?: string): IsoDate {
  if (!timeZone) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The student's local "today". */
export function todayLocal(now: Date = new Date(), timeZone?: string): IsoDate {
  return toLocalDateKey(now, timeZone);
}

/**
 * Local calendar-day key for a persisted ISO instant (`createdAt`,
 * `reviewedAt`, `lastStudiedAt`). Comparing this against `todayLocal()` keeps
 * recency windows consistent around local midnight; truncating the instant
 * string with `.slice(0, 10)` would compare a UTC day against a local day.
 */
export function localDayOfInstant(instant: string, timeZone?: string): IsoDate {
  return toLocalDateKey(new Date(instant), timeZone);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD, either zone-consistent). */
export function localDaysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Add (or subtract) whole calendar days to a YYYY-MM-DD key. Pure date arithmetic. */
export function addLocalDays(day: IsoDate, offsetDays: number): IsoDate {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const date = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
}
