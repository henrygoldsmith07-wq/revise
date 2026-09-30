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
  | "learnerRecords"
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
   * UUID per logical mutation for the best-effort delivery ledger.
   * Stable row keys and replay-safe merges make entity retries idempotent.
   */
  idempotencyKey?: string;
  /** Logical timestamp captured when the item was queued, for causal ordering. */
  lamport?: number;
  /** Minting device id — pairs with lamport for causal ordering diagnostics. */
  deviceId?: string;
}
