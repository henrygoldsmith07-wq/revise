import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { authIdentity, collapseOutboxItems, sync } from "@/data/sync";
import { readReviseUserMeta, writeReviseUserMeta } from "@/data/storage-namespace";
import { decryptPayload, encryptPayload, importEncryptionKey } from "@/data/e2ee";
import { createCard } from "@/domain/scheduling";
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
      builder.gte = () => builder;
      builder.or = () => builder;
      builder.order = () => builder;
      builder.gt = () => builder;
      builder.range = async () => ({ data: [], error: null });
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

function pullClient(userId: string, rows: Record<string, Record<string, unknown>[]>, failTable?: string): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table: string) => {
      const state: { owner?: string; or?: string; range?: [number, number] } = {};
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.select = () => builder;
      builder.eq = ((_column: string, owner: string) => {
        state.owner = owner;
        return builder;
      }) as never;
      builder.or = ((clause: string) => {
        state.or = clause;
        return builder;
      }) as never;
      builder.order = () => builder;
      builder.gt = () => builder;
      builder.range = (async (from: number, to: number) => {
        state.range = [from, to];
        if (table === failTable) return { data: null, error: { message: "offline" } };
        let out = (rows[table] ?? []).filter((row) => row.user_id === state.owner);
        // Mirror the production keyset: (updated_at, id) strictly after the cursor.
        const match = /updated_at\.gt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.gt\.(.*)\)/.exec(state.or ?? "");
        if (match) {
          const [, gtTs, eqTs, gtId] = match;
          out = out.filter((row) => {
            const ts = String(row.updated_at ?? "");
            const id = String(row.id ?? "");
            return ts > (gtTs ?? "") || (ts === (eqTs ?? "") && id > (gtId ?? ""));
          });
        }
        out = out.slice().sort((a, b) =>
          String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")) ||
          String(a.id ?? "").localeCompare(String(b.id ?? "")));
        const [lo, hi] = state.range ?? [0, out.length];
        return { data: out.slice(lo, hi + 1), error: null };
      }) as never;
      return builder;
    },
  } as unknown as SupabaseClient;
}

function remoteCard(id: string, userId: string, updatedAt: string) {
  return {
    id, user_id: userId, updated_at: updatedAt,
    data: createCard({ id, userId, subjectId: "subject", topicId: "topic", front: "question", back: "answer" }, new Date(updatedAt)),
  };
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

describe("pull-path resilience", () => {
  it("pulls a remote card into IndexedDB and advances the pull cursor", async () => {
    const remote = remoteCard("card-remote-1", USER, "2026-09-02T00:00:00.000Z");
    const result = await sync(USER, { client: pullClient(USER, { cards: [remote] }), online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(1);
    expect(await (await getDb()).get("cards", "card-remote-1")).toBeDefined();
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBe("2026-09-02T00:00:00.000Z");
  });

  it("only pulls rows newer than the stored cursor", async () => {
    await writeReviseUserMeta("lastPullAt", USER, "2026-09-02T00:00:00.000Z");
    const rows = {
      cards: [
        remoteCard("card-old", USER, "2026-09-01T00:00:00.000Z"),
        remoteCard("card-new", USER, "2026-09-03T00:00:00.000Z"),
      ],
    };
    const result = await sync(USER, { client: pullClient(USER, rows), online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(1);
    expect(await (await getDb()).get("cards", "card-new")).toBeDefined();
    expect(await (await getDb()).get("cards", "card-old")).toBeUndefined();
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBe("2026-09-03T00:00:00.000Z");
  });

  it("keeps the old cursor when a table pull fails so a retry re-fetches", async () => {
    await writeReviseUserMeta("lastPullAt", USER, "2026-09-02T00:00:00.000Z");
    const rows = { cards: [remoteCard("card-x", USER, "2026-09-04T00:00:00.000Z")] };
    const result = await sync(USER, { client: pullClient(USER, rows, "cards"), online: true });
    expect(result.pulled).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBe("2026-09-02T00:00:00.000Z");
  });

  it("rejects a bad recovery key without corrupting device encryption", async () => {
    const blob = await encryptPayload({ answer: "my essay" });
    expect(await importEncryptionKey("not-json")).toBe(false);
    await expect(decryptPayload<{ answer: string }>(blob)).resolves.toEqual({ answer: "my essay" });
  });
});

