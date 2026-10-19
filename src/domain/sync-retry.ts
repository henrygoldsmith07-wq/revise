// ---------------------------------------------------------------------------
// Outbox retry policy: which push failures spend an item's retry budget.
//
// The outbox parks an item after MAX_OUTBOX_ATTEMPTS failed deliveries so one
// poison payload cannot block the queue forever. Counting *every* failure
// against that budget parked whole queues during an ordinary outage: sync runs
// every few seconds while a session is active, so ten timeouts took minutes.
//
// A transient failure (no network, timeout, 5xx, 429, an expired session that
// the client refreshes) says nothing about the row, so it does not count; the
// drain backs off instead. A permanent failure (a 4xx the server returns for
// this request's content: constraint, type, permission) does count.
//
// Pure: no clock, no I/O. Callers pass `now` and persist the result.
// ---------------------------------------------------------------------------

export type SyncFailureClass = "transient" | "permanent";

export interface SyncErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** Postgres SQLSTATE classes that describe the server, not the request. */
const TRANSIENT_SQLSTATE_CLASSES = new Set([
  "08", // connection exception
  "53", // insufficient resources (disk, memory, too many connections)
  "57", // operator intervention: statement timeout (57014), shutdown (57P01..)
  "58", // system error (I/O)
]);

/** Individual SQLSTATEs and PostgREST codes that are worth retrying unchanged. */
const TRANSIENT_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "PGRST000", // could not connect to the database
  "PGRST001", // database connection error
  "PGRST002", // schema cache not ready
  "PGRST003", // timed out acquiring a pool connection
  "PGRST301", // JWT expired / invalid: the client refreshes the session
  "PGRST303", // JWT claims check: same
]);

/**
 * Transport-level messages. Deliberately narrow: an unknown message without a
 * status or code keeps the old behaviour (it counts), so a genuinely broken
 * row still parks instead of retrying for ever.
 */
const TRANSIENT_MESSAGE = /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out|timeout|jwt expired|econnreset|econnrefused|etimedout|enotfound|eai_again|socket hang up|the operation was aborted|aborterror/i;

export function classifySyncError(error: SyncErrorLike | null | undefined): SyncFailureClass {
  if (!error) return "permanent";
  const status = typeof error.status === "number" ? error.status : undefined;
  if (status !== undefined) {
    // status 0 is what fetch reports for an opaque network failure.
    if (status === 0 || status === 408 || status === 425 || status === 429 || status === 401 || status >= 500) return "transient";
  }
  const code = typeof error.code === "string" ? error.code.trim() : "";
  if (code) {
    if (TRANSIENT_CODES.has(code)) return "transient";
    if (/^[0-9A-Z]{5}$/.test(code) && TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2))) return "transient";
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") return "transient";
  if (TRANSIENT_MESSAGE.test(error.message ?? "")) return "transient";
  return "permanent";
}

/** First retry delay after a transient push failure. */
export const SYNC_BACKOFF_BASE_MS = 15_000;
/** Longest the drain waits between transient retries. */
export const SYNC_BACKOFF_MAX_MS = 15 * 60_000;

/**
 * Exponential backoff, capped: 15 s, 30 s, 1 min, 2 min … 15 min. `failures`
 * counts consecutive transient failures including the one just seen.
 * Deterministic (no jitter): each tab already runs on its own timer and the
 * cross-tab lock serialises them.
 */
export function syncBackoffDelayMs(failures: number): number {
  const n = Math.max(1, Math.floor(Number.isFinite(failures) ? failures : 1));
  return Math.min(SYNC_BACKOFF_MAX_MS, SYNC_BACKOFF_BASE_MS * 2 ** Math.min(n - 1, 16));
}

export interface SyncBackoffState {
  /** Consecutive transient failures. */
  failures: number;
  /** ISO instant before which the drain should not push again. */
  nextAttemptAt: string;
  lastError?: string;
}

export function nextSyncBackoff(previous: SyncBackoffState | null | undefined, now: Date, lastError?: string): SyncBackoffState {
  const failures = (previous?.failures ?? 0) + 1;
  return {
    failures,
    nextAttemptAt: new Date(now.getTime() + syncBackoffDelayMs(failures)).toISOString(),
    ...(lastError ? { lastError } : {}),
  };
}

export function syncBackoffActive(state: SyncBackoffState | null | undefined, now: Date): boolean {
  if (!state) return false;
  const until = Date.parse(state.nextAttemptAt);
  return Number.isFinite(until) && until > now.getTime();
}
