import type { Id, OutboxItem, SyncEntity } from "@/domain/types";
import { getDb } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { readReviseMeta, writeReviseMeta } from "./storage-namespace";

// ---------------------------------------------------------------------------
// Offline-first sync: a durable outbox plus a pull that merges by timestamp.
//
// Conflict rule: last write wins, per row, on `updated_at`. Revision data is
// append-mostly and single-author, so a full CRDT would be a lot of machinery
// for a case that barely arises — the one genuinely mergeable thing (FSRS card
// state) is resolved by keeping the row with the later review, which is also
// the one with more information in it.
// ---------------------------------------------------------------------------

/** Domain entity → Postgres table. Keeps snake_case confined to this module. */
const TABLES: Record<SyncEntity, string> = {
  cards: "cards",
  reviewLogs: "review_logs",
  attempts: "attempts",
  mistakes: "mistakes",
  questions: "questions",
  papers: "papers",
  plannedSessions: "planned_sessions",
  examDates: "exam_dates",
  settings: "user_settings",
  streak: "streaks",
};

export const SYNC_QUEUE_EVENT = "revise:sync-queue";

export async function enqueue(entity: SyncEntity, op: OutboxItem["op"], payload: unknown): Promise<void> {
  // With no backend there is nothing to drain into, so queuing would only
  // grow unbounded on a device that is working perfectly well.
  if (!isSupabaseConfigured) return;
  const db = await getDb();
  await db.put("outbox", {
    id: crypto.randomUUID(),
    entity,
    op,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
}

export async function outboxSize(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const db = await getDb();
  return db.count("outbox");
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  skipped?: "unconfigured" | "offline" | "signed-out";
}

/** Push the outbox, then pull anything newer from the server. */
export async function sync(userId: Id): Promise<SyncResult> {
  if (!isSupabaseConfigured) return { pushed: 0, pulled: 0, failed: 0, skipped: "unconfigured" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { pushed: 0, pulled: 0, failed: 0, skipped: "offline" };
  }
  const supabase = getSupabase();
  if (!supabase) return { pushed: 0, pulled: 0, failed: 0, skipped: "unconfigured" };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { pushed: 0, pulled: 0, failed: 0, skipped: "signed-out" };

  const pushed = await drainOutbox(userId);
  const pulled = await pull(userId);
  return { ...pushed, pulled: pulled.pulled, failed: pushed.failed + pulled.failed };
}

async function drainOutbox(userId: Id): Promise<{ pushed: number; failed: number }> {
  const supabase = getSupabase();
  const db = await getDb();
  const items = (await db.getAll("outbox")) as OutboxItem[];
  let pushed = 0;
  let failed = 0;

  // Batch by entity so a 200-card session is one request, not 200.
  const upserts = new Map<SyncEntity, OutboxItem[]>();
  const deletes = new Map<SyncEntity, OutboxItem[]>();
  for (const item of items) {
    const bucket = item.op === "delete" ? deletes : upserts;
    const list = bucket.get(item.entity) ?? [];
    list.push(item);
    bucket.set(item.entity, list);
  }

  for (const [entity, list] of upserts) {
    // Later queue entries for the same row supersede earlier ones.
    const byId = new Map<string, OutboxItem>();
    for (const item of list) byId.set(rowId(item.payload), item);
    const rows = [...byId.values()].map((i) => toRow(entity, i.payload, userId));
    const { error } = await supabase!.from(TABLES[entity]).upsert(rows, { onConflict: pkFor(entity) });
    if (error) {
      failed += list.length;
      for (const item of list) {
        await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: error.message });
      }
      continue;
    }
    pushed += rows.length;
    for (const item of list) await db.delete("outbox", item.id);
  }

  for (const [entity, list] of deletes) {
    const ids = list.map((i) => rowId(i.payload));
    const { error } = await supabase!.from(TABLES[entity]).delete().in("id", ids);
    if (error) {
      failed += list.length;
      continue;
    }
    pushed += ids.length;
    for (const item of list) await db.delete("outbox", item.id);
  }

  return { pushed, failed };
}

async function pull(userId: Id): Promise<{ pulled: number; failed: number }> {
  const supabase = getSupabase();
  const db = await getDb();
  const since = (await readReviseMeta<string>("lastPullAt")) ?? "1970-01-01T00:00:00.000Z";
  const startedAt = new Date().toISOString();
  let pulled = 0;
  let failed = 0;

  for (const [entity, table] of Object.entries(TABLES) as [SyncEntity, string][]) {
    const { data, error } = await supabase!
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .gt("updated_at", since);
    if (error) {
      failed++;
      continue;
    }
    if (!data?.length) continue;

    const store = STORE_FOR[entity];
    const tx = db.transaction(store, "readwrite");
    for (const row of data) {
      const local = fromRow(entity, row);
      const existing = await tx.store.get(keyFor(entity, local));
      if (!existing || isNewer(local, existing)) await tx.store.put(local as never);
      pulled++;
    }
    await tx.done;
  }

  // Keep the old cursor when a table failed so reconnecting retries that
  // table instead of silently skipping rows that were never pulled.
  if (failed === 0) await writeReviseMeta("lastPullAt", startedAt);
  return { pulled, failed };
}

const STORE_FOR: Record<SyncEntity, "cards" | "reviewLogs" | "attempts" | "mistakes" | "questions" | "papers" | "plannedSessions" | "examDates" | "settings" | "streak"> = {
  cards: "cards",
  reviewLogs: "reviewLogs",
  attempts: "attempts",
  mistakes: "mistakes",
  questions: "questions",
  papers: "papers",
  plannedSessions: "plannedSessions",
  examDates: "examDates",
  settings: "settings",
  streak: "streak",
};

function keyFor(entity: SyncEntity, row: Record<string, unknown>): string {
  return entity === "settings" || entity === "streak" ? String(row.userId) : String(row.id);
}

function pkFor(entity: SyncEntity): string {
  return entity === "settings" || entity === "streak" ? "user_id" : "id";
}

function rowId(payload: unknown): string {
  const row = payload as { id?: string; userId?: string };
  return row.id ?? row.userId ?? "";
}

/**
 * The wire format keeps the domain object whole in a JSONB `data` column and
 * lifts only what the server needs to index or filter on. That keeps schema
 * migrations off the critical path: a new domain field needs no migration.
 */
function toRow(entity: SyncEntity, payload: unknown, userId: Id): Record<string, unknown> {
  const row = payload as Record<string, unknown>;
  const updatedAt = (row.updatedAt as string) ?? (row.createdAt as string) ?? new Date().toISOString();
  return {
    id: rowId(payload),
    user_id: userId,
    subject_id: row.subjectId ?? null,
    topic_id: row.topicId ?? null,
    due: entity === "cards" ? row.due : null,
    date: entity === "plannedSessions" || entity === "examDates" ? row.date : null,
    data: row,
    updated_at: updatedAt,
  };
}

function fromRow(entity: SyncEntity, row: Record<string, unknown>): Record<string, unknown> {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return { ...data, userId: row.user_id ?? data.userId };
}

function isNewer(incoming: Record<string, unknown>, existing: unknown): boolean {
  const a = String((incoming.updatedAt as string) ?? (incoming.createdAt as string) ?? "");
  const b = String(
    ((existing as Record<string, unknown>)?.updatedAt as string) ??
      ((existing as Record<string, unknown>)?.createdAt as string) ??
      "",
  );
  return a >= b;
}
