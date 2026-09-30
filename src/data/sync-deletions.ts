import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb, type CollectionStore } from "./db";
import { isSupabaseConfigured } from "./supabase";
import { SYNC_TABLES, syncWireId, syncWireIdValue } from "./sync-contract";
import { tombstoneKey, wireTombstoneKey, validateTombstone, type DeletableEntity } from "@/domain/sync-tombstone";
import type { OutboxItem } from "@/domain/types";

/** Delete + durable suppression + queued remote intent commit together. */
export async function deleteReplicaRows(entity: DeletableEntity, ids: readonly string[], userId: string, replacements: readonly { id: string; userId: string }[] = []): Promise<void> {
  const tx = (await getDb()).transaction([entity, "meta", "outbox"], "readwrite");
  try {
    const pending = await tx.objectStore("outbox").getAll();
    for (const row of replacements) {
      if (row.userId !== userId) throw new Error("Mixed-owner replacement.");
      if (await tx.objectStore("meta").get(tombstoneKey(entity, row.id)) || await tx.objectStore("meta").get(wireTombstoneKey(entity, syncWireIdValue(userId, row.id)))) throw new Error("Cannot restore a deleted id.");
      await tx.objectStore(entity).put(row as never);
    }
    for (const id of new Set(ids)) {
      const row = await tx.objectStore(entity).get(id) as { userId?: string } | undefined;
      if (row?.userId !== undefined && row.userId !== userId) throw new Error("Cannot delete another owner's row.");
      await tx.objectStore(entity).delete(id);
      await tx.objectStore("meta").put({ key: tombstoneKey(entity, id), value: { id, entity, userId } });
      // A pending stale upsert must not outrun its terminal deletion.
      for (const item of pending) {
        if (item.entity === entity && item.ownerId === userId && (item.payload as { id?: string } | null)?.id === id) await tx.objectStore("outbox").delete(item.id);
      }
      if (isSupabaseConfigured && userId !== "local") {
        const item: OutboxItem = { id: crypto.randomUUID(), entity, op: "delete", ownerId: userId, payload: { id, userId }, queuedAt: new Date().toISOString(), attempts: 0, idempotencyKey: crypto.randomUUID() };
        await tx.objectStore("outbox").put(item);
      }
    }
    await tx.done;
  } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => undefined); throw error; }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("revise:sync-queue"));
}

export async function applyRemoteDeletion(raw: unknown, userId: string): Promise<void> {
  const row = validateTombstone(raw, userId);
  const tx = (await getDb()).transaction([row.entity as CollectionStore, "meta", "outbox"], "readwrite");
  try {
    const key = row.wireOnly ? wireTombstoneKey(row.entity, row.id) : tombstoneKey(row.entity, row.id);
    await tx.objectStore("meta").put({ key, value: row });
    const matches = (id: string) => row.wireOnly ? syncWireIdValue(userId, id) === row.id : id === row.id;
    for (const existing of await tx.objectStore(row.entity).getAll()) {
      if (!matches(existing.id)) continue;
      if ("userId" in existing && existing.userId !== undefined && existing.userId !== userId) throw new Error("Mixed-owner deletion target.");
      await tx.objectStore(row.entity).delete(existing.id);
    }
    for (const item of await tx.objectStore("outbox").getAll()) {
      const id = (item.payload as { id?: string } | null)?.id;
      if (item.ownerId === userId && item.entity === row.entity && id && matches(id)) await tx.objectStore("outbox").delete(item.id);
    }
    await tx.done;
  } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => undefined); throw error; }
}

export async function sendReplicaDeletion(client: SupabaseClient, entity: DeletableEntity, id: string, userId: string) {
  return client.rpc("delete_replica_row", { entity_name: entity, row_id: await syncWireId(userId, id), local_id: id, expected_owner: userId });
}

export async function deletionIsKnown(entity: DeletableEntity, id: string, userId: string): Promise<boolean> {
  const marker = await (await getDb()).get("meta", tombstoneKey(entity, id));
  const wire = await (await getDb()).get("meta", wireTombstoneKey(entity, syncWireIdValue(userId, id)));
  for (const found of [marker, wire]) if (found) validateTombstone(found.value, userId);
  return Boolean(marker || wire);
}

/** Headers are independently checked even when server RLS should filter them. */
export async function applyDeletionPage(rows: Record<string, unknown>[], userId: string): Promise<void> {
  for (const row of rows) {
    if (row.user_id !== userId || !Object.values(SYNC_TABLES).includes(String(row.table_name))) throw new Error("Invalid deletion owner or table.");
    const entity = Object.entries(SYNC_TABLES).find(([, table]) => table === row.table_name)?.[0] as DeletableEntity;
    if (row.local_id === null) {
      if (typeof row.row_id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.row_id)) throw new Error("Invalid wire deletion.");
      await applyRemoteDeletion({ id: row.row_id, entity, userId, wireOnly: true }, userId);
      continue;
    }
    if (row.row_id !== await syncWireId(userId, String(row.local_id))) throw new Error("Invalid deletion wire identity.");
    await applyRemoteDeletion({ id: row.local_id, entity, userId }, userId);
  }
}
