import type { Card, Id, IsoInstant } from "./types";

// ---------------------------------------------------------------------------
// Sync conflict UX + multi-device race handling.
//
// The wire-level rule lives in src/data/sync.ts (last-write-wins by
// updatedAt per row). This module adds the *user-visible* layer: detect that
// a conflict happened, explain it without jargon, pick the right winner, and
// expose deterministic helpers for concurrent branches the tests can run without
// IndexedDB or Supabase.
//
// Race model: two devices edit the same row while offline, then both sync.
// The later updatedAt wins — the earlier one's change is not lost entirely
// (its data row stays on the server), but the UI should not silently pretend
// nothing happened. These helpers make that transition examinable.
// ---------------------------------------------------------------------------

export type ConflictResolution = "last_write_wins" | "keep_local" | "keep_remote" | "manual";

export interface Conflict<T extends { id?: Id; userId?: Id; updatedAt: IsoInstant; [k: string]: unknown }> {
  id: Id;
  local: T;
  remote: T;
  /** Which side was newer by updatedAt. */
  newer: "local" | "remote" | "tie";
  /** What LWW would do. */
  winner: T;
  resolution: ConflictResolution;
  /** Shown in the UI. Never jargon. */
  explanation: string;
}

export function isNewerByTimestamp(
  a: { updatedAt: IsoInstant; [k: string]: unknown },
  b: { updatedAt: IsoInstant; [k: string]: unknown },
): boolean {
  return String(a.updatedAt) >= String(b.updatedAt);
}

/**
 * Detect whether two versions of the same row conflict (both edited since the
 * last common ancestor's updatedAt). Returns null when they are the same or
 * one is a clean descendant (fast-forward).
 */
export function detectConflict<T extends { id?: Id; userId?: Id; updatedAt: IsoInstant; [k: string]: unknown }>(
  baseline: T | null,
  local: T,
  remote: T,
): Conflict<T> | null {
  if (local.updatedAt === remote.updatedAt && JSON.stringify(local) === JSON.stringify(remote)) {
    return null; // identical
  }
  const baseTime = baseline?.updatedAt ?? "";
  const localChanged = baseTime === "" || String(local.updatedAt) > baseTime;
  const remoteChanged = baseTime === "" || String(remote.updatedAt) > baseTime;
  if (!localChanged && !remoteChanged) return null;
  if (localChanged !== remoteChanged) return null; // only one side changed → fast-forward

  // Both changed — conflict unless one is the newer of the two and the other
  // is older than baseline (already handled above).
  const localNewer = isNewerByTimestamp(local, remote);
  const remoteNewer = isNewerByTimestamp(remote, local);
  let newer: Conflict<T>["newer"];
  let winner: T;
  if (local.updatedAt === remote.updatedAt) {
    // Tie — remote wins deterministically so every device converges.
    newer = "tie";
    winner = remote;
  } else if (localNewer) {
    newer = "local";
    winner = local;
  } else {
    newer = "remote";
    winner = remote;
  }
  const resolution: ConflictResolution = "last_write_wins";
  const explanation =
    newer === "tie"
      ? "Both devices saved at the same second — the server's version was kept so every device converges. No data was deleted; open the history to restore either side."
      : newer === "local"
        ? "This device's version was newer, so it was kept. The other device's change is on the server — restore it from history if needed."
        : "The other device's version was newer, so it won. Your local change is still on this device's history — restore it if needed.";
  const id = (String(local.id ?? local.userId ?? remote.id ?? "")) as Id;
  return { id, local, remote, newer, winner, resolution, explanation };
}

/**
 * Merge FSRS card state when a conflict occurs. The winner's FSRS fields
 * (stability/difficulty/reps/lapses/state/due/lastReviewedAt) are kept
 * because they encode the *latest* memory state. Content fields (front/back,
 * tags, note) from the loser are surfaced as a restorable note rather than
 * silently dropped.
 */
export function mergeCardConflict(local: Card, remote: Card): Card & { conflictNote?: string } {
  const withTime = (c: Card): Card & { updatedAt: IsoInstant } => ({ ...c, updatedAt: c.updatedAt });
  const conflict = detectConflict(
    null,
    withTime(local) as unknown as Card & { updatedAt: IsoInstant } & Record<string, unknown>,
    withTime(remote) as unknown as Card & { updatedAt: IsoInstant } & Record<string, unknown>,
  );
  if (!conflict) return isNewerByTimestamp(local as unknown as { updatedAt: IsoInstant }, remote as unknown as { updatedAt: IsoInstant }) ? local : remote;
  const winner = conflict.winner as unknown as Card;
  const loser = winner === (local as unknown) ? remote : local;
  const fieldsChanged: string[] = [];
  for (const k of ["front", "back", "note", "tags", "specPointIds"] as const) {
    const lv = JSON.stringify((local as unknown as Record<string, unknown>)[k] ?? null);
    const rv = JSON.stringify((remote as unknown as Record<string, unknown>)[k] ?? null);
    if (lv !== rv) fieldsChanged.push(k);
  }
  if (!fieldsChanged.length) return winner;
  const note = `Merged from two devices at ${conflict.winner.updatedAt}: fields ${fieldsChanged.join(", ")} differed. Winner's FSRS kept; other side preserved below. Previous values: ${JSON.stringify(
    Object.fromEntries(fieldsChanged.map((k) => [k, (loser as unknown as Record<string, unknown>)[k]])),
  ).slice(0, 800)}`;
  return { ...winner, conflictNote: note };
}

/**
 * Deterministic multi-device race simulator for tests / CI.
 *
 * Given a starting row and N concurrent branches (each a function that mutates
 * it and advances updatedAt by a different offset), return the final winner
 * and the full history of conflicts. Runs purely in memory and in a fixed
 * order so flakes cannot happen.
 */
export function simulateConcurrentWrites<T extends { id: Id; updatedAt: IsoInstant; [k: string]: unknown }>(
  baseline: T,
  branches: Array<{ label: string; mutate: (row: T) => Partial<T>; offsetMs: number }>,
): { winner: T; history: Array<{ label: string; row: T; conflict: Conflict<T> | null }> } {
  const baseTime = new Date(baseline.updatedAt).getTime();
  const candidates: Array<{ label: string; row: T }> = branches.map(({ label, mutate, offsetMs }) => {
    const patch = mutate({ ...baseline });
    const row = { ...baseline, ...patch, updatedAt: new Date(baseTime + offsetMs).toISOString() } as T;
    return { label, row };
  });
  // Latest updatedAt wins; tie broken by label for determinism (not Math.random).
  candidates.sort((a, b) => (a.row.updatedAt !== b.row.updatedAt ? b.row.updatedAt.localeCompare(a.row.updatedAt) : a.label.localeCompare(b.label)));
  const winner = candidates[0].row;
  const history = candidates.map(({ label, row }) => ({
    label,
    row,
    conflict: row === winner ? null : detectConflict(baseline, winner, row),
  }));
  return { winner, history };
}

/**
 * Outbox ordering invariant: all pending upserts for the same id collapse to the
 * last one. This pure helper mirrors what src/data/sync.ts does at drain time
 * so tests can assert the queuing holds without touching IndexedDB.
 */
export function collapseOutboxById<T extends { id: Id }>(items: Array<{ id: Id; payload: T; queuedAt: IsoInstant }>): Map<Id, T> {
  const byId = new Map<Id, { payload: T; queuedAt: IsoInstant }>();
  for (const item of items) {
    const cur = byId.get(item.id);
    if (!cur || String(item.queuedAt) >= String(cur.queuedAt)) byId.set(item.id, { payload: item.payload, queuedAt: item.queuedAt });
  }
  return new Map([...byId.entries()].map(([k, v]) => [k, v.payload]));
}

/** UX copy for the sync status badge in the header. */
export function syncStatusCopy(input: { lastPulledAt?: IsoInstant; pending: number; lastError?: string }): string {
  if (input.lastError) return `Sync paused — ${input.lastError.slice(0, 80)}. Your work is still saved locally.`;
  if (input.pending > 0) return `${input.pending} change${input.pending === 1 ? "" : "s"} queued — will sync when back online.`;
  if (!input.lastPulledAt) return "Working offline — changes save locally and sync when online.";
  const ageMs = Date.now() - new Date(input.lastPulledAt).getTime();
  if (Number.isFinite(ageMs) && ageMs < 90_000) return "Synced just now.";
  if (Number.isFinite(ageMs) && ageMs < 3_600_000) return `Last synced ${Math.round(ageMs / 60_000)} min ago.`;
  return "Synced — changes save locally first and sync when online.";
}
