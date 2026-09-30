import type { SyncEntity } from "./types-sync";

export const DELETABLE_ENTITIES = ["cards", "reviewLogs", "questions", "attempts", "mistakes", "papers", "plannedSessions", "examDates"] as const;
export type DeletableEntity = typeof DELETABLE_ENTITIES[number];
export interface SyncTombstone { id: string; entity: DeletableEntity; userId: string; wireOnly?: boolean }
export const tombstoneKey = (entity: string, id: string) => `revise.deleted.v1:${entity}:${encodeURIComponent(id)}`;
export const wireTombstoneKey = (entity: string, id: string) => `revise.deletedWire.v1:${entity}:${id}`;
export function validateTombstone(value: unknown, owner: string): SyncTombstone {
  const row = value as Partial<SyncTombstone> | null;
  if (!row || typeof row.id !== "string" || !row.id || row.userId !== owner || !DELETABLE_ENTITIES.includes(row.entity as DeletableEntity)) throw new Error("Invalid or mixed-owner tombstone.");
  if (row.wireOnly !== undefined && row.wireOnly !== true) throw new Error("Invalid tombstone format.");
  return row as SyncTombstone;
}
export function isDeletableEntity(entity: SyncEntity): entity is DeletableEntity { return (DELETABLE_ENTITIES as readonly string[]).includes(entity); }
