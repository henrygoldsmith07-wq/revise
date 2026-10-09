// ---------------------------------------------------------------------------
// Opt-in anonymous pilot telemetry.
//
// Default off. When the learner switches pilot telemetry on in
// Settings → Data, outcome events are queued on device and POSTed to
// /api/pilot/events in small batches. Revoking the switch stops the next
// send immediately; queued rows stay on device until deleted with the rest
// of local data.
//
// What leaves the device per event: a rotating pseudonym (minted on device,
// rotated every UTC day), a closed event name, a curriculum subject id, and
// integer counts. No free text, no raw answers, no marks detail, no device
// data. The server stamps the coarse UTC day and cannot be told otherwise.
// ---------------------------------------------------------------------------

export type PilotEventName =
  | "diagnostic.completed"
  | "recommendation.started"
  | "marks.recovered"
  | "proof.completed"
  | "first-loss-to-proof"
  | "proof.blocked";

export interface PilotEvent {
  event: PilotEventName;
  /** Curriculum subject id only; null when not subject-scoped. */
  subjectId?: string | null;
  count?: number | null;
  minutes?: number | null;
}

interface QueuedPilotEvent extends PilotEvent {
  anonId: string;
}

const OUTBOX_KEY = (userId: string) => `revise.pilot.outbox.${userId}`;
const ANON_KEY = (userId: string) => `revise.pilot.anon.${userId}`;
const MAX_QUEUE = 200;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
  return clean || null;
}

function safeInt(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** Rotating pseudonym: stable within a UTC day, fresh afterwards. */
export function pilotAnonId(userId: string): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "00000000-0000-0000-0000-000000000000";
  try {
    const raw = localStorage.getItem(ANON_KEY(userId));
    const today = utcDay();
    if (raw) {
      const parsed = JSON.parse(raw) as { anonId?: unknown; day?: unknown };
      if (typeof parsed.anonId === "string" && parsed.day === today) return parsed.anonId;
    }
    const anonId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
    localStorage.setItem(ANON_KEY(userId), JSON.stringify({ anonId, day: today }));
    return anonId;
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

function readQueue(userId: string): QueuedPilotEvent[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is QueuedPilotEvent =>
      typeof e === "object" && e !== null && typeof (e as { event?: unknown }).event === "string");
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: QueuedPilotEvent[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY(userId), JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Quota or privacy mode: telemetry is expendable, revision is not.
  }
}

/**
 * Queue one outcome event. Never throws, never blocks, never sends on its
 * own — sending happens only in flushPilotEvents, which checks consent.
 */
export function recordPilotEvent(userId: string, event: PilotEvent): void {
  if (typeof window === "undefined") return;
  const queue = readQueue(userId);
  queue.push({
    event: event.event,
    anonId: pilotAnonId(userId),
    ...(safeSubject(event.subjectId) ? { subjectId: safeSubject(event.subjectId)! } : {}),
    ...(safeInt(event.count, 1_000_000) != null ? { count: safeInt(event.count, 1_000_000)! } : {}),
    ...(safeInt(event.minutes, 100_000) != null ? { minutes: safeInt(event.minutes, 100_000)! } : {}),
  });
  writeQueue(userId, queue);
}

/**
 * Send queued events. Call only when pilot telemetry consent is on, the
 * device is online and the learner is signed in. Drops rows the server
 * rejects; keeps the rest for the next flush. Never throws.
 */
export async function flushPilotEvents(userId: string): Promise<{ sent: number; kept: number }> {
  if (typeof window === "undefined" || typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, kept: 0 };
  }
  const queue = readQueue(userId);
  if (!queue.length) return { sent: 0, kept: 0 };
  const batch = queue.slice(0, 50).map((e) => ({
    anonId: e.anonId,
    event: e.event,
    ...(e.subjectId ? { subjectId: e.subjectId } : {}),
    ...(e.count != null ? { count: e.count } : {}),
    ...(e.minutes != null ? { minutes: e.minutes } : {}),
  }));
  try {
    const res = await fetch("/api/pilot/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) return { sent: 0, kept: queue.length };
    const rest = queue.slice(batch.length);
    writeQueue(userId, rest);
    return { sent: batch.length, kept: rest.length };
  } catch {
    return { sent: 0, kept: queue.length };
  }
}

/** Pending count for honest Settings copy ("N events waiting on this device"). */
export function pendingPilotEvents(userId: string): number {
  if (typeof window === "undefined") return 0;
  return readQueue(userId).length;
}

/** Discard the device queue without sending (used on opt-out). */
export function clearPilotQueue(userId: string): void {
  writeQueue(userId, []);
}
