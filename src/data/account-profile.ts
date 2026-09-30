import { COLLECTION_STORES, getProfileDb, type ReviseDB } from "./db";
import { validateHistoryRecord } from "@/domain/learner-history";
import { validateTombstone } from "@/domain/sync-tombstone";
import { REVISE_META_KEYS } from "./storage-namespace";
import type { OutboxItem, SyncEntity } from "@/domain/types";

export const LOCAL_PROFILE = "local";
export const PROFILE_INITIALIZED = "revise.profile.initialized.v1";
const ADOPTED_BY = "revise.profile.adoptedBy.v1";
const SINGLETONS = ["settings", "streak", "lessonProgress"] as const;
const PROFILE_STORES = [...COLLECTION_STORES, ...SINGLETONS, "outbox", "meta", "aiCache", "aiDlq"] as const;

export function canonicalProfile(accountId: string | null): string {
  if (accountId === null) return LOCAL_PROFILE;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    throw new Error("Invalid account identity.");
  }
  return accountId;
}

/** Remap identity fields and user-keyed metadata, never educational ids/text. */
export function adoptOwner(value: unknown, userId: string): unknown {
  if (Array.isArray(value)) return value.map((row) => adoptOwner(row, userId));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === "userId" || key === "ownerId") {
      if (entry !== LOCAL_PROFILE) throw new Error("Mixed-owner local data cannot be adopted.");
      return [key, userId];
    }
    if (key === "anonId" && entry === LOCAL_PROFILE) return [key, userId];
    // User-keyed checkpoint/twin maps contain explicitly owned records.
    // An answer or authored dictionary key named "local" is educational data.
    const ownedEntry = entry && typeof entry === "object" &&
      ((entry as Record<string, unknown>).userId === LOCAL_PROFILE || (entry as Record<string, unknown>).ownerId === LOCAL_PROFILE);
    return [key === LOCAL_PROFILE && ownedEntry ? userId : key, adoptOwner(entry, userId)];
  }));
}

export async function needsProfileChoice(userId: string): Promise<boolean> {
  const target = await getProfileDb(canonicalProfile(userId));
  if (await target.get("meta", PROFILE_INITIALIZED)) return false;
  // Existing account data is never overwritten by local adoption.
  for (const store of PROFILE_STORES) {
    if (store !== "meta" && await target.count(store)) return false;
  }
  const local = await getProfileDb(LOCAL_PROFILE);
  const claimed = (await local.get("meta", ADOPTED_BY))?.value;
  if (claimed && claimed !== userId) return false;
  return Boolean(await local.count("cards") || await local.count("attempts") || await local.count("settings"));
}

/** Copy only after the student's explicit choice. Keep the local source intact.
 * A durable source claim prevents copying the same learner into another account.
 * The destination copy + outbox + completion marker commit in one transaction. */
export async function initializeAccountProfile(userId: string, adoptLocal: boolean): Promise<void> {
  canonicalProfile(userId);
  if (userId === LOCAL_PROFILE) throw new Error("An account UUID is required.");
  const target = await getProfileDb(userId);
  if (await target.get("meta", PROFILE_INITIALIZED)) return;
  if (!adoptLocal) {
    const tx = target.transaction("meta", "readwrite");
    if (!await tx.store.get(PROFILE_INITIALIZED)) await tx.store.put({ key: PROFILE_INITIALIZED, value: { adopted: false } });
    await tx.done;
    return;
  }
  if (!await needsProfileChoice(userId)) {
    if (await target.get("meta", PROFILE_INITIALIZED)) return;
    throw new Error("This profile cannot adopt local data.");
  }
  const source = await getProfileDb(LOCAL_PROFILE);
  const sourceTx = source.transaction(PROFILE_STORES, "readwrite");
  const claimed = (await sourceTx.objectStore("meta").get(ADOPTED_BY))?.value;
  if (claimed && claimed !== userId) {
    sourceTx.abort();
    await sourceTx.done.catch(() => undefined);
    throw new Error("Local data already belongs to another account.");
  }
  const rows = await Promise.all(PROFILE_STORES.map((store) => sourceTx.objectStore(store).getAll()));
  // Validate BEFORE claiming or writing; mixed ownership fails the whole copy.
  let adopted: unknown[][];
  try {
    for (const row of rows[PROFILE_STORES.indexOf("meta")] ?? []) {
      const key = String((row as { key: string }).key);
      if (key.includes("::user:") && !key.endsWith("::user:local")) throw new Error("Mixed-owner local metadata cannot be adopted.");
    }
    for (const entry of rows[PROFILE_STORES.indexOf("outbox")] ?? []) {
      const item = entry as OutboxItem;
      const payload = item.payload as { userId?: unknown } | null;
      if (!item.ownerId && payload?.userId !== LOCAL_PROFILE) throw new Error("Unknown-owner local mutations cannot be adopted.");
    }
    adopted = rows.map((entries) => entries.map((row) => adoptOwner(row, userId)));
  } catch (error) {
    sourceTx.abort();
    await sourceTx.done.catch(() => undefined);
    throw error;
  }
  await sourceTx.objectStore("meta").put({ key: ADOPTED_BY, value: userId });
  await sourceTx.done;
  const tx = target.transaction(PROFILE_STORES, "readwrite");
  // Another tab may have finished the same first-sign-in decision while we
  // read the source. Recheck under the destination write lock before copying.
  if (await tx.objectStore("meta").get(PROFILE_INITIALIZED)) {
    await tx.done;
    return;
  }
  const entities: Record<string, SyncEntity> = { settings: "settings", streak: "streak", lessonProgress: "lessonProgress" };
  for (const [index, store] of PROFILE_STORES.entries()) {
    for (const entry of adopted[index] ?? []) {
      const row = entry as Record<string, unknown>;
      if (store === "meta") {
        const key = String(row.key);
        if (key === ADOPTED_BY || key.startsWith(REVISE_META_KEYS.lastPullAt) || key.startsWith(REVISE_META_KEYS.pullCursors)) continue;
        row.key = key.replace("::user:local", `::user:${userId}`);
        if (key.startsWith("revise.historyRecord.v1:") || key.startsWith("revise.deleted.v1:")) {
          const history = key.startsWith("revise.historyRecord.v1:");
          const value = history ? validateHistoryRecord(row.value, userId) : validateTombstone(row.value, userId);
          await tx.objectStore("outbox").put({ id: crypto.randomUUID(), ownerId: userId, entity: history ? "learnerRecords" : (value as ReturnType<typeof validateTombstone>).entity, op: history ? "upsert" : "delete", payload: value, queuedAt: new Date().toISOString(), attempts: 0, idempotencyKey: crypto.randomUUID() });
        }
      }
      // Cached marks and pending regrading belong to the original device profile.
      if (store === "aiCache" || store === "aiDlq") continue;
      await tx.objectStore(store).put(row as never);
      // Queue the complete adopted state, including data created without a backend.
      // Seed questions are public curriculum content and have no userId.
      if (store !== "outbox" && store !== "meta" && row.userId === userId) {
        const entity = entities[store] ?? store as SyncEntity;
        const item: OutboxItem = {
          id: crypto.randomUUID(), entity, op: "upsert", payload: row, ownerId: userId,
          queuedAt: new Date().toISOString(), attempts: 0, idempotencyKey: crypto.randomUUID(),
        };
        await tx.objectStore("outbox").put(item);
      }
    }
  }
  await tx.objectStore("meta").put({ key: PROFILE_INITIALIZED, value: { adopted: true } });
  await tx.done;
}

/** Await currently scheduled IDB work before replacing the document. */
export async function settleProfileWrites(db: ReviseDB): Promise<void> {
  await db.transaction(PROFILE_STORES, "readonly").done;
}
