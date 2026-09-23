import { readReviseMeta, writeReviseMeta } from "./storage-namespace";
import { compareStamps, maxStamp, parseStamp, stampJson, type LamportStamp } from "@/domain/lamport";

// Re-export the pure algebra for convenience — data-layer consumers already
// import from here, and the stamp type lives in the domain so both layers
// share one definition.
export { compareStamps, maxStamp, parseStamp, stampJson };
export type { LamportStamp };

// ---------------------------------------------------------------------------
// Device identity and a per-device logical clock.
//
// Cross-device sync needs two things wall clocks cannot give it:
//
// 1. A stable identity per device, so concurrent edits from two devices can be
//    told apart and ordered deterministically (Lamport ties break on deviceId).
// 2. A monotonic logical timestamp. Wall clocks drift and jump (NTP, manual
//    changes); a Lamport clock only ever advances, so "device B was used daily
//    while device A slept for a week" sorts correctly by *causality*, not by
//    whichever clock was wrong.
//
// The counter persists in the namespaced meta store (IndexedDB), so it
// survives reloads and, because it is only ever read/advanced through
// `observeRemote`/`nextLamport`, never goes backwards even across reboots.
// ---------------------------------------------------------------------------

export interface DeviceIdentity {
  deviceId: string;
  /** Human-readable, shown in sync diagnostics. */
  label: string;
  createdAt: string;
}

/** Deterministic fallback when crypto.randomUUID is unavailable (old Safari). */
function fallbackUuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Rough device label for diagnostics; never rendered as a username. */
function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "device";
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Macintosh|Mac OS/.test(ua)
      ? "Mac"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Web";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${os} · ${browser}`;
}

/** Load (or lazily mint) this device's identity. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await readReviseMeta<DeviceIdentity>("device");
  if (existing?.deviceId) return existing;
  const identity: DeviceIdentity = {
    deviceId: fallbackUuid(),
    label: guessDeviceLabel(),
    createdAt: new Date().toISOString(),
  };
  await writeReviseMeta("device", identity);
  return identity;
}

/** Test seam: overwrite the stored identity. */
export async function setDeviceIdentity(identity: DeviceIdentity): Promise<void> {
  await writeReviseMeta("device", identity);
}

async function readCounter(): Promise<number> {
  const value = await readReviseMeta<number>("lamport");
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

async function writeCounter(value: number): Promise<void> {
  await writeReviseMeta("lamport", value);
}

/** Allocate the next strictly-greater local timestamp. */
export async function nextLamport(): Promise<number> {
  const next = (await readCounter()) + 1;
  await writeCounter(next);
  return next;
}

/**
 * Fold a remote event's logical time into the local clock (the "receive"
 * rule of a Lamport clock): the counter must jump past everything the other
 * side has already seen, so future local events always sort after remote
 * history they causally follow.
 */
export async function observeRemoteLamport(remote: number): Promise<void> {
  if (!Number.isFinite(remote) || remote < 0) return;
  const local = await readCounter();
  if (remote > local) await writeCounter(remote);
}

/** Read without advancing — for diagnostics and tests. */
export async function peekLamport(): Promise<number> {
  return readCounter();
}
