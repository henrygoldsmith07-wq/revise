import type { Card, Id, LessonProgress, OutboxItem, SyncEntity, StreakState } from "@/domain/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCard, mergeLessonProgress } from "@/domain/sync-crdt";
import { decryptPayload, encryptPayload, isEncryptedPayload } from "./e2ee";
import { remapContentIds } from "./content-ids";
import { getDb } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { readReviseMeta, writeReviseMeta } from "./storage-namespace";
import { getDeviceIdentity, nextLamport, observeRemoteLamport } from "./device";
import { captureTelemetry, errorClass } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Offline-first sync: a durable outbox plus a pull that merges causally.
//
// Ordering: every queued mutation carries the device's Lamport timestamp, so
// offline sessions drain in causal order rather than by whichever wall clock
// was wrong (see domain/lamport.ts).
//
// Conflict rule: last-write-wins per row for plain entities, but the memory
// state that FSRS tracks is *merged*, not won — cards carry a CRDT op log
// (domain/sync-crdt.ts) whose union-and-replay keeps concurrent "Again" and
// "Good" grades both, and grow-only singletons (lesson progress, streak)
// merge as unions. A week offline on one device can no longer erase daily
// progress made on another.
//
// Delivery: every mutation is queued under a UUID idempotency key. The server
// records keys in `sync_writes` and rejects duplicates (see supabase/schema.sql),
// so a hung request retried by the browser or service worker cannot double-count
// a review.
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
  lessonProgress: "lesson_progress",
};

export const SYNC_QUEUE_EVENT = "revise:sync-queue";

export async function enqueue(entity: SyncEntity, op: OutboxItem["op"], payload: unknown, ownerId?: Id): Promise<void> {
  // With no backend there is nothing to drain into, so queuing would only
  // grow unbounded on a device that is working perfectly well.
  if (!isSupabaseConfigured) return;
  const db = await getDb();
  const [deviceId, lamport] = await Promise.all([getDeviceIdentity().then((d) => d.deviceId), nextLamport()]);
  const payloadOwner = payloadRecord(payload)?.userId;
  const resolvedOwner = ownerId ?? (typeof payloadOwner === "string" && payloadOwner.trim() ? payloadOwner : undefined);
  await db.put("outbox", {
    id: crypto.randomUUID(),
    entity,
    op,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    ...(resolvedOwner ? { ownerId: resolvedOwner } : {}),
    // One UUID per *logical* mutation: the server's sync_writes ledger rejects
    // a second delivery of the same key, so retries can never double-write.
    idempotencyKey: crypto.randomUUID(),
    lamport,
    deviceId,
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
}

export async function outboxSize(userId?: Id): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const db = await getDb();
  const items = (await db.getAll("outbox")) as OutboxItem[];
  return userId ? items.filter((item) => isOwnedBy(item, userId)).length : items.length;
}

export type SyncSkip = "unconfigured" | "offline" | "signed-out" | "account-mismatch" | "owner-unknown";

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  skipped?: SyncSkip;
}

export interface SyncOptions {
  /** Test seam and service-worker injection; foreground code uses the browser client. */
  client?: SupabaseClient;
  online?: boolean;
}

/** Confirm that the active Supabase session still belongs to this queue. */
export async function authIdentity(
  client: Pick<SupabaseClient, "auth">,
  userId: Id,
): Promise<"ok" | "signed-out" | "account-mismatch"> {
  try {
    const { data } = await client.auth.getUser();
    if (!data.user) return "signed-out";
    return data.user.id === userId ? "ok" : "account-mismatch";
  } catch {
    return "signed-out";
  }
}

/** After this many failed attempts an outbox item stops blocking the queue. */
const MAX_OUTBOX_ATTEMPTS = 10;

/** Push the outbox, then pull anything newer from the server. */
export async function sync(userId: Id, options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = Date.now();
  const finish = (result: SyncResult): SyncResult => {
    captureTelemetry(result.failed > 0 ? "sync.failure" : "sync.completed", {
      status: result.failed > 0 ? "failed" : result.skipped ? "partial" : "ok",
      durationMs: Date.now() - startedAt,
      pushed: result.pushed,
      pulled: result.pulled,
      failed: result.failed,
    });
    return result;
  };
  try {
    const configured = isSupabaseConfigured || Boolean(options.client);
    if (!configured) return finish({ pushed: 0, pulled: 0, failed: 0, skipped: "unconfigured" });
    const online = options.online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
    if (!online) return finish({ pushed: 0, pulled: 0, failed: 0, skipped: "offline" });
    const supabase = options.client ?? getSupabase();
    if (!supabase) return finish({ pushed: 0, pulled: 0, failed: 0, skipped: "unconfigured" });
    const identity = await authIdentity(supabase, userId);
    if (identity !== "ok") return finish({ pushed: 0, pulled: 0, failed: 0, skipped: identity });

    const pushed = await drainOutbox(userId, supabase);
    if (pushed.skipped) return finish({ pushed: pushed.pushed, pulled: 0, failed: pushed.failed, skipped: pushed.skipped });
    const pulled = await pull(userId, supabase);
    return finish({ pushed: pushed.pushed, pulled: pulled.pulled, failed: pushed.failed + pulled.failed, ...(pulled.skipped ? { skipped: pulled.skipped } : {}) });
  } catch (error) {
    captureTelemetry("sync.failure", {
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorClass: errorClass(error),
    });
    throw error;
  }
}

async function drainOutbox(userId: Id, supabase: SupabaseClient): Promise<{ pushed: number; failed: number; skipped?: SyncSkip }> {
  const db = await getDb();
  // One settings read per drain, not per row.
  const e2ee = await e2eeEnabledFor(userId);
  const allItems = (await db.getAll("outbox")) as OutboxItem[];
  const items = allItems.filter((item) => isOwnedBy(item, userId));
  const hasUnknownOwner = userId !== "local" && allItems.some((item) => ownerFor(item) === null);
  let pushed = 0;
  let failed = 0;

  // Batch by entity so a 200-card session is one request, not 200.
  // Items past the attempt cap are skipped (kept, never silently dropped)
  // so one poison payload cannot block every newer change forever.
  const upserts = new Map<SyncEntity, OutboxItem[]>();
  const deletes = new Map<SyncEntity, OutboxItem[]>();
  for (const item of items) {
    if (item.attempts >= MAX_OUTBOX_ATTEMPTS) continue;
    const bucket = item.op === "delete" ? deletes : upserts;
    const list = bucket.get(item.entity) ?? [];
    list.push(item);
    bucket.set(item.entity, list);
  }

  for (const [entity, list] of upserts) {
    // Later queue entries for the same row supersede earlier ones. Keep the
    // request bounded so a very large offline session cannot monopolise the
    // connection, and so a mid-drain failure leaves a durable remainder.
    const collapsed = collapseOutboxItems(list);
    for (const batch of chunks(collapsed, 50)) {
      const identity = await authIdentity(supabase, userId);
      if (identity !== "ok") return { pushed, failed, skipped: identity };
      const byId = new Map(batch.map((item) => [rowId(item.payload), item]));
      const rows = await Promise.all([...byId.values()].map((i) => toRow(entity, i.payload, userId, { e2ee })));
      const { error } = await supabase.from(TABLES[entity]).upsert(rows, { onConflict: pkFor(entity) });
      const batchIds = new Set(batch.map((item) => item.id));
      const originalEntries = list.filter((item) => batchIds.has(item.id) || batch.some((latest) => rowId(latest.payload) === rowId(item.payload)));
      if (error) {
        failed += originalEntries.length;
        for (const item of originalEntries) {
          await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: error.message });
        }
        continue;
      }
      try {
        await claimIdempotencyKeys(supabase, userId, batch.flatMap((i) => i.idempotencyKey ? [i.idempotencyKey] : []));
      } catch {
        /* the ledger is best-effort; delivery remains durable */
      }
      const stillOwned = await authIdentity(supabase, userId);
      if (stillOwned !== "ok") return { pushed, failed, skipped: stillOwned };
      pushed += rows.length;
      for (const item of originalEntries) await db.delete("outbox", item.id);
    }
  }

  for (const [entity, list] of deletes) {
    const identity = await authIdentity(supabase, userId);
    if (identity !== "ok") return { pushed, failed, skipped: identity };
    const ids = [...new Set(list.map((i) => rowId(i.payload)))].filter(Boolean);
    if (!ids.length) {
      for (const item of list) await db.delete("outbox", item.id);
      continue;
    }
    const { error } = await supabase.from(TABLES[entity]).delete().eq("user_id", userId).in("id", ids);
    if (error) {
      failed += list.length;
      // Mirror the upsert path: record the failure so it is diagnosable and
      // the attempt counter can eventually retire the item.
      for (const item of list) {
        await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: error.message });
      }
      continue;
    }
    const stillOwned = await authIdentity(supabase, userId);
    if (stillOwned !== "ok") return { pushed, failed, skipped: stillOwned };
    pushed += ids.length;
    for (const item of list) await db.delete("outbox", item.id);
  }

  return { pushed, failed, ...(hasUnknownOwner ? { skipped: "owner-unknown" as const } : {}) };
}

async function pull(userId: Id, supabase: SupabaseClient): Promise<{ pulled: number; failed: number; skipped?: SyncSkip }> {
  const db = await getDb();
  const since = (await readReviseMeta<string>("lastPullAt")) ?? "1970-01-01T00:00:00.000Z";
  let pulled = 0;
  let failed = 0;
  // Advance the cursor to the newest server-authored timestamp actually
  // observed — comparing against this device's wall clock would permanently
  // skip rows from any device whose clock runs behind ours.
  let maxObservedUpdatedAt = since;

  for (const [entity, table] of Object.entries(TABLES) as [SyncEntity, string][]) {
    const identity = await authIdentity(supabase, userId);
    if (identity !== "ok") return { pulled, failed, skipped: identity };
    const { data, error } = await supabase
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
    try {
      for (const row of data) {
        const incoming = await fromRow(entity, row);
        const existing = await tx.store.get(keyFor(entity, incoming));
        const merged = mergeForEntity(entity, existing as never, incoming as never);
        if (merged) await tx.store.put(merged as never);
        pulled++;
        // Fold the remote row's Lamport stamp into the local clock so future
        // local events sort after remote history they causally follow.
        const remoteLamport = Number((row.data as Record<string, unknown> | null)?.lamport);
        if (Number.isFinite(remoteLamport)) await observeRemoteLamport(remoteLamport);
        const rowUpdatedAt = String(row.updated_at ?? "");
        if (rowUpdatedAt > maxObservedUpdatedAt) maxObservedUpdatedAt = rowUpdatedAt;
      }
      await tx.done;
    } catch {
      // A single unreadable row (E2EE key mismatch) fails the table's
      // transaction; counting it keeps the cursor conservative so a future
      // pull — perhaps after the key is restored — retries these rows.
      failed++;
    }
  }

  // Keep the old cursor when a table failed so reconnecting retries that
  // table instead of silently skipping rows that were never pulled.
  if (failed === 0 && maxObservedUpdatedAt > since) await writeReviseMeta("lastPullAt", maxObservedUpdatedAt);
  return { pulled, failed };
}

/**
 * Per-entity merge rule on pull. Plain entities keep LWW (with the newer
 * updatedAt winning — same rule the push side applies). Memory-state entities
 * merge through the CRDT instead of picking a winner.
 *
 * Returns null when the row should not be written (existing is already
 * up to date) so the caller can skip the put.
 */
function mergeForEntity(
  entity: SyncEntity,
  existing: unknown,
  incoming: unknown,
): unknown {
  const local = existing as Record<string, unknown> | undefined;
  const remote = incoming as Record<string, unknown>;
  if (!local) return remote;

  switch (entity) {
    case "cards":
      // CRDT: union op logs, replay from the deterministic base. Concurrent
      // Again + Good both survive the merge.
      return mergeCard(local as unknown as Card, remote as unknown as Card);
    case "lessonProgress":
      // Grow-only union of completions + recomputed streak.
      return mergeLessonProgress(
        local as unknown as LessonProgress,
        remote as unknown as LessonProgress,
      ).merged;
    case "streak": {
      // Streak is grow-only in every field: count/longest/xp take maxima,
      // achievements union, lastActiveDate takes the later one.
      const a = local as unknown as StreakState;
      const b = remote as unknown as StreakState;
      return {
        ...a,
        current: Math.max(a.current, b.current),
        longest: Math.max(a.longest, b.longest),
        xp: Math.max(a.xp, b.xp),
        achievements: [...new Set([...(a.achievements ?? []), ...(b.achievements ?? [])])],
        lastActiveDate: (a.lastActiveDate ?? "") >= (b.lastActiveDate ?? "") ? a.lastActiveDate : b.lastActiveDate,
      } satisfies StreakState;
    }
    default:
      return isNewer(remote, local) ? remote : local;
  }
}

/**
 * Record delivered idempotency keys in the server-side ledger so any replay
 * of the same mutation is rejected at the table level.
 */
async function claimIdempotencyKeys(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: Id, keys: string[]): Promise<void> {
  if (!keys.length) return;
  await supabase.from("sync_writes").upsert(
    keys.map((key) => ({ id: key, user_id: userId })),
    { onConflict: "id" },
  );
}

const STORE_FOR: Record<SyncEntity, "cards" | "reviewLogs" | "attempts" | "mistakes" | "questions" | "papers" | "plannedSessions" | "examDates" | "settings" | "streak" | "lessonProgress"> = {
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
  lessonProgress: "lessonProgress",
};

function keyFor(entity: SyncEntity, row: Record<string, unknown>): string {
  return entity === "settings" || entity === "streak" || entity === "lessonProgress" ? String(row.userId) : String(row.id);
}

function pkFor(entity: SyncEntity): string {
  return entity === "settings" || entity === "streak" || entity === "lessonProgress" ? "user_id" : "id";
}

function rowId(payload: unknown): string {
  const row = payload as { id?: string; userId?: string };
  return row.id ?? row.userId ?? "";
}

/** Collapse duplicate writes for one row, retaining the newest queued entry. */
export function collapseOutboxItems(items: OutboxItem[]): OutboxItem[] {
  const latest = new Map<string, OutboxItem>();
  for (const item of items) {
    const key = `${item.entity}:${rowId(item.payload)}`;
    const current = latest.get(key);
    if (!current || queueOrder(item, current) > 0) latest.set(key, item);
  }
  return [...latest.values()].sort(queueOrder);
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function ownerFor(item: OutboxItem): Id | null {
  if (typeof item.ownerId === "string" && item.ownerId.trim()) return item.ownerId;
  const owner = payloadRecord(item.payload)?.userId;
  return typeof owner === "string" && owner.trim() ? owner : null;
}

function isOwnedBy(item: OutboxItem, userId: Id): boolean {
  const owner = ownerFor(item);
  return owner === userId || (owner === null && userId === "local");
}

function queueOrder(a: OutboxItem, b: OutboxItem): number {
  return a.queuedAt.localeCompare(b.queuedAt) || a.id.localeCompare(b.id);
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

/**
 * The wire format keeps the domain object whole in a JSONB `data` column and
 * lifts only what the server needs to index or filter on. That keeps schema
 * migrations off the critical path: a new domain field needs no migration.
 *
 * With E2EE on (user settings), `data` carries an AES-GCM blob instead of the
 * domain object — the server stores ciphertext it cannot read. The lifted
 * index columns (due, date) stay plaintext by design: they are bookkeeping
 * fields with no student content, and dropping them would cost the scheduler
 * query. `due`/`date` may also be omitted at rest when encryption is on, so
 * both shapes are read on pull.
 */
async function toRow(entity: SyncEntity, payload: unknown, userId: Id, opts?: { e2ee?: boolean }): Promise<Record<string, unknown>> {
  const row = payload as Record<string, unknown>;
  const updatedAt = (row.updatedAt as string) ?? (row.createdAt as string) ?? new Date().toISOString();
  const e2ee = opts?.e2ee ?? (await e2eeEnabledFor(userId));
  const data = e2ee ? await encryptPayload(row) : row;
  return {
    id: rowId(payload),
    user_id: userId,
    subject_id: row.subjectId ?? null,
    topic_id: row.topicId ?? null,
    due: entity === "cards" && !e2ee ? (row.due ?? null) : null,
    date: (entity === "plannedSessions" || entity === "examDates") && !e2ee ? (row.date ?? null) : null,
    data,
    updated_at: updatedAt,
  };
}

/**
 * The local settings row holds the E2EE preference. Read through IndexedDB
 * directly (not the React store) so the drain works in background contexts.
 * Missing row / missing flag = plaintext, the pre-E2EE default.
 */
async function e2eeEnabledFor(userId: Id): Promise<boolean> {
  try {
    const db = await getDb();
    const row = (await db.get("settings", userId)) as { e2eeEnabled?: boolean } | undefined;
    return Boolean(row?.e2eeEnabled);
  } catch {
    return false;
  }
}

async function fromRow(entity: SyncEntity, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const raw = row.data;
  // A not-yet-migrated device can push rows carrying legacy `seed-*` content
  // ids; a migrated device pulling them must rewrite those references or it
  // stores pointers the rest of the app can no longer resolve. The remap is
  // idempotent, so double-covering with the boot migration is harmless.
  const remap = (data: Record<string, unknown>): Record<string, unknown> => remapContentIds(data).value as Record<string, unknown>;
  // An encrypted row this device cannot read (key rotated, device replaced)
  // must not abort the whole table: surface it as a named error the caller
  // counts, the way any other row-level failure is counted.
  if (isEncryptedPayload(raw)) {
    try {
      const data = await decryptPayload<Record<string, unknown>>(raw);
      return remap({ ...data, userId: row.user_id ?? data.userId });
    } catch (error) {
      throw new Error(`E2EE decrypt failed for a synced row: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  const data = (raw ?? {}) as Record<string, unknown>;
  return remap({ ...data, userId: row.user_id ?? data.userId });
}

function isNewer(incoming: Record<string, unknown>, existing: unknown): boolean {
  // Compare as instants: mixed ISO precisions ("…Z" vs "…000Z") order
  // differently as strings but are identical moments.
  const timeOf = (row: Record<string, unknown> | undefined): number | null => {
    if (!row) return null;
    const raw = (row.updatedAt as string) ?? (row.createdAt as string) ?? "";
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  };
  const a = timeOf(incoming);
  const b = timeOf(existing as Record<string, unknown>);
  if (a != null && b != null) return a >= b;
  return String((incoming.updatedAt as string) ?? "") >= String(((existing as Record<string, unknown>)?.updatedAt as string) ?? "");
}
