import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDb, putOne } from "@/data/db";
import { saveCardReview } from "@/data/card-review";
import { createCard } from "@/domain/scheduling";
import { mergeCard } from "@/domain/sync-crdt";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import { syncWireIdValue } from "@/data/sync-contract";
import type { Card, Mistake } from "@/domain/types";
vi.mock("@/data/supabase", () => ({ isSupabaseConfigured: true }));
const USER = "local";
const START = new Date("2026-10-01T09:00:00Z");
let original: Card;
beforeEach(async () => {
  await clearAll();
  original = createCard({ id: "held-card", userId: USER, subjectId: "s", topicId: "t", front: "Q", back: "A" }, START);
  await putOne("cards", original);
});

describe("saved-state card reviews", () => {
  it("keeps Again → Good history when the UI supplies its held original card twice", async () => {
    const first = await saveCardReview(original, USER, "again", 1000, 2, START);
    const second = await saveCardReview(original, USER, "good", 2000, 3, new Date(START.getTime() + 60_000));
    const saved = await (await getDb()).get("cards", original.id);
    expect(saved?.reps).toBe(2);
    expect(saved?.log?.map((event) => event.grade)).toEqual(["again", "good"]);
    expect(saved?.log?.[0]?.base).toEqual(first.card.log?.[0]?.base);
    expect(mergeCard(second.card, first.card)).toEqual(second.card);
    expect(await (await getDb()).count("reviewLogs")).toBe(2);
    expect(await (await getDb()).count("outbox")).toBe(4);
  });
  it("uses the saved content and topic rather than fields on a stale identity", async () => {
    await putOne("cards", { ...original, front: "Edited prompt", topicId: "edited-topic" });
    const stale = { ...original, topicId: "stale-topic" };
    const result = await saveCardReview(stale, USER, "good", 1000, undefined, START);
    expect(result.card.front).toBe("Edited prompt");
    expect(result.log.topicId).toBe("edited-topic");
  });
  it("defers current repair retention evidence in the same successful review transaction", async () => {
    const mistake: Mistake = { id: "mistake", userId: USER, subjectId: "s", topicId: "t", marksLost: 1,
      description: "Missed point", category: "recall", cardId: original.id, resolved: false,
      createdAt: START.toISOString(), repair: { version: 1, stage: "transfer", evidence: [] } };
    await putOne("mistakes", mistake);
    const result = await saveCardReview(original, USER, "again", 1000, undefined, START);
    expect(result.mistakes).toHaveLength(1);
    expect(result.mistakes[0].repair?.dueAt).toBe("2026-10-08T09:00:00.000Z");
    expect(result.mistakes[0].resolved).toBe(false);
    expect(await (await getDb()).get("mistakes", mistake.id)).toEqual(result.mistakes[0]);
    expect((await (await getDb()).getAll("outbox")).map((item) => item.entity).sort()).toEqual(["cards", "mistakes", "reviewLogs"]);
  });
  it("serializes overlapping saved-state updates without discarding either CRDT event", async () => {
    await Promise.all([saveCardReview(original, USER, "again", 1000, undefined, START), saveCardReview(original, USER, "good", 1000, undefined, START)]);
    const saved = await (await getDb()).get("cards", original.id);
    expect(saved?.reps).toBe(2);
    expect(saved?.log?.map((event) => event.grade)).toEqual(["again", "good"]);
    expect(new Set(saved?.log?.map((event) => event.lamport)).size).toBe(2);
  });
  it("rejects another account's card without changing evidence or outbox", async () => {
    await putOne("cards", { ...original, userId: "other" });
    await expect(saveCardReview(original, USER, "good", 1000)).rejects.toThrow(/account|owner/);
    expect(await (await getDb()).count("reviewLogs")).toBe(0);
    expect(await (await getDb()).count("outbox")).toBe(0);
  });
  it("does not revive a missing card", async () => {
    await (await getDb()).delete("cards", original.id);
    await expect(saveCardReview(original, USER, "good", 1000)).rejects.toThrow(/available|deleted/);
    expect(await (await getDb()).get("cards", original.id)).toBeUndefined();
  });
  it.each(["local", "wire"])("preserves %s deletion suppression", async (kind) => {
    const key = kind === "local" ? tombstoneKey("cards", original.id) : wireTombstoneKey("cards", syncWireIdValue(USER, original.id));
    await (await getDb()).put("meta", { key, value: true });
    await expect(saveCardReview(original, USER, "good", 1000)).rejects.toThrow(/deleted/);
    expect(await (await getDb()).count("reviewLogs")).toBe(0);
    expect(await (await getDb()).count("outbox")).toBe(0);
  });
  it("rolls back the grade as well as evidence when the local log write fails", async () => {
    // IndexedDB cannot clone functions: fail at the review-log write after the card put.
    await expect(saveCardReview(original, USER, "good", 1000, (() => 1) as never, START)).rejects.toThrow();
    expect(await (await getDb()).get("cards", original.id)).toEqual(original);
    expect(await (await getDb()).count("reviewLogs")).toBe(0);
    expect(await (await getDb()).count("outbox")).toBe(0);
  });
});
