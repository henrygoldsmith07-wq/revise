import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb } from "@/data/db";
import {
  MAX_OUTBOX_ATTEMPTS,
  discardFailedOutboxItem,
  failedOutboxItems,
  failedOutboxRecoveryItem,
  retryFailedOutboxItem,
} from "@/data/sync";
import type { OutboxItem } from "@/domain/types";

const USER = "sync-user";
const OTHER = "other-user";

beforeEach(async () => {
  await clearAll();
});

function failedItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: "failed-1",
    entity: "attempts",
    op: "upsert",
    payload: { id: "attempt-1", userId: USER, answers: { p1: "private answer" } },
    ownerId: USER,
    queuedAt: "2026-09-01T10:00:00.000Z",
    attempts: MAX_OUTBOX_ATTEMPTS,
    lastError: "remote constraint failed",
    idempotencyKey: "idem-1",
    lamport: 4,
    deviceId: "device-a",
    ...overrides,
  };
}

describe("failed sync recovery", () => {
  it("lists only exhausted entries owned by the active profile and omits payloads", async () => {
    const db = await getDb();
    await db.put("outbox", failedItem());
    await db.put("outbox", failedItem({ id: "retrying", attempts: MAX_OUTBOX_ATTEMPTS - 1 }));
    await db.put("outbox", failedItem({ id: "other", ownerId: OTHER, payload: { id: "x", userId: OTHER } }));

    const rows = await failedOutboxItems(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "failed-1",
      entity: "attempts",
      attempts: MAX_OUTBOX_ATTEMPTS,
      lastError: "remote constraint failed",
    });
    expect(rows[0]).not.toHaveProperty("payload");
  });

  it("requires matching ownership before retrying and resets the retry budget durably", async () => {
    const db = await getDb();
    await db.put("outbox", failedItem());

    expect(await retryFailedOutboxItem("failed-1", OTHER)).toBe(false);
    expect((await db.get("outbox", "failed-1"))?.attempts).toBe(MAX_OUTBOX_ATTEMPTS);

    expect(await retryFailedOutboxItem("failed-1", USER)).toBe(true);
    const retried = await db.get("outbox", "failed-1");
    expect(retried?.attempts).toBe(0);
    expect(retried?.lastError).toBeUndefined();
    expect(await failedOutboxItems(USER)).toEqual([]);
  });

  it("exports the full payload only through the explicit recovery accessor", async () => {
    const db = await getDb();
    await db.put("outbox", failedItem());

    expect(await failedOutboxRecoveryItem("failed-1", OTHER)).toBeNull();
    const recovery = await failedOutboxRecoveryItem("failed-1", USER);
    expect(recovery?.payload).toEqual(
      expect.objectContaining({ answers: { p1: "private answer" } }),
    );
  });

  it("requires matching ownership before discarding an exhausted mutation", async () => {
    const db = await getDb();
    await db.put("outbox", failedItem());

    expect(await discardFailedOutboxItem("failed-1", OTHER)).toBe(false);
    expect(await db.get("outbox", "failed-1")).toBeDefined();

    expect(await discardFailedOutboxItem("failed-1", USER)).toBe(true);
    expect(await db.get("outbox", "failed-1")).toBeUndefined();
  });

  it("does not allow retry/discard actions on entries still inside the automatic retry budget", async () => {
    const db = await getDb();
    await db.put("outbox", failedItem({ attempts: MAX_OUTBOX_ATTEMPTS - 1 }));

    expect(await retryFailedOutboxItem("failed-1", USER)).toBe(false);
    expect(await discardFailedOutboxItem("failed-1", USER)).toBe(false);
    expect(await db.get("outbox", "failed-1")).toBeDefined();
  });
});
