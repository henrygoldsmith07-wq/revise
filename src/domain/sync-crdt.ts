import { createEmptyCard, fsrs, generatorParameters, Rating, State } from "ts-fsrs";
import type { Card, CardGradeEvent, CardSyncBase, Id, IsoInstant, LessonProgress, ReviewLog } from "./types";
import { compareStamps, stampJson, type LamportStamp } from "./lamport";

// ---------------------------------------------------------------------------
// CRDT layer for multi-device sync.
//
// The outbox drains per-row upserts; when two devices edited the same row
// offline, last-write-wins discards the earlier write. For most entities that
// is benign (a question is authored once), but for *memory state* it is data
// loss: Device A grading "Again" and Device B grading "Good" on the same card
// are two facts about the student's memory, and LWW keeps only one of them.
//
// The fix used here is operation-based CRDT (state-machine replication):
//
// 1. Every grade is recorded, Lamport-stamped, in the card's `log`. The pair
//    (lamport, deviceId) is a total order, so every replica sorts the log the
//    same way regardless of when events arrive.
// 2. The first stamped event on a card carries `base` — an immutable snapshot
//    of the card's FSRS state just before logging began. Together, base + log
//    are a *complete* description of the card's scheduling history: the FSRS
//    fields are a pure function of replaying the log from the base.
// 3. `syncCardState` computes exactly that. Merging two replicas is: union
//    the logs (dedup by event identity), pick the deterministic base, replay.
//    Concurrent "Again" + "Good" both survive — the replay passes through
//    both, in causal order — and every device converges on one schedule.
// 4. Review logs and attempts are append-only and UUID-keyed, i.e. natural
//    OR-sets: merged by set-union, nothing to resolve.
// 5. Grow-only maps (lesson completions, streak day-records) merge as a union
//    of their per-key maxima.
//
// Everything here is pure and synchronous: the data layer owns I/O, this file
// owns the math, and the tests exercise convergence without a browser.
// ---------------------------------------------------------------------------

/** Same scheduler parameters as domain/scheduling.ts — replay must match live grading. */
const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_fuzz: false, // fuzz is random; replay must be deterministic
    enable_short_term: false,
  }),
);

const GRADE_TO_RATING = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

function eventStamp(e: CardGradeEvent): LamportStamp {
  return { counter: e.lamport, deviceId: e.deviceId };
}

/** Total order over grade events: Lamport counter, then deviceId, then identity. */
function compareEvents(a: CardGradeEvent, b: CardGradeEvent): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.deviceId !== b.deviceId) return compareStamps(eventStamp(a), eventStamp(b));
  return a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : 0;
}

/**
 * Merge two replicas' op logs into their union, deduplicated by event
 * identity. The identity of a grade event is (deviceId, lamport): a device
 * mints at most one event per counter value, so that pair is globally unique.
 * Duplicate arrivals (retried push, re-pulled row) collapse to one event.
 */
export function mergeCardLogs(local: CardGradeEvent[] | undefined, remote: CardGradeEvent[] | undefined): CardGradeEvent[] {
  const byKey = new Map<string, CardGradeEvent>();
  for (const e of [...(local ?? []), ...(remote ?? [])]) {
    byKey.set(`${e.deviceId}:${e.lamport}`, e);
  }
  return [...byKey.values()].sort(compareEvents);
}

/**
 * Deterministically pick the replay base from a merged log: the base attached
 * to the earliest-stamped event that carries one. Every replica evaluates the
 * same choice over the same merged log, so they all replay from the same
 * starting state — the convergence requirement. Bases are immutable once
 * written, so "first writer wins" loses no information.
 */
export function pickBase(log: CardGradeEvent[]): CardSyncBase | null {
  const ordered = [...log].sort(compareEvents);
  for (const e of ordered) if (e.base) return e.base;
  return null;
}

/** Seed an FSRS state from a base snapshot. */
function stateFromBase(card: Card, base: CardSyncBase) {
  const empty = createEmptyCard(new Date(card.createdAt));
  return {
    ...empty,
    due: new Date(`${base.due}T00:00:00.000Z`),
    stability: base.stability,
    difficulty: base.difficulty,
    reps: base.reps,
    lapses: base.lapses,
    state: base.state as State,
  };
}

/** Seed an FSRS state from the card's pristine origin (never-reviewed card). */
function stateFromOrigin(card: Card) {
  const empty = createEmptyCard(new Date(card.createdAt));
  return {
    ...empty,
    due: new Date(`${card.due}T00:00:00.000Z`),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
  };
}

export interface CardMergeResult {
  card: Card;
  /** How many events the replay applied. */
  replayed: number;
  /** True when the replay changed any FSRS field or grew the log. */
  changed: boolean;
}

/**
 * Rebuild a card's FSRS state by replaying its op log from its base.
 *
 * This is the heart of the CRDT: given the same merged log, any two devices
 * (and the server) compute identical FSRS fields. Cards without a log return
 * unchanged — they are still on the legacy last-write-wins path until their
 * next grade stamps them.
 */
export function syncCardState(card: Card): CardMergeResult {
  const log = card.log ?? [];
  if (log.length === 0) return { card, replayed: 0, changed: false };

  const ordered = [...log].sort(compareEvents);
  const base = pickBase(ordered);
  let state = base ? stateFromBase(card, base) : stateFromOrigin(card);
  for (const event of ordered) {
    state = scheduler.next(state, new Date(event.reviewedAt), GRADE_TO_RATING[event.grade]).card;
  }

  // Content fields (front/back/tags/…) come from whichever replica supplied
  // the row; only FSRS fields are reconstructed. updatedAt keeps the row-level
  // wall-clock contract the rest of the sync layer relies on.
  const merged: Card = {
    ...card,
    due: toDateOnly(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    lastReviewedAt: ordered[ordered.length - 1]?.reviewedAt ?? new Date().toISOString(),
    log: ordered,
  };
  const changed =
    merged.stability !== card.stability ||
    merged.difficulty !== card.difficulty ||
    merged.reps !== card.reps ||
    merged.lapses !== card.lapses ||
    merged.state !== card.state ||
    merged.due !== card.due ||
    (card.log?.length ?? 0) !== ordered.length;
  return { card: merged, replayed: ordered.length, changed };
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The pull-side merge for one card row: union the logs, pick the base, replay.
 * `remote` wins content fields when timestamps tie (matching the sync layer's
 * existing LWW tie-break); FSRS fields always come from the replay so both
 * sides converge.
 */
export function mergeCard(local: Card, remote: Card): Card {
  const log = mergeCardLogs(local.log, remote.log);
  const newer = (Date.parse(remote.updatedAt) || 0) >= (Date.parse(local.updatedAt) || 0) ? remote : local;
  return syncCardState({ ...newer, log }).card;
}

/**
 * Convenience for callers holding an already-merged log: stamp the merged
 * total-order key onto the row for diagnostics.
 */
export function headStamp(card: Card): string | null {
  const log = card.log ?? [];
  if (!log.length) return null;
  const last = [...log].sort(compareEvents)[log.length - 1];
  if (!last) return null;
  return stampJson(eventStamp(last));
}

// ---------------------------------------------------------------------------
// Append-only entities (review logs, attempts) are OR-sets: identity is the
// row UUID, so the merge is a set-union and duplicates are impossible. The
// helper exists so the sync layer and tests share one definition of that rule.
// ---------------------------------------------------------------------------

export function mergeAppendOnly<T extends { id: Id }>(local: T[], remote: T[]): T[] {
  const byId = new Map<Id, T>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()];
}

/** A review log carries the same causal stamp as the card event it produced. */
export type StampedReviewLog = ReviewLog & { deviceId: string; lamport: number };

// ---------------------------------------------------------------------------
// Grow-only maps: lesson completions, streak day-records. Each key merges to
// the max/union value seen — commutative, associative, idempotent, and
// loss-free for facts that are only ever added.
// ---------------------------------------------------------------------------

export interface LessonProgressMerge {
  merged: LessonProgress;
  /** Lesson ids gained from `remote`, for UI nudges. */
  gained: string[];
}

/**
 * Merge two replicas' lesson progress as a grow-only set plus a derived
 * streak. Completions union by lesson id; the streak is recomputed from the
 * per-day completion record (`completedOn`), so a device that studied daily
 * for a week offline merges with a device that studied today without either
 * erasing the other — the old LWW rule silently dropped one side's days.
 */
export function mergeLessonProgress(local: LessonProgress, remote: LessonProgress): LessonProgressMerge {
  const completed: Record<string, boolean> = { ...local.completed };
  const completedOn: Record<string, string> = { ...(local.completedOn ?? {}) };
  const gained: string[] = [];

  for (const [lessonId, done] of Object.entries(remote.completed)) {
    if (done && !completed[lessonId]) {
      completed[lessonId] = true;
      gained.push(lessonId);
    }
  }
  for (const [lessonId, day] of Object.entries(remote.completedOn ?? {})) {
    // A lesson completed on two devices keeps the earlier day (min), which is
    // the day it was actually first learned.
    const existing = completedOn[lessonId];
    completedOn[lessonId] = existing && existing <= day ? existing : day;
  }
  // Self-heal: lessons with no day record (completed pre-upgrade, or synced
  // from an older replica) mark "" so the streak math can skip them without
  // mistaking them for a gap.
  for (const lessonId of Object.keys(completed)) {
    if (completed[lessonId] && completedOn[lessonId] === undefined) completedOn[lessonId] = "";
  }

  const merged: LessonProgress = {
    userId: local.userId,
    completed,
    completedOn,
    streak: mergeStreak(local, remote, completedOn),
    updatedAt: maxInstant(local.updatedAt, remote.updatedAt),
  };
  return { merged, gained };
}

/**
 * Consecutive-day streak over the union of completion days, counted back from
 * the most recent completion day. Day-less completions (marked "") neither
 * extend nor break the chain. With no day records at all, fall back to the
 * better of the two replicas' stored streaks — conservative, never invents.
 */
function mergeStreak(local: LessonProgress, remote: LessonProgress, completedOn: Record<string, string>): LessonProgress["streak"] {
  const days = new Set(
    Object.values(completedOn).filter((d): d is string => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
  if (days.size === 0) {
    const best = local.streak.count >= remote.streak.count ? local.streak : remote.streak;
    return { count: best.count, lastDay: best.lastDay };
  }
  const sorted = [...days].sort();
  const lastDay = sorted[sorted.length - 1];
  if (!lastDay) {
    const best = local.streak.count >= remote.streak.count ? local.streak : remote.streak;
    return best;
  }
  let count = 0;
  let cursor = lastDay;
  while (days.has(cursor)) {
    count++;
    cursor = previousDay(cursor);
  }
  return { count, lastDay };
}

function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function maxInstant(a: IsoInstant, b: IsoInstant): IsoInstant {
  return (Date.parse(a) || 0) >= (Date.parse(b) || 0) ? a : b;
}

// ---------------------------------------------------------------------------
// Causal ordering of grading events across devices.
// ---------------------------------------------------------------------------

export interface OrderedEvent {
  /** Which device minted the event. */
  deviceId: string;
  /** The device's Lamport counter at mint time. */
  lamport: number;
  /** Stable tie-break/identity for the payload (row id, review id, …). */
  key: string;
}

/**
 * Topologically sort events into a total causal order.
 *
 * Lamport timestamps give this directly: causally-later events carry a
 * strictly greater counter on the minting device, and concurrent events
 * (never observed each other) break ties deterministically on deviceId, then
 * key. So "device A offline for a week while device B studied daily" drains
 * into the sequence the student actually experienced — A's week-old backlog
 * replays *before* B's newer reviews whenever B's clock had already observed
 * A's last synced counter, and every replica sorts identically.
 */
export function orderEvents<E extends OrderedEvent>(events: E[]): E[] {
  return [...events].sort((a, b) => {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport;
    if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * Group events per device, each device's stream in mint order — the
 * offline-week recovery shape used by diagnostics.
 */
export function groupByDevice<E extends OrderedEvent>(events: E[]): Map<string, E[]> {
  const out = new Map<string, E[]>();
  for (const e of orderEvents(events)) {
    const list = out.get(e.deviceId) ?? [];
    list.push(e);
    out.set(e.deviceId, list);
  }
  return out;
}
