// ---------------------------------------------------------------------------
// Phase-entry notices — telling the student when a countdown turns.
//
// The countdown strategy is not constant: a subject inside the final
// fortnight (≤14 days) should do timed papers and weak-topic retests, and a
// subject in the last 72 hours should protect sleep. The switch matters at
// the moment it happens — "Biology has entered the timed-paper fortnight" —
// so this module turns a subject's *transition* into an exam into a
// one-time notice. Pure domain: buckets the run-up, decides when a subject
// newly enters the technique window, and writes the copy. Persistence and
// firing are the data layer's job; this file has no storage, no clock.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

/** ≤ this many days out, timed papers replace breadth work. */
export const TECHNIQUE_WINDOW_DAYS = 14;
/** ≤ this many days out, the strategy is light recall only. */
export const FINAL_WINDOW_DAYS = 3;

/** Coarse phase the countdown sits in, used to spot *transitions*. */
export type PhaseBucket = "early" | "technique" | "final";

export function phaseBucketFor(days: number | null): PhaseBucket | null {
  if (days == null) return null; // no exam on the horizon
  if (days <= FINAL_WINDOW_DAYS) return "final";
  if (days <= TECHNIQUE_WINDOW_DAYS) return "technique";
  return "early";
}

export interface PhaseSubject {
  subjectId: Id;
  name: string;
  /** Days to the next exam (null = none). */
  days: number | null;
}

export interface PhaseNotice {
  subjectId: Id;
  name: string;
  days: number;
  title: string;
  body: string;
}

/**
 * Subjects that have *just* entered the technique window — i.e. their bucket
 * is technique now and it was not technique the last time we recorded one.
 * A subject that was never recorded but is already inside the window counts:
 * the transition happened between visits, and this is the first honest chance
 * to say so. Final-window subjects are not re-notified here.
 */
export function techniqueEntryNotices(
  subjects: PhaseSubject[],
  previous: Record<Id, PhaseBucket | null | undefined>,
): PhaseNotice[] {
  const notices: PhaseNotice[] = [];
  for (const subject of subjects) {
    if (phaseBucketFor(subject.days) !== "technique") continue;
    if (previous[subject.subjectId] === "technique") continue; // already announced
    notices.push({
      subjectId: subject.subjectId,
      name: subject.name,
      days: subject.days ?? TECHNIQUE_WINDOW_DAYS,
      title: `${subject.name} has entered the timed-paper fortnight`,
      body: "Timed papers and weak-topic retests now beat opening new topics — the schedule has been re-weighted for the run-up.",
    });
  }
  return notices;
}

/** The bucket every subject currently sits in, for recording after evaluation. */
export function currentPhaseBuckets(subjects: PhaseSubject[]): Record<Id, PhaseBucket | null> {
  const out: Record<Id, PhaseBucket | null> = {};
  for (const subject of subjects) {
    out[subject.subjectId] = phaseBucketFor(subject.days);
  }
  return out;
}
