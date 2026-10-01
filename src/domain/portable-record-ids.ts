import type { PortabilitySnapshot } from "./portability";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legacy UUID wire keys are global. A cross-account copy gets a stable,
 * non-UUID local key so the existing wire scheme namespaces it by owner.
 * Shared curriculum IDs and same-account restores retain their exact IDs. */
export function remapPortableRecordIds(snapshot: PortabilitySnapshot, targetUserId: string): PortabilitySnapshot {
  if (snapshot.userId === targetUserId) return snapshot;
  const ids = new Map<string, string>();
  const remember = (value: unknown) => {
    if (value && typeof value === "object" && "id" in value && typeof value.id === "string" && uuid.test(value.id)) {
      ids.set(value.id, `copy:${encodeURIComponent(snapshot.userId)}:${value.id}`);
    }
  };
  for (const values of [snapshot.cardRecords, snapshot.reviewLogs, snapshot.attempts, snapshot.mistakes,
    snapshot.papers, snapshot.plannedSessions, snapshot.examDates]) {
    if (Array.isArray(values)) values.forEach(remember);
  }
  for (const question of snapshot.questions ?? []) if (question.origin !== "seed") remember(question);
  for (const marker of snapshot.deletions ?? []) if (!marker.wireOnly) remember(marker);
  if (!ids.size) return snapshot;

  const rewrite = (value: unknown, field = ""): unknown => {
    if (typeof value === "string") {
      if (["userId", "ownerId", "anonId", "deviceId"].includes(field)) return value;
      return field === "id" || field.endsWith("Id") || field.endsWith("Ids") ? ids.get(value) ?? value : value;
    }
    if (Array.isArray(value)) return value.map(item => rewrite(item, field));
    if (!value || typeof value !== "object") return value;
    // Wire-only hashes belong to the source account, never the copied IDs.
    if ("wireOnly" in value && value.wireOnly === true) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewrite(entry, key)]));
  };
  return rewrite(snapshot) as PortabilitySnapshot;
}
