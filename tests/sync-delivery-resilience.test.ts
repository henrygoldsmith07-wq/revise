import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDb } from "@/data/db";
import { MAX_OUTBOX_ATTEMPTS, resetSyncBatchSupportForTests, sync } from "@/data/sync";
import { encryptPayload } from "@/data/e2ee";
import { syncWireId, syncWireIdValue } from "@/data/sync-contract";
import { readReviseUserMeta } from "@/data/storage-namespace";
import { createCard, gradeCard } from "@/domain/scheduling";
import { classifySyncError, syncBackoffDelayMs, SYNC_BACKOFF_MAX_MS } from "@/domain/sync-retry";
import { historyFrozenFingerprint, type LearnerHistoryRecord } from "@/domain/learner-history";
import type { Card, OutboxItem, SyncEntity } from "@/domain/types";
import { fakeSyncServer } from "./helpers-fake-sync-server";

// Data-layer delivery bugs found by probing sync with fake-indexeddb and a
// fake Supabase: each test here failed before its fix.

const USER = "11111111-1111-4111-8111-111111111111";
const continuityCursorKey = `revise.changeCursor.v1:learner_records::user:${USER}`;

let lamport = 0;
function queued(entity: SyncEntity, id: string, extra: Record<string, unknown> = {}): OutboxItem {
  lamport++;
  return {
    id: crypto.randomUUID(),
    entity,
    op: "upsert",
    payload: { id, userId: USER, subjectId: "wjec-alevel-physics", updatedAt: "2026-09-01T10:00:00.000Z", ...extra },
    ownerId: USER,
    queuedAt: new Date(Date.UTC(2026, 8, 1, 10, 0, lamport)).toISOString(),
    attempts: 0,
    idempotencyKey: crypto.randomUUID(),
    lamport,
    deviceId: "device-b",
  };
}

function historyRecord(id: string, deviceId = "device-a"): LearnerHistoryRecord {
  return {
    id: `gradeActuals:${id}`, recordId: id, kind: "gradeActuals", userId: USER,
    value: { id, anonId: USER, subjectId: "reference", percent: 60, kind: "mock", takenAt: "2026-09-30T00:00:00Z" },
    deleted: false, lamport: 7, deviceId,
  };
}

async function learnerRow(record: LearnerHistoryRecord, seq: number, data: unknown) {
  return {
    id: await syncWireId(USER, record.id), user_id: USER, data, lamport: record.lamport, device_id: record.deviceId,
    deleted: record.deleted, kind: record.kind, frozen_fingerprint: historyFrozenFingerprint(record), change_seq: seq,
  };
}

beforeEach(async () => {
  await clearAll();
  resetSyncBatchSupportForTests();
  lamport = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("two devices with their own E2EE keys", () => {
  it("still drains this device's outbox when learner records from the other device cannot be decrypted", async () => {
    const db = await getDb();
    await db.put("settings", { userId: USER, e2eeEnabled: true } as never);
    // Device A encrypted with a key this device (B) does not hold.
    const otherKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const foreign = historyRecord("from-device-a");
    const readable = historyRecord("plain-from-old-device", "device-c");
    const server = fakeSyncServer(USER);
    server.tables.set("learner_records", [
      await learnerRow(foreign, 10, await encryptPayload(foreign, otherKey)),
      await learnerRow(readable, 11, readable),
    ]);
    await db.put("outbox", queued("attempts", "attempt-from-b"));

    const result = await sync(USER, { client: server.client, online: true });

    // B's own work reached the server.
    expect(server.rpcCalls.flatMap((call) => call.rows.map((r) => r.row.id))).toContain(syncWireIdValue(USER, "attempt-from-b"));
    expect(await db.count("outbox")).toBe(0);
    // The unreadable row is counted, not hidden, and the cursor stays pinned
    // before it so a pull with the right key retries it.
    expect(result.failed).toBeGreaterThan(0);
    expect(await db.get("meta", continuityCursorKey)).toBeUndefined();
    // Rows after the unreadable one still merged.
    expect(result.pulled).toBeGreaterThan(0);
  });

  it("does not mint an encryption key on a device that never enabled E2EE", async () => {
    const otherKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const { resetEncryptionKeyCacheForTests } = await import("@/data/e2ee");
    resetEncryptionKeyCacheForTests();
    const server = fakeSyncServer(USER);
    const card = createCard({ id: "enc-card", userId: USER, subjectId: "s", topicId: "t", front: "Q", back: "A" }, new Date("2026-09-02T00:00:00Z"));
    server.tables.set("cards", [{ id: await syncWireId(USER, card.id), user_id: USER, updated_at: "2026-09-02T00:00:00.000Z", data: await encryptPayload(card, otherKey) }]);
    const result = await sync(USER, { client: server.client, online: true });
    expect(result.failed).toBe(1);
    expect(await (await getDb()).get("meta", "revise.e2ee.key.v1")).toBeUndefined();
  });
});

describe("outbox retry classification", () => {
  it("classifies transport, timeout and auth-refresh failures as transient and validation failures as permanent", () => {
    expect(classifySyncError({ message: "TypeError: Failed to fetch" })).toBe("transient");
    expect(classifySyncError({ code: "57014", message: "canceling statement due to statement timeout" })).toBe("transient");
    expect(classifySyncError({ status: 503, message: "Service Unavailable" })).toBe("transient");
    expect(classifySyncError({ status: 429, message: "Too many requests" })).toBe("transient");
    expect(classifySyncError({ code: "PGRST301", message: "JWT expired" })).toBe("transient");
    expect(classifySyncError({ code: "22P02", message: "invalid input syntax for type uuid" })).toBe("permanent");
    expect(classifySyncError({ code: "23514", status: 400, message: "Frozen prediction changed" })).toBe("permanent");
    expect(classifySyncError({ code: "42501", status: 403, message: "new row violates row-level security policy" })).toBe("permanent");
  });

  it("backs off exponentially up to a cap", () => {
    expect(syncBackoffDelayMs(1)).toBe(15_000);
    expect(syncBackoffDelayMs(2)).toBe(30_000);
    expect(syncBackoffDelayMs(3)).toBe(60_000);
    expect(syncBackoffDelayMs(50)).toBe(SYNC_BACKOFF_MAX_MS);
  });

  it("does not spend the retry budget during an outage, and waits out a persisted backoff", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z"));
    const db = await getDb();
    for (let i = 0; i < 60; i++) await db.put("outbox", queued("attempts", `attempt-${i}`));
    const server = fakeSyncServer(USER);
    server.setRpcHook(() => ({ error: { code: "57014", message: "statement timeout" } }));

    // Far more sync passes than the attempt cap: a few minutes of outage.
    for (let pass = 0; pass < MAX_OUTBOX_ATTEMPTS + 5; pass++) {
      await sync(USER, { client: server.client, online: true });
      vi.setSystemTime(new Date(Date.now() + 5_000));
    }
    const left = (await db.getAll("outbox")) as OutboxItem[];
    expect(left).toHaveLength(60);
    expect(left.every((item) => item.attempts === 0)).toBe(true);
    expect(left.every((item) => item.lastError === "statement timeout")).toBe(true);
    // Backoff kept the drain from hammering the server every pass.
    expect(server.rpcCalls.length).toBeLessThan(MAX_OUTBOX_ATTEMPTS);
    const backoff = await readReviseUserMeta<{ failures: number; nextAttemptAt: string }>("outboxBackoff", USER);
    expect(backoff?.failures).toBeGreaterThan(0);

    // The outage ends; once the backoff expires everything drains.
    server.setRpcHook(null);
    vi.setSystemTime(new Date(Date.now() + SYNC_BACKOFF_MAX_MS + 1_000));
    const recovered = await sync(USER, { client: server.client, online: true });
    expect(recovered.pushed).toBe(60);
    expect(await db.count("outbox")).toBe(0);
    expect(await readReviseUserMeta("outboxBackoff", USER)).toBeUndefined();
  });

  it("treats a thrown network error as transient instead of aborting sync", async () => {
    const db = await getDb();
    await db.put("outbox", queued("attempts", "attempt-1"));
    const server = fakeSyncServer(USER);
    server.setRpcHook(() => "throw");
    const result = await sync(USER, { client: server.client, online: true });
    expect(result.failed).toBe(1);
    const [item] = (await db.getAll("outbox")) as OutboxItem[];
    expect(item?.attempts).toBe(0);
  });

  it("isolates one poison row by bisecting the failed batch, delivering its neighbours", async () => {
    const db = await getDb();
    for (let i = 0; i < 50; i++) await db.put("outbox", queued("attempts", `attempt-${i}`));
    const poison = syncWireIdValue(USER, "attempt-17");
    const server = fakeSyncServer(USER);
    server.setRpcHook((call) => call.rows.some((r) => r.row.id === poison)
      ? { error: { code: "22P02", message: "invalid input syntax" } }
      : null);

    const result = await sync(USER, { client: server.client, online: true });
    expect(result.pushed).toBe(49);
    expect(result.failed).toBe(1);
    const left = (await db.getAll("outbox")) as OutboxItem[];
    expect(left).toHaveLength(1);
    expect((left[0]!.payload as { id: string }).id).toBe("attempt-17");
    expect(left[0]!.attempts).toBe(1);
    expect(left[0]!.lastError).toBe("invalid input syntax");
    expect(server.tables.get("attempts")).toHaveLength(49);
  });

  it("bisects on the per-table fallback path too", async () => {
    const db = await getDb();
    for (let i = 0; i < 20; i++) await db.put("outbox", queued("mistakes", `mistake-${i}`));
    const poison = syncWireIdValue(USER, "mistake-3");
    const server = fakeSyncServer(USER, { rpc: false });
    server.setUpsertHook((table, rows) => table === "mistakes" && rows.some((row) => row.id === poison)
      ? { error: { code: "23502", message: "null value in column" } }
      : null);
    const result = await sync(USER, { client: server.client, online: true });
    expect(result.pushed).toBe(19);
    expect(result.failed).toBe(1);
    const left = (await db.getAll("outbox")) as OutboxItem[];
    expect(left.map((item) => (item.payload as { id: string }).id)).toEqual(["mistake-3"]);
    expect(left[0]!.attempts).toBe(1);
  });
});

describe("card reviews merged on pull reach the server", () => {
  it("re-queues a merged card whose op log the server copy lacks, newer than the server row", async () => {
    const db = await getDb();
    const created = new Date("2026-09-01T08:00:00.000Z");
    const base = createCard({ id: "shared-card", userId: USER, subjectId: "s", topicId: "t", front: "Q", back: "A" }, created);
    // Device B graded offline (older wall clock); device A graded later.
    const onB = gradeCard(base, "again", new Date("2026-09-02T09:00:00.000Z"), { deviceId: "device-b", lamport: 3 });
    const onA = gradeCard(base, "good", new Date("2026-09-02T12:00:00.000Z"), { deviceId: "device-a", lamport: 5 });
    await db.put("cards", onB);
    const serverUpdatedAt = "2026-09-02T12:00:00.000Z";
    const server = fakeSyncServer(USER);
    server.tables.set("cards", [{ id: syncWireIdValue(USER, base.id), user_id: USER, updated_at: serverUpdatedAt, data: { ...onA, updatedAt: serverUpdatedAt } }]);

    await sync(USER, { client: server.client, online: true });

    const local = (await db.get("cards", base.id)) as Card;
    expect(local.log?.map((e) => e.deviceId).sort()).toEqual(["device-a", "device-b"]);
    const queuedCard = ((await db.getAll("outbox")) as OutboxItem[]).find((item) => item.entity === "cards");
    expect(queuedCard).toBeDefined();
    const payload = queuedCard!.payload as Card;
    expect(Date.parse(payload.updatedAt)).toBeGreaterThan(Date.parse(serverUpdatedAt));
    expect(payload.log).toHaveLength(2);

    // The next pass delivers it, the server keeps it (newer), and a further
    // pull converges without queuing again.
    await sync(USER, { client: server.client, online: true });
    const stored = server.tables.get("cards")![0]!;
    expect((stored.data as Card).log).toHaveLength(2);
    expect(((await db.getAll("outbox")) as OutboxItem[]).filter((item) => item.entity === "cards")).toHaveLength(0);
  });

  it("does not re-queue a card the server already holds in full", async () => {
    const db = await getDb();
    const base = createCard({ id: "same-card", userId: USER, subjectId: "s", topicId: "t", front: "Q", back: "A" }, new Date("2026-09-01T08:00:00.000Z"));
    const graded = gradeCard(base, "good", new Date("2026-09-02T12:00:00.000Z"), { deviceId: "device-a", lamport: 5 });
    await db.put("cards", graded);
    const server = fakeSyncServer(USER);
    server.tables.set("cards", [{ id: syncWireIdValue(USER, base.id), user_id: USER, updated_at: "2026-09-02T12:00:00.000Z", data: graded }]);
    await sync(USER, { client: server.client, online: true });
    expect(await db.count("outbox")).toBe(0);
  });
});

describe("pulled timestamps", () => {
  it("stores a pulled row's updatedAt in the device's ISO form, not Postgres's", async () => {
    const db = await getDb();
    const server = fakeSyncServer(USER);
    // PostgREST renders timestamptz with `+00:00` and trailing zeros trimmed.
    server.tables.set("attempts", [{
      id: syncWireIdValue(USER, "pulled-attempt"), user_id: USER, updated_at: "2026-09-01T10:00:00.5+00:00",
      data: { id: "pulled-attempt", userId: USER, subjectId: "s", updatedAt: "2026-09-01T09:00:00.000Z" },
    }]);
    await sync(USER, { client: server.client, online: true });
    const local = (await db.get("attempts", "pulled-attempt")) as { updatedAt: string } | undefined;
    expect(local?.updatedAt).toBe("2026-09-01T10:00:00.500Z");
  });
});

describe("one sync pass at a time across tabs", () => {
  it("skips as busy when another tab holds the sync lock, and runs under the lock otherwise", async () => {
    const db = await getDb();
    await db.put("outbox", queued("attempts", "attempt-1"));
    const server = fakeSyncServer(USER);
    const names: string[] = [];
    vi.stubGlobal("navigator", { locks: { request: async (name: string, _options: unknown, callback: (lock: unknown) => Promise<unknown>) => { names.push(name); return callback(null); } } });
    try {
      const busy = await sync(USER, { client: server.client, online: true });
      expect(busy.skipped).toBe("busy");
      expect(server.rpcCalls).toHaveLength(0);
      vi.stubGlobal("navigator", { locks: { request: async (name: string, _options: unknown, callback: (lock: unknown) => Promise<unknown>) => { names.push(name); return callback({ name }); } } });
      const ran = await sync(USER, { client: server.client, online: true });
      expect(ran.pushed).toBe(1);
      expect(names).toEqual(["revise-sync", "revise-sync"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never writes back an item that was delivered and removed while its request failed", async () => {
    const db = await getDb();
    const item = queued("attempts", "attempt-1");
    await db.put("outbox", item);
    const server = fakeSyncServer(USER);
    server.setRpcHook(() => {
      // Another tab delivered and deleted the entry while this request ran.
      void db.delete("outbox", item.id);
      return { error: { code: "22P02", message: "invalid input syntax" } };
    });
    await sync(USER, { client: server.client, online: true });
    expect(await db.get("outbox", item.id)).toBeUndefined();
  });
});
