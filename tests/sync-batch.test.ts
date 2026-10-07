import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { resetSyncBatchSupportForTests, sync, SYNC_BATCH_MAX_ROWS } from "@/data/sync";
import { syncWireIdValue } from "@/data/sync-contract";
import type { OutboxItem, SyncEntity } from "@/domain/types";

// Priority 3.1: a finished 50-question mock paper must reach Supabase as one
// batched RPC (one transaction), not one request per entity or per row, while
// keeping outbox durability, deterministic wire ids and owner checks.

const USER = "11111111-1111-4111-8111-111111111111";

interface Calls { rpc: { fn: string; args: { p_rows: { table: string; row: Record<string, unknown> }[]; p_idempotency_keys: string[] } }[]; upserts: { table: string; rows: unknown[] }[] }

function client(mode: "ok" | "fail" | "missing" | "sign-out-mid" = "ok"): { client: SupabaseClient; calls: Calls } {
  const calls: Calls = { rpc: [], upserts: [] };
  let auth = 0;
  const c = {
    auth: {
      getUser: async () => {
        auth++;
        return { data: { user: mode === "sign-out-mid" && auth > 3 ? null : { id: USER } } };
      },
    },
    rpc: async (fn: string, args: Calls["rpc"][number]["args"]) => {
      if (fn !== "sync_push_batch") return { data: [], error: null };
      calls.rpc.push({ fn, args });
      if (mode === "missing") return { data: null, error: { code: "PGRST202", message: "Could not find the function public.sync_push_batch" } };
      if (mode === "fail") return { data: null, error: { code: "57014", message: "statement timeout" } };
      return { data: args.p_rows.length, error: null };
    },
    from: (table: string) => {
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.upsert = (async (rows: unknown[]) => {
        calls.upserts.push({ table, rows });
        return { error: null, data: rows };
      }) as never;
      for (const name of ["delete", "eq", "select", "gt", "gte", "or", "order"]) builder[name] = () => builder;
      builder.in = async () => ({ error: null });
      builder.range = async () => ({ data: [], error: null });
      return builder;
    },
  };
  return { client: c as unknown as SupabaseClient, calls };
}

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
    deviceId: "device-a",
  };
}

async function queueMockPaper(): Promise<OutboxItem[]> {
  const db = await getDb();
  const items: OutboxItem[] = [];
  for (let i = 1; i <= 50; i++) items.push(queued("attempts", `attempt-${i}`));
  for (let i = 1; i <= 12; i++) items.push(queued("mistakes", `mistake-${i}`));
  items.push(queued("papers", "paper-mock-1"));
  for (const item of items) await db.put("outbox", item);
  return items;
}

beforeEach(async () => {
  await clearAll();
  resetSyncBatchSupportForTests();
  lamport = 0;
});

describe("batched sync push", () => {
  it("sends a whole mock paper as one sync_push_batch call and clears the outbox", async () => {
    await queueMockPaper();
    const { client: c, calls } = client();
    const result = await sync(USER, { client: c, online: true });
    expect(result.failed).toBe(0);
    expect(result.pushed).toBe(63);
    expect(calls.rpc).toHaveLength(1);
    expect(calls.upserts).toHaveLength(0);
    const rows = calls.rpc[0]!.args.p_rows;
    expect(new Set(rows.map((r) => r.table))).toEqual(new Set(["attempts", "mistakes", "papers"]));
    // Deterministic wire ids, owner stamped server-checkable on every row.
    expect(rows.find((r) => r.table === "attempts")!.row.id).toBe(syncWireIdValue(USER, "attempt-1"));
    expect(rows.every((r) => r.row.user_id === USER)).toBe(true);
    expect(calls.rpc[0]!.args.p_idempotency_keys).toHaveLength(63);
    expect(await (await getDb()).count("outbox")).toBe(0);
  });

  it("keeps causal order and collapses repeated writes to the newest", async () => {
    const db = await getDb();
    await db.put("outbox", queued("attempts", "attempt-1", { score: 1 }));
    await db.put("outbox", queued("cards", "card-1"));
    await db.put("outbox", queued("attempts", "attempt-1", { score: 2 }));
    const { client: c, calls } = client();
    await sync(USER, { client: c, online: true });
    const rows = calls.rpc[0]!.args.p_rows;
    expect(rows.map((r) => r.table)).toEqual(["cards", "attempts"]);
    expect((rows[1]!.row.data as { score: number }).score).toBe(2);
    expect(await db.count("outbox")).toBe(0);
  });

  it("chunks very large backlogs instead of one unbounded request", async () => {
    const db = await getDb();
    for (let i = 0; i < SYNC_BATCH_MAX_ROWS + 5; i++) await db.put("outbox", queued("attempts", `attempt-${i}`));
    const { client: c, calls } = client();
    await sync(USER, { client: c, online: true });
    expect(calls.rpc.map((call) => call.args.p_rows.length)).toEqual([SYNC_BATCH_MAX_ROWS, 5]);
  });

  it("keeps every entry durable and counts an attempt when the batch fails", async () => {
    const items = await queueMockPaper();
    const { client: c } = client("fail");
    const result = await sync(USER, { client: c, online: true });
    expect(result.failed).toBe(items.length);
    const left = (await (await getDb()).getAll("outbox")) as OutboxItem[];
    expect(left).toHaveLength(items.length);
    expect(left.every((item) => item.attempts === 1 && item.lastError === "statement timeout")).toBe(true);
  });

  it("falls back to per-table upserts when the server has no batch RPC yet", async () => {
    await queueMockPaper();
    const { client: c, calls } = client("missing");
    const result = await sync(USER, { client: c, online: true });
    expect(result.failed).toBe(0);
    expect(calls.rpc).toHaveLength(1);
    expect(calls.upserts.map((u) => u.table).filter((t) => t !== "sync_writes").sort()).toEqual(["attempts", "mistakes", "papers"]);
    expect(await (await getDb()).count("outbox")).toBe(0);
    // The verdict is remembered: the next drain goes straight to upserts.
    await (await getDb()).put("outbox", queued("attempts", "attempt-99"));
    await sync(USER, { client: c, online: true });
    expect(calls.rpc).toHaveLength(1);
  });

  it("stops without deleting anything when the account changes mid-drain", async () => {
    const items = await queueMockPaper();
    const { client: c } = client("sign-out-mid");
    const result = await sync(USER, { client: c, online: true });
    expect(result.skipped).toBe("signed-out");
    expect(await (await getDb()).count("outbox")).toBe(items.length);
  });
});
