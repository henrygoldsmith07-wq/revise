import { gradeCard } from "@/domain/scheduling";
import { deferRepairAfterRetrieval } from "@/domain/repair-evidence";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import type { Card, Mistake, OutboxItem, RecallGrade, ReviewLog } from "@/domain/types";
import { activeDatabaseProfile, getDb } from "./db";
import { getDeviceIdentity, nextLamport } from "./device";
import { isSupabaseConfigured } from "./supabase";
import { SYNC_QUEUE_EVENT } from "./sync";
import { syncWireIdValue } from "./sync-contract";

/** Read-modify-write the saved card, its review evidence and remote intent together.
 * A held UI card is an identity, never a scheduling snapshot. IndexedDB serializes
 * overlapping transactions, so neither a retry nor another tab drops CRDT events. */
export async function saveCardReview(
  identity: Pick<Card, "id" | "userId">,
  userId: string,
  grade: RecallGrade,
  elapsedMs: number,
  confidence?: 1 | 2 | 3 | 4 | 5,
  now = new Date(),
): Promise<{ card: Card; log: ReviewLog; mistakes: Mistake[] }> {
  if (identity.userId !== userId || activeDatabaseProfile() !== userId) {
    throw new Error("Cannot review a card from another account.");
  }
  // Resolve asynchronous identity/clock work before opening the transaction.
  const [db, device, lamport] = await Promise.all([getDb(), getDeviceIdentity(), nextLamport()]);
  const tx = db.transaction(["cards", "reviewLogs", "mistakes", "outbox", "meta"], "readwrite");
  try {
    const current = await tx.objectStore("cards").get(identity.id);
    const deleted = await tx.objectStore("meta").get(tombstoneKey("cards", identity.id)) ||
      await tx.objectStore("meta").get(wireTombstoneKey("cards", syncWireIdValue(userId, identity.id)));
    if (deleted) throw new Error("This card was deleted.");
    if (!current) throw new Error("This card is no longer available.");
    if (current.userId !== userId) throw new Error("Cannot review a card from another account.");
    const lastReview = current.lastReviewedAt ? new Date(current.lastReviewedAt) : null;
    const reviewedAt = lastReview && now < lastReview ? lastReview : now;
    const updated = gradeCard(current, grade, reviewedAt, { deviceId: device.deviceId, lamport });
    const log: ReviewLog = { id: crypto.randomUUID(), userId, cardId: current.id, topicId: current.topicId,
      grade, confidence, elapsedMs, reviewedAt: reviewedAt.toISOString() };
    const mistakes = (await tx.objectStore("mistakes").index("byUser").getAll(userId)).flatMap((mistake) => {
      const next = deferRepairAfterRetrieval(mistake, updated, log);
      return next === mistake ? [] : [next];
    });
    for (const mistake of mistakes) {
      if (await tx.objectStore("meta").get(tombstoneKey("mistakes", mistake.id)) ||
        await tx.objectStore("meta").get(wireTombstoneKey("mistakes", syncWireIdValue(userId, mistake.id)))) {
        throw new Error("This mistake was deleted.");
      }
      await tx.objectStore("mistakes").put(mistake);
    }
    await tx.objectStore("cards").put(updated);
    await tx.objectStore("reviewLogs").put(log);
    if (isSupabaseConfigured) {
      const writes = [["cards", updated], ["reviewLogs", log], ...mistakes.map((mistake) => ["mistakes", mistake] as const)] as const;
      for (const [entity, payload] of writes) {
        const item: OutboxItem = { id: crypto.randomUUID(), entity, op: "upsert", payload,
          ownerId: userId, queuedAt: now.toISOString(), attempts: 0,
          idempotencyKey: crypto.randomUUID(), lamport, deviceId: device.deviceId };
        await tx.objectStore("outbox").put(item);
      }
    }
    await tx.done;
    if (isSupabaseConfigured && typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
    return { card: updated, log, mistakes };
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted by IndexedDB. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
