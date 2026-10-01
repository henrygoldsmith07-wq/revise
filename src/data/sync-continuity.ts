import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "./db";
import { applyDeletionPage } from "./sync-deletions";
import { historyFrozenFingerprint, validateHistoryRecord } from "@/domain/learner-history";
import { applyLearnerHistory, notifyHistoryChanged } from "./learner-history";
import { decryptPayload, isEncryptedPayload } from "./e2ee";
import { syncWireId } from "./sync-contract";

/** A failed page may have committed rows. Callers must refresh those changes
 * while retaining the page cursor for an idempotent retry. */
export class ContinuityPullError extends Error {
  constructor(error: unknown, readonly applied: number) {
    super(error instanceof Error ? error.message : "Continuity pull failed.");
    this.name = "ContinuityPullError";
  }
}

/** Server change sequences are issued under a transaction-wide advisory lock,
 * so commit order is cursor order. Student wall clocks never order these rows. */
export async function pullContinuity(client: SupabaseClient, userId: string, table: "sync_tombstones" | "learner_records"): Promise<number> {
  const db = await getDb();
  const key = `revise.changeCursor.v1:${table}::user:${userId}`;
  let cursor = Number((await db.get("meta", key))?.value ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid continuity cursor.");
  let pulled = 0;
  try {
    for (let page = 0; page < 100; page++) {
      const identity = await client.auth.getUser();
      if (identity.data.user?.id !== userId) throw new Error("Continuity account mismatch.");
      const { data, error } = await client.from(table).select("*").eq("user_id", userId).gt("change_seq", cursor).order("change_seq").range(0, 99);
      if (error) throw new Error(`Continuity schema/transport failure: ${table}`);
      const rows = data ?? [];
      let next = cursor;
      for (const row of rows) {
        if (row.user_id !== userId || !Number.isSafeInteger(row.change_seq) || row.change_seq <= next) throw new Error("Invalid continuity ownership or ordering.");
        next = row.change_seq;
        if (table === "sync_tombstones") await applyDeletionPage([row], userId);
        else {
          const raw = isEncryptedPayload(row.data) ? await decryptPayload(row.data) : row.data;
          const record = validateHistoryRecord(raw, userId);
          if (row.id !== await syncWireId(userId, record.id) || row.lamport !== record.lamport || row.device_id !== record.deviceId || row.deleted !== record.deleted || row.kind !== record.kind || row.frozen_fingerprint !== historyFrozenFingerprint(record)) throw new Error("Contradictory learner history headers.");
          await applyLearnerHistory(record, userId);
        }
        pulled++;
      }
      // Auth can change while decrypting or writing; pin the cursor on mismatch.
      if ((await client.auth.getUser()).data.user?.id !== userId) throw new Error("Continuity account mismatch.");
      if (rows.length) await db.put("meta", { key, value: next });
      cursor = next;
      if (rows.length < 100) break;
    }
    return pulled;
  } catch (error) {
    throw new ContinuityPullError(error, pulled);
  } finally {
    if (table === "learner_records" && pulled) notifyHistoryChanged();
  }
}
