// ---------------------------------------------------------------------------
// Lamport logical timestamps — the ordering primitive behind the sync CRDT.
//
// A Lamport clock is a per-device counter that advances on every local event
// and jumps past any remote counter value when events are observed. Unlike
// wall clocks it never goes backwards, so "device A offline for a week while
// device B studied daily" orders by *causality*, not by whichever clock was
// wrong. The pair (counter, deviceId) is a total order: the counter orders
// events on one device, and the deviceId breaks ties for events minted
// concurrently on different devices — every replica sorts the pair identically.
//
// Pure data + pure functions: the async, IndexedDB-backed counter lives in
// data/device.ts; this module holds only the stamp type and its algebra.
// ---------------------------------------------------------------------------

export interface LamportStamp {
  /** Per-device monotonic counter. */
  counter: number;
  /** Minting device — also the tie-breaker for equal counters. */
  deviceId: string;
}

/** Zero-padded encoding so lexicographic order == numeric order up to 1e12. */
export function stampJson(stamp: LamportStamp): string {
  return `${String(stamp.counter).padStart(13, "0")}:${stamp.deviceId}`;
}

export function compareStamps(a: LamportStamp, b: LamportStamp): number {
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0;
}

export function maxStamp(a: LamportStamp | null, b: LamportStamp | null): LamportStamp | null {
  if (!a) return b;
  if (!b) return a;
  return compareStamps(a, b) >= 0 ? a : b;
}

export function parseStamp(raw: unknown): LamportStamp | null {
  if (typeof raw !== "string" || !raw.includes(":")) return null;
  const idx = raw.indexOf(":");
  const counter = Number(raw.slice(0, idx));
  const deviceId = raw.slice(idx + 1);
  if (!Number.isFinite(counter) || counter < 0 || !deviceId) return null;
  return { counter, deviceId };
}
