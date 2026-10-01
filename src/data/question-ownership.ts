import type { OutboxItem } from "@/domain/types";
import { activeDatabaseProfile, getDb } from "./db";

/** Shared curriculum has no account owner. Private questions belong to the
 * pinned profile; this proof must not be extended to other ownerless entities. */
export function isPrivateQuestion(value: unknown): value is { id: string; origin: "ai" | "past-paper"; userId?: string } {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0 && (row.origin === "ai" || row.origin === "past-paper");
}

export async function repairQuestionOutboxOwners(userId: string): Promise<void> {
  if (activeDatabaseProfile() !== userId) return;
  const tx = (await getDb()).transaction(["questions", "outbox"], "readwrite");
  try {
    for (const item of await tx.objectStore("outbox").getAll()) {
      if (item.ownerId || item.entity !== "questions" || item.op !== "upsert" || !isPrivateQuestion(item.payload)) continue;
      const payload = item.payload;
      const question = await tx.objectStore("questions").get(payload.id);
      if (!isPrivateQuestion(question) || (payload.userId !== undefined && payload.userId !== userId) ||
          (question.userId !== undefined && question.userId !== userId)) continue;
      await tx.objectStore("outbox").put({ ...item, ownerId: userId } satisfies OutboxItem);
    }
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch {}
    await tx.done.catch(() => undefined);
    throw error;
  }
}
