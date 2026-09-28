// Sync entities and the offline outbox.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoInstant } from "./types-base";

// --- sync ------------------------------------------------------------------

export type SyncEntity =
  | "cards"
  | "reviewLogs"
  | "attempts"
  | "mistakes"
  | "questions"
  | "papers"
  | "plannedSessions"
  | "examDates"
  | "settings"
  | "streak"
  | "lessonProgress";

export interface OutboxItem {
  id: Id;
  entity: SyncEntity;
  op: "upsert" | "delete";
  payload: unknown;
  /** Account that created this queue entry; missing means a legacy row. */
  ownerId?: Id;
  queuedAt: IsoInstant;
  attempts: number;
  lastError?: string;
  /**
   * UUID idempotency key, minted once per logical mutation. The server
   * records it in `sync_writes` and rejects a duplicate, so a hung request
   * retried by the browser or service worker can never double-count a
   * review or double-award accuracy metrics.
   */
  idempotencyKey?: string;
  /** Logical timestamp captured when the item was queued, for causal ordering. */
  lamport?: number;
  /** Minting device id — pairs with lamport for causal ordering diagnostics. */
  deviceId?: string;
}
