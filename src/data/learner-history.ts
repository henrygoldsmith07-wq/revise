import { getDb } from "./db";
import { getDeviceIdentity } from "./device";
import { isSupabaseConfigured } from "./supabase";
import { REVISE_META_KEYS } from "./storage-namespace";
import { canonicalJson } from "@/domain/content-fingerprint";
import { HISTORY_KINDS, historyRecordId, historyStorageKey, mergeHistoryRecord, validateHistoryRecord, validateHistoryValue, type HistoryKind, type LearnerHistoryRecord } from "@/domain/learner-history";
import type { OutboxItem } from "@/domain/types";

export const HISTORY_CHANGED_EVENT = "revise:history-changed";
export function notifyHistoryChanged() { if (typeof window !== "undefined") window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)); }

/** Row upserts rather than array replacement: another device's rows survive. */
export async function writeLearnerHistory(kind: HistoryKind, userId: string, values: unknown[], removedIds: readonly string[] = []): Promise<void> {
  const valid = values.map(value => validateHistoryValue(kind, value, userId));
  const device = await getDeviceIdentity();
  const tx = (await getDb()).transaction(["meta", "outbox"], "readwrite");
  const meta = tx.objectStore("meta");
  try {
    let counter = Number((await meta.get(REVISE_META_KEYS.lamport))?.value ?? 0);
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid logical clock.");
    const current = (await meta.get(REVISE_META_KEYS[kind]))?.value;
    const projected = new Map<string, Record<string, unknown>>((Array.isArray(current) ? current : []).map(value => {
      const row = validateHistoryValue(kind, value, userId); return [String(row.id), row];
    }));
    for (const [recordId, value] of [...valid.map(value => [String(value.id), value] as const), ...removedIds.map(id => [id, null] as const)]) {
      const id = historyRecordId(kind, recordId);
      const oldRaw = (await meta.get(historyStorageKey(id)))?.value;
      const old = oldRaw ? validateHistoryRecord(oldRaw, userId) : undefined;
      if (old?.deleted) { projected.delete(recordId); continue; }
      if (old && canonicalJson(old.value) === canonicalJson(value)) continue;
      if (!Number.isSafeInteger(++counter)) throw new Error("Logical clock exhausted.");
      const row: LearnerHistoryRecord = { id, recordId, userId, kind, value, deleted: value === null, lamport: counter, deviceId: device.deviceId };
      mergeHistoryRecord(old, row); // Enforce frozen prediction fields before mutation.
      await meta.put({ key: historyStorageKey(id), value: row });
      if (value) projected.set(recordId, value); else projected.delete(recordId);
      if (isSupabaseConfigured && userId !== "local") {
        const item: OutboxItem = { id: crypto.randomUUID(), ownerId: userId, entity: "learnerRecords", op: "upsert", payload: row, queuedAt: new Date().toISOString(), attempts: 0, lamport: counter, deviceId: device.deviceId, idempotencyKey: crypto.randomUUID() };
        await tx.objectStore("outbox").put(item);
      }
    }
    await meta.put({ key: REVISE_META_KEYS.lamport, value: counter });
    await meta.put({ key: REVISE_META_KEYS[kind], value: [...projected.values()] });
    await tx.done;
  } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => undefined); throw error; }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("revise:sync-queue"));
  notifyHistoryChanged();
}

/** Upgrade legacy local arrays without dropping them or inventing evidence. */
export async function migrateLearnerHistory(userId: string): Promise<void> {
  const db = await getDb();
  for (const kind of HISTORY_KINDS) {
    const rows = (await db.get("meta", REVISE_META_KEYS[kind]))?.value;
    if (rows !== undefined && !Array.isArray(rows)) throw new Error("Malformed legacy learner history.");
    if (Array.isArray(rows) && rows.length) await writeLearnerHistory(kind, userId, rows);
  }
}

export async function applyLearnerHistory(incoming: LearnerHistoryRecord, userId: string): Promise<void> {
  const row = validateHistoryRecord(incoming, userId);
  const tx = (await getDb()).transaction("meta", "readwrite");
  try {
    const raw = (await tx.store.get(historyStorageKey(row.id)))?.value;
    const merged = mergeHistoryRecord(raw ? validateHistoryRecord(raw, userId) : undefined, row);
    const saved = (await tx.store.get(REVISE_META_KEYS[row.kind]))?.value;
    const rows = (Array.isArray(saved) ? saved : []).map(value => validateHistoryValue(row.kind, value, userId)).filter(value => value.id !== row.recordId);
    if (!merged.deleted && merged.value) rows.push(merged.value);
    await tx.store.put({ key: historyStorageKey(row.id), value: merged });
    await tx.store.put({ key: REVISE_META_KEYS[row.kind], value: rows });
    const clock = Number((await tx.store.get(REVISE_META_KEYS.lamport))?.value ?? 0);
    await tx.store.put({ key: REVISE_META_KEYS.lamport, value: Math.max(clock, row.lamport) });
    await tx.done;
  } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => undefined); throw error; }
}

/** Optional v2 export fields preserve terminal intent even before the next pull. */
export async function exportContinuityDeletions(userId: string) {
  const rows = await (await getDb()).getAll("meta");
  const { validateTombstone } = await import("@/domain/sync-tombstone");
  return {
    deletions: rows.filter(row => row.key.startsWith("revise.deleted.v1:") || row.key.startsWith("revise.deletedWire.v1:")).map(row => validateTombstone(row.value, userId)),
    learnerHistoryDeletions: rows.filter(row => row.key.startsWith("revise.historyRecord.v1:")).map(row => validateHistoryRecord(row.value, userId)).filter(row => row.deleted),
  };
}

/** Legacy tabs may rewrite their old array projection; a retained envelope's
 * terminal intent still wins before any row is used for calibration. */
export async function readLearnerHistory(kind: HistoryKind, userId: string): Promise<Record<string, unknown>[]> {
  const tx = (await getDb()).transaction("meta", "readonly");
  const values = (await tx.store.get(REVISE_META_KEYS[kind]))?.value;
  if (values !== undefined && !Array.isArray(values)) throw new Error("Malformed learner history.");
  const valid = (Array.isArray(values) ? values : []).map(value => validateHistoryValue(kind,value,userId));
  const envelopes = await Promise.all(valid.map(row => tx.store.get(historyStorageKey(historyRecordId(kind,String(row.id))))));
  await tx.done;
  return valid.filter((_row,index) => {
    const raw=envelopes[index]?.value;
    return !raw || !validateHistoryRecord(raw,userId).deleted;
  });
}
