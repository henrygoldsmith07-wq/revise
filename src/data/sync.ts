import type { Card, Id, LessonProgress, OutboxItem, SyncEntity, StreakState } from "@/domain/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCard, mergeLessonProgress } from "@/domain/sync-crdt";
import { decryptPayload, encryptPayload, isEncryptedPayload } from "./e2ee";
import { remapContentIds } from "./content-ids";
import { getDb } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { readReviseUserMeta, writeReviseUserMeta } from "./storage-namespace";
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
// Pull cursors are (updated_at, id) keysets per entity, ordered ascending and
// paged. The server bounds updated_at (supabase/schema.sql clamps device
// clocks to now() + 5 minutes), so one future-dated row cannot hide every
// legitimate row beneath it. A persisted cursor never advances past rows that
// were not processed successfully: per-row decrypt failures and per-page
// transport failures pin that entity's cursor while other entities still
// progress, and the next pull resumes from the persisted cursor. Merges are
// keyed puts, so re-fetched pages are idempotent and never duplicate writes.
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
export const MAX_OUTBOX_ATTEMPTS = 10;

export interface FailedOutboxItemSummary {
  id: Id;
  entity: SyncEntity;
  op: OutboxItem["op"];
  attempts: number;
  queuedAt: string;
  lastError: string | null;
}

/** Safe metadata only — payload/answer content is intentionally omitted. */
export async function failedOutboxItems(userId?: Id): Promise<FailedOutboxItemSummary[]> {
  const db = await getDb();
  const items = (await db.getAll("outbox")) as OutboxItem[];
  return items
    .filter((item) => item.attempts >= MAX_OUTBOX_ATTEMPTS && (!userId || isOwnedBy(item, userId)))
    .sort(queueOrder)
    .map((item) => ({
      id: item.id,
      entity: item.entity,
      op: item.op,
      attempts: item.attempts,
      queuedAt: item.queuedAt,
      lastError: item.lastError ?? null,
    }));
}

export async function retryFailedOutboxItem(id: Id, userId: Id): Promise<boolean> {
  const db = await getDb();
  const item = (await db.get("outbox", id)) as OutboxItem | undefined;
  if (!item || !isOwnedBy(item, userId) || item.attempts < MAX_OUTBOX_ATTEMPTS) return false;
  await db.put("outbox", { ...item, attempts: 0, lastError: undefined });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
  return true;
}

export async function discardFailedOutboxItem(id: Id, userId: Id): Promise<boolean> {
  const db = await getDb();
  const item = (await db.get("outbox", id)) as OutboxItem | undefined;
  if (!item || !isOwnedBy(item, userId) || item.attempts < MAX_OUTBOX_ATTEMPTS) return false;
  await db.delete("outbox", id);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
  return true;
}

/**
 * Explicit recovery export: unlike failedOutboxItems this includes the payload.
 * Callers must treat it as private student data.
 */
export async function failedOutboxRecoveryItem(id: Id, userId: Id): Promise<OutboxItem | null> {
  const db = await getDb();
  const item = (await db.get("outbox", id)) as OutboxItem | undefined;
  if (!item || !isOwnedBy(item, userId) || item.attempts < MAX_OUTBOX_ATTEMPTS) return null;
  return item;
}

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
  const collapsedItems = collapseOutboxItems(items);
  const upserts = new Map<SyncEntity, OutboxItem[]>();
  const deletes = new Map<SyncEntity, OutboxItem[]>();
  for (const item of collapsedItems) {
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
      const originalEntries = items.filter((item) => item.entity === entity && (batchIds.has(item.id) || batch.some((latest) => rowId(latest.payload) === rowId(item.payload))));
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
  const legacySince = (await readReviseUserMeta<string>("lastPullAt", userId)) ?? "1970-01-01T00:00:00.000Z";
  let pulled = 0;
  let failed = 0;
  let skipped: SyncSkip | undefined;
  // Newest server-authored timestamp actually observed — comparing against
  // this device's wall clock would permanently skip rows from any device
  // whose clock runs behind ours. Kept only for pre-pagination clients.
  let maxObservedUpdatedAt = legacySince;

  for (const [entity, table] of Object.entries(TABLES) as [SyncEntity, string][]) {
    const outcome = await pullEntity(userId, supabase, entity, table, legacySince);
    pulled += outcome.pulled;
    failed += outcome.failed;
    if (outcome.skipped) {
      skipped = outcome.skipped;
      break;
    }
    if (instantOf(outcome.maxObservedUpdatedAt) > instantOf(maxObservedUpdatedAt)) {
      maxObservedUpdatedAt = outcome.maxObservedUpdatedAt;
    }
  }

  // Keep the old cursor when a table failed so reconnecting retries that
  // table instead of silently skipping rows that were never pulled. Per-entity
  // cursors (written inside pullEntity) already let a retry resume exactly
  // where the failure happened; the legacy key stays as the cross-version
  // fallback for clients that predate per-entity cursors. It must cover every
  // entity's persisted progress — not just this run's observations — or one
  // already-ahead entity would regress the shared cursor on a quiet run.
  if (!skipped && failed === 0) {
    let max = maxObservedUpdatedAt;
    const persisted = await readReviseUserMeta<Partial<Record<string, PullCursor>>>("pullCursors", userId).catch(() => undefined);
    for (const entry of Object.values(persisted ?? {})) {
      if (entry && typeof entry.updatedAt === "string" && instantOf(entry.updatedAt) > instantOf(max)) {
        max = entry.updatedAt;
      }
    }
    if (instantOf(max) > instantOf(legacySince)) {
      await writeReviseUserMeta("lastPullAt", userId, max);
    }
  }
  return { pulled, failed, ...(skipped ? { skipped } : {}) };
}

/** Rows per pull page. Small enough to stay well under transport limits, large enough that a 5k-row history finishes in ~10 pages. */
export const SYNC_PULL_PAGE_SIZE = 500;
/** Defensive ceiling: 500 rows × 10k pages covers histories far beyond any real account without looping forever on a pathological server. */
const SYNC_PULL_MAX_PAGES = 10_000;
/** Sorts after every real row id, so a legacy timestamp-only cursor keeps its exact exclusive (`gt`) meaning under the keyset. */
const CURSOR_SENTINEL_ID = "\uffff";

export interface PullCursor {
  updatedAt: string;
  id: string;
}

function pullCursorKey(entity: SyncEntity): string {
  return `lastPullAt:${entity}`;
}

/** Per-entity resume cursor, seeded once from the legacy global timestamp. */
async function readPullCursor(userId: Id, entity: SyncEntity, legacySince: string): Promise<PullCursor> {
  const all = await readReviseUserMeta<Partial<Record<string, PullCursor>>>("pullCursors", userId).catch(() => undefined);
  const scoped = all?.[pullCursorKey(entity)];
  if (scoped && typeof scoped.updatedAt === "string" && scoped.updatedAt) {
    return { updatedAt: scoped.updatedAt, id: typeof scoped.id === "string" ? scoped.id : CURSOR_SENTINEL_ID };
  }
  return { updatedAt: legacySince, id: CURSOR_SENTINEL_ID };
}

async function writePullCursor(userId: Id, entity: SyncEntity, cursor: PullCursor): Promise<void> {
  const all = (await readReviseUserMeta<Partial<Record<string, PullCursor>>>("pullCursors", userId).catch(() => undefined)) ?? {};
  await writeReviseUserMeta("pullCursors", userId, { ...all, [pullCursorKey(entity)]: cursor });
}

/** Lexicographic (updated_at, id) cursor comparison over ISO strings. */
function cursorAfter(a: { updatedAt: string; id: string }, b: { updatedAt: string; id: string }): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id);
}

/** Instant compare for cursor freshness; mixed ISO precisions order differently as raw strings but are identical moments. */
function instantOf(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

interface PullEntityOutcome {
  pulled: number;
  failed: number;
  skipped?: SyncSkip;
  maxObservedUpdatedAt: string;
}

/**
 * Pull one entity through deterministic (updated_at, id) keyset pages.
 *
 * Never relies on the server's default row limit: every page is explicitly
 * ordered and bounded, many rows may share one timestamp, and the persisted
 * cursor advances only after every row of the page merged successfully, so an
 * interrupted pull resumes from the last fully-processed page. Unreadable
 * (E2EE) rows fail individually — counted, never silently dropped — while the
 * rest of the page still merges; the entity cursor stays pinned so a later
 * pull (perhaps with the key restored) retries them.
 */
async function pullEntity(
  userId: Id,
  supabase: SupabaseClient,
  entity: SyncEntity,
  table: string,
  legacySince: string,
): Promise<PullEntityOutcome> {
  const db = await getDb();
  let cursor = await readPullCursor(userId, entity, legacySince);
  let pulled = 0;
  let failed = 0;
  let maxObservedUpdatedAt = legacySince;
  let entityOk = true;

  for (let page = 0; page < SYNC_PULL_MAX_PAGES; page++) {
    const identity = await authIdentity(supabase, userId);
    if (identity !== "ok") return { pulled, failed, skipped: identity, maxObservedUpdatedAt };
    let data: Array<Record<string, unknown>> | null;
    let error: { message: string } | null;
    try {
      const response = await supabase
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(0, SYNC_PULL_PAGE_SIZE - 1);
      data = (response.data ?? null) as Array<Record<string, unknown>> | null;
      error = (response.error ?? null) as { message: string } | null;
    } catch {
      return { pulled, failed: failed + 1, maxObservedUpdatedAt };
    }
    if (error) {
      failed++;
      entityOk = false;
      break;
    }
    const rows = data ?? [];
    // Belt-and-braces: the server already keyset-filters, but never process a
    // row at or behind the cursor — that is what makes resume duplicate-free.
    const fresh = rows.filter((row) => cursorAfter(
      { updatedAt: String(row.updated_at ?? ""), id: String(row.id ?? "") },
      cursor,
    ));
    if (!fresh.length) break;

    const identityBeforeWrite = await authIdentity(supabase, userId);
    if (identityBeforeWrite !== "ok") return { pulled, failed, skipped: identityBeforeWrite, maxObservedUpdatedAt };

    const incomingRows: Array<Record<string, unknown>> = [];
    let rowFailures = 0;
    for (const row of fresh) {
      try {
        incomingRows.push(await fromRow(entity, row));
      } catch {
        // One unreadable row (E2EE key mismatch) must not abort its siblings:
        // count it and keep the entity cursor pinned so a future pull retries.
        rowFailures++;
      }
    }
    if (incomingRows.length) {
      for (const incoming of incomingRows) {
        const remoteLamport = Number(incoming.lamport);
        if (Number.isFinite(remoteLamport)) await observeRemoteLamport(remoteLamport);
      }
      const store = STORE_FOR[entity];
      const tx = db.transaction(store, "readwrite");
      try {
        for (const incoming of incomingRows) {
          const existing = await tx.store.get(keyFor(entity, incoming));
          const merged = mergeForEntity(entity, existing as never, incoming as never);
          if (merged) await tx.store.put(merged as never);
        }
        await tx.done;
      } catch {
        try { tx.abort(); } catch { /* already finished */ }
        await tx.done.catch(() => undefined);
        return { pulled, failed: failed + 1, maxObservedUpdatedAt };
      }
      pulled += incomingRows.length;
    }
    failed += rowFailures;
    if (rowFailures > 0) {
      // Pin this entity's cursor: successfully merged pages stay merged
      // (keyed puts are idempotent), and the retry re-fetches from the last
      // fully-processed page instead of skipping the unreadable rows.
      entityOk = false;
      break;
    }
    const last = fresh[fresh.length - 1]!;
    cursor = { updatedAt: String(last.updated_at ?? ""), id: String(last.id ?? "") };
    if (instantOf(cursor.updatedAt) > instantOf(maxObservedUpdatedAt)) maxObservedUpdatedAt = cursor.updatedAt;
    if (rows.length < SYNC_PULL_PAGE_SIZE) break;
  }

  if (entityOk) {
    const persistIdentity = await authIdentity(supabase, userId);
    if (persistIdentity !== "ok") return { pulled, failed, skipped: persistIdentity, maxObservedUpdatedAt };
    await writePullCursor(userId, entity, cursor);
  }
  return { pulled, failed, maxObservedUpdatedAt };
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
  // Causal order first: the Lamport clock is the only ordering that survives
  // skewed wall clocks (a device days ahead must not jump its queued edits
  // ahead of causally-earlier work). Wall-clock queuedAt is only the
  // tie-break for legacy rows minted before Lamport stamping.
  const lamportA = a.lamport ?? 0;
  const lamportB = b.lamport ?? 0;
  if (lamportA !== lamportB) return lamportA - lamportB;
  const deviceA = a.deviceId ?? "";
  const deviceB = b.deviceId ?? "";
  if (deviceA !== deviceB) return deviceA < deviceB ? -1 : 1;
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
