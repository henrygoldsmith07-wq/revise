import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { collapseOutboxItems, sync } from "@/data/sync";
import { mergeCard } from "@/domain/sync-crdt";
import { createCard } from "@/domain/scheduling";
import type { Card, OutboxItem } from "@/domain/types";

const USER = "33333333-3333-4333-8333-333333333333";

function queueItem(id: string, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id,
    entity: "cards",
    op: "upsert",
    payload: { id: "card-1", userId: USER, updatedAt: "2026-09-01T00:00:00.000Z" },
    ownerId: USER,
    queuedAt: "2026-09-01T00:00:00.000Z",
    attempts: 0,
    ...overrides,
  };
}

function pullClient(rows: Record<string, unknown>[]): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => {
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.or = () => builder;
      builder.order = () => builder;
      builder.gt = () => builder;
      builder.range = (async () => ({ data: ["learner_records", "sync_tombstones"].includes(table) ? [] : rows, error: null })) as never;
      return builder;
    },
  } as unknown as SupabaseClient;
}

beforeEach(async () => {
  await clearAll();
});

describe("logical clocks beat wall clocks", () => {
  it("drains the outbox in Lamport order even when a device clock runs days ahead", () => {
    // Device B's clock is 3 days fast, so its queuedAt sorts first — but its
    // Lamport counter proves it happened after device A's edit.
    const collapsed = collapseOutboxItems([
      queueItem("b-future-clock", {
        queuedAt: "2026-09-04T00:00:00.000Z",
        lamport: 4,
        deviceId: "device-b",
        payload: { id: "card-1", userId: USER, updatedAt: "2026-09-04T00:00:00.000Z" },
      }),
      queueItem("a-correct-clock", {
        queuedAt: "2026-09-01T00:00:00.000Z",
        lamport: 9,
        deviceId: "device-a",
        payload: { id: "card-1", userId: USER, updatedAt: "2026-09-01T00:00:00.000Z" },
      }),
    ]);
    // Same row collapses to one entry: the causally-latest (higher Lamport),
    // not the wall-clock-latest.
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("a-correct-clock");
  });

  it("breaks Lamport ties deterministically by device id", () => {
    const collapsed = collapseOutboxItems([
      queueItem("b", { lamport: 5, deviceId: "device-b", payload: { id: "card-2", userId: USER } }),
      queueItem("a", { lamport: 5, deviceId: "device-a", payload: { id: "card-2", userId: USER } }),
    ]);
    expect(collapsed).toHaveLength(1);
    // Deterministic across replicas: same inputs, same winner, every time.
    const again = collapseOutboxItems([
      queueItem("a", { lamport: 5, deviceId: "device-a", payload: { id: "card-2", userId: USER } }),
      queueItem("b", { lamport: 5, deviceId: "device-b", payload: { id: "card-2", userId: USER } }),
    ]);
    expect(again[0].id).toBe(collapsed[0].id);
  });

  it("keeps legacy queuedAt ordering for rows minted before Lamport stamping", () => {
    const collapsed = collapseOutboxItems([
      queueItem("old", { queuedAt: "2026-09-01T00:00:01Z" }),
      queueItem("new", { queuedAt: "2026-09-01T00:00:02Z", payload: { id: "card-1", userId: USER } }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("new");
  });

  it("merges offline grades from two devices without losing either (CRDT stays merge-safe)", async () => {
    const base = createCard(
      { id: "card-x", userId: USER, subjectId: "s", topicId: "t", front: "q", back: "a" },
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const deviceA: Card = {
      ...base,
      updatedAt: "2026-09-02T00:00:00.000Z",
      log: [{ grade: "again", reviewedAt: "2026-09-02T00:00:00.000Z", deviceId: "device-a", lamport: 3, base: undefined }],
    };
    const deviceB: Card = {
      ...base,
      updatedAt: "2026-09-02T00:00:00.000Z",
      log: [{ grade: "good", reviewedAt: "2026-09-02T00:00:00.000Z", deviceId: "device-b", lamport: 4, base: undefined }],
    };
    // Equal wall-clock timestamps must still converge deterministically.
    const ab = mergeCard(deviceA, deviceB);
    const ba = mergeCard(deviceB, deviceA);
    expect(ab.log?.length).toBe(2);
    expect(ba.log?.length).toBe(2);
    expect(ab.log).toEqual(ba.log);
    expect(ab.stability).toBe(ba.stability);
  });

  it("a stale replay never overwrites newer local state on pull", async () => {
    const db = await getDb();
    const local = {
      ...createCard(
        { id: "card-local", userId: USER, subjectId: "s", topicId: "t", front: "q", back: "a" },
        new Date("2026-09-01T00:00:00.000Z"),
      ),
      userId: USER,
      updatedAt: "2026-09-05T00:00:00.000Z",
      front: "local newer front",
    };
    await db.put("cards", local);
    const stale = {
      id: "card-local",
      user_id: USER,
      updated_at: "2026-09-02T00:00:00.000Z",
      data: { ...local, front: "stale replay front", updatedAt: "2026-09-02T00:00:00.000Z" },
    };
    const result = await sync(USER, { client: pullClient([stale]), online: true });
    expect(result.failed).toBe(0);
    expect(((await db.get("cards", "card-local")) as Card).front).toBe("local newer front");
  });

  it("equal timestamps converge instead of flapping (remote wins the tie, matching the server)", async () => {
    const db = await getDb();
    await db.put("cards", {
      ...createCard(
        { id: "card-tie", userId: USER, subjectId: "s", topicId: "t", front: "q", back: "a" },
        new Date("2026-09-01T00:00:00.000Z"),
      ),
      userId: USER,
      updatedAt: "2026-09-03T00:00:00.000Z",
      front: "local tie front",
    });
    const remote = {
      id: "card-tie",
      user_id: USER,
      updated_at: "2026-09-03T00:00:00.000Z",
      data: {
        ...(await db.get("cards", "card-tie")),
        front: "remote tie front",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
    };
    await sync(USER, { client: pullClient([remote]), online: true });
    // One deterministic outcome on every replica; the server's first-writer
    // row is authoritative, so adopting it heals the rejected second writer.
    expect(((await db.get("cards", "card-tie")) as Card).front).toBe("remote tie front");
    // Re-pulling the same row is a fixed point, not a flap.
    await sync(USER, { client: pullClient([remote]), online: true });
    expect(((await db.get("cards", "card-tie")) as Card).front).toBe("remote tie front");
  });
});
