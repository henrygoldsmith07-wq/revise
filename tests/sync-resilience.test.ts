import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { authIdentity, collapseOutboxItems, sync } from "@/data/sync";
import type { OutboxItem } from "@/domain/types";

const USER = "11111111-1111-4111-8111-111111111111";

function item(index: number, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: `queue-${index}`,
    entity: "cards",
    op: "upsert",
    payload: { id: `card-${index}`, userId: USER, updatedAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z` },
    ownerId: USER,
    queuedAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`,
    attempts: 0,
    ...overrides,
  };
}

function fakeClient(options: { failAfter?: number; signOutAfter?: number } = {}): SupabaseClient {
  let authCalls = 0;
  let upsertCalls = 0;
  const client = {
    auth: {
      getUser: async () => {
        authCalls++;
        return {
          data: {
            user: options.signOutAfter && authCalls >= options.signOutAfter ? null : { id: USER },
          },
        };
      },
    },
    from: () => {
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.upsert = async (rows: never[]) => {
        upsertCalls++;
        return options.failAfter && upsertCalls > options.failAfter
          ? { error: { message: "staging outage" } }
          : { error: null, data: rows };
      };
      builder.delete = () => builder;
      builder.eq = () => builder;
      builder.in = async () => ({ error: null });
      builder.select = () => builder;
      builder.gt = () => builder;
      builder.order = () => builder;
      builder.range = async () => ({ data: [], error: null });
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

beforeEach(async () => {
  await clearAll();
});

describe("sync disaster contracts", () => {
  it("collapses duplicate device writes by the newest queued timestamp", () => {
    const collapsed = collapseOutboxItems([
      item(1, { id: "old", queuedAt: "2026-09-01T00:00:01Z" }),
      item(2, { id: "new", queuedAt: "2026-09-01T00:00:02Z", payload: { id: "card-1", userId: USER, updatedAt: "2026-09-01T00:00:02Z" } }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("new");
  });

  it("leaves a partially drained outbox durable and records retry attempts", async () => {
    const db = await getDb();
    await Promise.all(Array.from({ length: 100 }, (_, index) => db.put("outbox", item(index))));
    const result = await sync(USER, { client: fakeClient({ failAfter: 1 }), online: true });
    expect(result.failed).toBeGreaterThan(0);
    const remaining = (await db.getAll("outbox")) as OutboxItem[];
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.some((row) => row.attempts > 0 && row.lastError === "staging outage")).toBe(true);
  });

  it("does not delete queued data when the account is deleted during a push", async () => {
    const db = await getDb();
    await db.put("outbox", item(1));
    const result = await sync(USER, { client: fakeClient({ signOutAfter: 3 }), online: true });
    expect(result.skipped).toBe("signed-out");
    expect(await db.count("outbox")).toBe(1);
  });

  it("rejects a session whose auth identity does not match the local queue", async () => {
    const client = fakeClient();
    await expect(authIdentity(client, "22222222-2222-4222-8222-222222222222")).resolves.toBe("account-mismatch");
  });
});

