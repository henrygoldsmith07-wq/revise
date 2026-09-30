import { sha256Hex } from "@/domain/content-fingerprint";
import type { SyncEntity } from "@/domain/types";

export const SYNC_TABLES: Record<SyncEntity, string> = {
  learnerRecords: "learner_records",
  cards: "cards", reviewLogs: "review_logs", attempts: "attempts", mistakes: "mistakes",
  questions: "questions", papers: "papers", plannedSessions: "planned_sessions", examDates: "exam_dates",
  settings: "user_settings", streak: "streaks", lessonProgress: "lesson_progress",
};
export function syncPrimaryKey(entity: SyncEntity): "id" | "user_id" {
  return entity === "settings" || entity === "streak" || entity === "lessonProgress" ? "user_id" : "id";
}

/** Public curriculum ids stay exact in JSON data. Their wire key must be a
 * UUID and unique per account, because Postgres collection ids are global. */
export function syncWireIdValue(userId: string, localId: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) return localId;
  const digest = sha256Hex(JSON.stringify(["revise-sync-id-v1", userId, localId]));
  const hash = Uint8Array.from(digest.match(/../g)!, byte => parseInt(byte, 16));
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = [...hash.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function syncWireId(userId: string, localId: string): Promise<string> { return syncWireIdValue(userId, localId); }
