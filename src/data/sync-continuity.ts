import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "./db";
import { applyDeletionPage } from "./sync-deletions";
import { historyFrozenFingerprint, historyStorageKey, validateHistoryRecord } from "@/domain/learner-history";
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

export interface ContinuityPullOutcome {
  /** Rows applied (possibly beyond the persisted cursor; re-applying is idempotent). */
  pulled: number;
  /** Encrypted rows this device could not read (another device's key, or none here). */
  undecryptable: number;
}

/** Server change sequences are issued under a transaction-wide advisory lock,
 * so commit order is cursor order. Student wall clocks never order these rows. */
export async function pullContinuity(client: SupabaseClient, userId: string, table: "sync_tombstones" | "learner_records"): Promise<number> {
  return (await pullContinuityDetailed(client, userId, table)).pulled;
}

/**
 * The same pull, also reporting rows it could not decrypt. An undecryptable
 * learner record is the normal case when two devices each switched E2EE on
 * with their own key: like the entity pull in sync.ts, it is counted, the
 * persisted cursor stays pinned just before it (so a later pull with the key
 * restored retries it), and the rest of the feed is still applied. Structural
 * problems (ownership, ordering, contradictory headers, malformed records)
 * still throw: those are not a key problem and must stop the pass.
 */
export async function pullContinuityDetailed(client: SupabaseClient, userId: string, table: "sync_tombstones" | "learner_records"): Promise<ContinuityPullOutcome> {
  const db = await getDb();
  const key = `revise.changeCursor.v1:${table}::user:${userId}`;
  const stored = Number((await db.get("meta", key))?.value ?? 0);
  if (!Number.isSafeInteger(stored) || stored < 0) throw new Error("Invalid continuity cursor.");
  // `scan` walks the feed; `safe` is what may be persisted: never past a row
  // that was not applied.
  let scan = stored;
  let safe = stored;
  let pinned = false;
  let pulled = 0;
  let undecryptable = 0;
  try {
    for (let page = 0; page < 100; page++) {
      const identity = await client.auth.getUser();
      if (identity.data.user?.id !== userId) throw new Error("Continuity account mismatch.");
      const { data, error } = await client.from(table).select("*").eq("user_id", userId).gt("change_seq", scan).order("change_seq").range(0, 99);
      if (error) throw new Error(`Continuity schema/transport failure: ${table}`);
      const rows = data ?? [];
      let next = scan;
      for (const row of rows) {
        if (row.user_id !== userId || !Number.isSafeInteger(row.change_seq) || row.change_seq <= next) throw new Error("Invalid continuity ownership or ordering.");
        next = row.change_seq;
        if (table === "sync_tombstones") await applyDeletionPage([row], userId);
        else {
          let raw: unknown = row.data;
          if (isEncryptedPayload(row.data)) {
            try {
              raw = await decryptPayload(row.data);
            } catch {
              undecryptable++;
              pinned = true;
              continue;
            }
          }
          const record = validateHistoryRecord(raw, userId);
          if (row.id !== await syncWireId(userId, record.id) || row.lamport !== record.lamport || row.device_id !== record.deviceId || row.deleted !== record.deleted || row.kind !== record.kind || row.frozen_fingerprint !== historyFrozenFingerprint(record)) throw new Error("Contradictory learner history headers.");
          // Past a pinned row every later row is fetched again on each pass;
          // one already stored verbatim is not news (and must not make the
          // app reload its snapshot every sync).
          if (pinned && JSON.stringify((await db.get("meta", historyStorageKey(record.id)))?.value) === JSON.stringify(record)) continue;
          await applyLearnerHistory(record, userId);
        }
        pulled++;
        if (!pinned) safe = next;
      }
      // Auth can change while decrypting or writing; pin the cursor on mismatch.
      if ((await client.auth.getUser()).data.user?.id !== userId) throw new Error("Continuity account mismatch.");
      if (safe !== stored) await db.put("meta", { key, value: safe });
      scan = next;
      if (rows.length < 100) break;
    }
    return { pulled, undecryptable };
  } catch (error) {
    throw new ContinuityPullError(error, pulled);
  } finally {
    if (table === "learner_records" && pulled) notifyHistoryChanged();
  }
}
