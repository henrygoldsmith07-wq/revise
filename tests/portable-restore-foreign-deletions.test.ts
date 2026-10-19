import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDb } from "@/data/db";
import { buildPortabilitySnapshot } from "@/domain/portability";
import { restorePortableSnapshot } from "@/data/portable-restore";
import { tombstoneKey } from "@/domain/sync-tombstone";
import { createCard } from "@/domain/scheduling";
import type { OutboxItem } from "@/domain/types";

// Restoring someone else's export used to write its deletion markers under
// the current account and queue server deletes for them. Curriculum/seed card
// ids are not remapped (they are not UUIDs), so the current account's own
// copies of those cards were deleted on every device, silently.

vi.mock("@/data/supabase", () => ({ isSupabaseConfigured: true, getSupabase: () => null }));

const SOURCE = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const SEED_CARD = "wjec-alevel-physics.capacitance.seed-card-1";

beforeEach(async () => {
  await clearAll();
});

function snapshotFrom(owner: string) {
  const card = createCard({ id: crypto.randomUUID(), userId: owner, subjectId: "s", topicId: "t", front: "Q", back: "A" });
  return buildPortabilitySnapshot({
    userId: owner, cards: [card], attempts: [], reviewLogs: [], mistakes: [], plannedSessions: [], examDates: [],
    deletions: [{ id: SEED_CARD, entity: "cards", userId: owner }],
  });
}

describe("restoring another account's export", () => {
  it("drops the file's deletion markers instead of deleting the current account's cards, and says so", async () => {
    const db = await getDb();
    const own = createCard({ id: SEED_CARD, userId: TARGET, subjectId: "s", topicId: "t", front: "Q", back: "A" });
    await db.put("cards", own);

    const result = await restorePortableSnapshot(snapshotFrom(SOURCE), TARGET);

    expect(result.droppedDeletions).toBe(1);
    expect(await db.get("meta", tombstoneKey("cards", SEED_CARD))).toBeUndefined();
    const deletes = ((await db.getAll("outbox")) as OutboxItem[]).filter((item) => item.op === "delete");
    expect(deletes).toHaveLength(0);
  });

  it("keeps deletion markers when the file belongs to the current account", async () => {
    const result = await restorePortableSnapshot(snapshotFrom(TARGET), TARGET);
    expect(result.droppedDeletions).toBe(0);
    expect(await (await getDb()).get("meta", tombstoneKey("cards", SEED_CARD))).toBeDefined();
    const deletes = ((await (await getDb()).getAll("outbox")) as OutboxItem[]).filter((item) => item.op === "delete");
    expect(deletes).toHaveLength(1);
  });
});
