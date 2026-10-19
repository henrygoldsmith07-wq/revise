import type { SupabaseClient } from "@supabase/supabase-js";

// A small in-memory stand-in for the Supabase tables sync.ts talks to. Only
// the query shapes the sync layer actually issues are implemented:
//   * continuity pulls: select/eq/gt("change_seq")/order/range
//   * entity pulls: select/eq/or(keyset)/order/order/range
//   * per-table upserts with the server's updated_at guard (schema.sql
//     touch_updated_at: an update whose updated_at is not newer is dropped)
//   * the `sync_push_batch` RPC, with a hook to fail chosen requests.

export type Row = Record<string, unknown>;
export interface RpcCall { rows: { table: string; row: Row }[] }
export type RpcHook = (call: RpcCall) => { error: { message: string; code?: string; status?: number } } | "throw" | null;

export interface FakeServer {
  client: SupabaseClient;
  tables: Map<string, Row[]>;
  rpcCalls: RpcCall[];
  upsertCalls: { table: string; rows: Row[] }[];
  setRpcHook(hook: RpcHook | null): void;
  setUpsertHook(hook: ((table: string, rows: Row[]) => { error: { message: string; code?: string; status?: number } } | null) | null): void;
}

export function fakeSyncServer(userId: string, options: { rpc?: boolean } = {}): FakeServer {
  const tables = new Map<string, Row[]>();
  const rpcCalls: RpcCall[] = [];
  const upsertCalls: { table: string; rows: Row[] }[] = [];
  let rpcHook: RpcHook | null = null;
  let upsertHook: ((table: string, rows: Row[]) => { error: { message: string; code?: string; status?: number } } | null) | null = null;

  const write = (table: string, row: Row) => {
    const list = tables.get(table) ?? [];
    const index = list.findIndex((existing) => existing.id === row.id);
    if (index >= 0) {
      const old = list[index]!;
      // Server LWW guard: an update that is not strictly newer is dropped.
      if (row.updated_at && old.updated_at && Date.parse(String(row.updated_at)) <= Date.parse(String(old.updated_at))) return;
      list[index] = { ...row };
    } else list.push({ ...row });
    tables.set(table, list);
  };

  const from = (table: string) => {
    const state: { owner?: string; or?: string; gt?: number; range?: [number, number] } = {};
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (_column: string, value: string) => { state.owner = value; return builder; };
    builder.or = (clause: string) => { state.or = clause; return builder; };
    builder.gt = (_column: string, value: number) => { state.gt = value; return builder; };
    builder.order = () => builder;
    builder.in = async () => ({ error: null });
    builder.delete = () => builder;
    builder.upsert = async (rows: Row[]) => {
      upsertCalls.push({ table, rows });
      const failure = upsertHook?.(table, rows) ?? null;
      if (failure) return { data: null, ...failure };
      for (const row of rows) write(table, row);
      return { data: rows, error: null };
    };
    builder.range = async (lo: number, hi: number) => {
      let out = (tables.get(table) ?? []).filter((row) => row.user_id === state.owner);
      if (state.gt !== undefined) {
        out = out.filter((row) => Number(row.change_seq) > state.gt!).sort((a, b) => Number(a.change_seq) - Number(b.change_seq));
      } else {
        const keyset = /updated_at\.gt\.([^,]+),and\(updated_at\.eq\.([^,]+),\w+\.gt\.(.*)\)/.exec(state.or ?? "");
        const plain = /^updated_at\.gt\.(.+)$/.exec(state.or ?? "");
        if (keyset) {
          const [, gtTs, eqTs, gtId] = keyset;
          out = out.filter((row) => String(row.updated_at) > gtTs! || (String(row.updated_at) === eqTs && String(row.id) > gtId!));
        } else if (plain) {
          out = out.filter((row) => String(row.updated_at) > plain[1]!);
        }
        out = out.slice().sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)) || String(a.id).localeCompare(String(b.id)));
      }
      return { data: out.slice(lo, hi + 1), error: null };
    };
    return builder;
  };

  const client: Record<string, unknown> = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from,
  };
  if (options.rpc !== false) {
    client.rpc = async (fn: string, args: { p_rows: { table: string; row: Row }[] }) => {
      if (fn !== "sync_push_batch") return { data: null, error: null };
      const call = { rows: args.p_rows };
      rpcCalls.push(call);
      const outcome = rpcHook?.(call) ?? null;
      if (outcome === "throw") throw new TypeError("Failed to fetch");
      if (outcome) return { data: null, ...outcome };
      for (const { table, row } of args.p_rows) write(table, row);
      return { data: args.p_rows.length, error: null };
    };
  }

  return {
    client: client as unknown as SupabaseClient,
    tables,
    rpcCalls,
    upsertCalls,
    setRpcHook: (hook) => { rpcHook = hook; },
    setUpsertHook: (hook) => { upsertHook = hook; },
  };
}
