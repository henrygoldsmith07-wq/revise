import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb, putMissing, wireTombstoneCheck } from "@/data/db";
import { syncWireIdValue } from "@/data/sync-contract";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import { seedCards } from "@/content";
import { allTopics } from "@/domain/curriculum";
import type { Card } from "@/domain/types";

// Fresh-profile boot: the content bank (~4.6k rows) installs through
// putMissing, one transaction that reads existing ids and tombstone keys
// itself, instead of putAll's two meta reads per row. These pin the
// integrity rules that putAll used to enforce row by row.

const USER = "seed-boot-user";
const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

beforeEach(async () => {
  await clearAll();
});

function someCards(n = 3): Card[] {
  return seedCards(allTopics(), USER).slice(0, n);
}

describe("putMissing (seed install)", () => {
  it("installs every row on an empty store and reports how many it wrote", async () => {
    const cards = someCards(5);
    expect(await putMissing("cards", cards, USER)).toBe(5);
    const db = await getDb();
    expect((await db.getAllKeys("cards")).map(String).sort()).toEqual(cards.map((c) => c.id).sort());
  });

  it("never overwrites a row that already exists (FSRS history survives a top-up)", async () => {
    const [first, ...rest] = someCards(3);
    const db = await getDb();
    await db.put("cards", { ...first!, reps: 7, due: "2031-01-01" } as never);
    expect(await putMissing("cards", [first!, ...rest], USER)).toBe(2);
    const kept = (await db.get("cards", first!.id)) as Card;
    expect(kept.reps).toBe(7);
    expect(kept.due).toBe("2031-01-01");
  });

  it("skips ids with a local tombstone or a wire tombstone instead of resurrecting them", async () => {
    const [a, b, c] = someCards(3);
    const db = await getDb();
    await db.put("meta", { key: tombstoneKey("cards", a!.id), value: true } as never);
    await db.put("meta", { key: wireTombstoneKey("cards", syncWireIdValue(USER, b!.id)), value: true } as never);
    expect(await putMissing("cards", [a!, b!, c!], USER)).toBe(1);
    expect((await db.getAllKeys("cards")).map(String)).toEqual([c!.id]);
  });

  it("is a no-op on the second run", async () => {
    const cards = someCards(4);
    await putMissing("cards", cards, USER);
    expect(await putMissing("cards", cards, USER)).toBe(0);
  });
});

describe("putMissing in chunks (nineteenth pass)", () => {
  it("installs every row across chunks and keeps every integrity rule in each chunk", async () => {
    const cards = someCards(7);
    const db = await getDb();
    await db.put("cards", { ...cards[3]!, reps: 9 } as never);
    await db.put("meta", { key: tombstoneKey("cards", cards[1]!.id), value: true } as never);
    await db.put("meta", { key: wireTombstoneKey("cards", syncWireIdValue(USER, cards[5]!.id)), value: true } as never);
    // Chunks of two: the existing row, the local and the wire tombstone sit in different chunks.
    expect(await putMissing("cards", cards, USER, 2)).toBe(4);
    const keys = (await db.getAllKeys("cards")).map(String).sort();
    expect(keys).toEqual([cards[0]!, cards[2]!, cards[3]!, cards[4]!, cards[6]!].map((c) => c.id).sort());
    expect(((await db.get("cards", cards[3]!.id)) as Card).reps).toBe(9);
    expect(await putMissing("cards", cards, USER, 2)).toBe(0);
  });

  it("the full seed set installs in the default chunks exactly as one transaction did", async () => {
    const cards = seedCards(allTopics(), USER);
    expect(await putMissing("cards", cards, USER)).toBe(cards.length);
    const db = await getDb();
    expect(await db.count("cards")).toBe(cards.length);
  }, 60_000);
});

describe("wireTombstoneCheck", () => {
  const id = "cnt:card:example";
  it("matches exactly the ids whose wire tombstone is present, for that store only", () => {
    const deleted = new Set([tombstoneKey("cards", "other"), wireTombstoneKey("questions", syncWireIdValue(USER, id))]);
    expect(wireTombstoneCheck("cards", deleted, USER)(id)).toBe(false);
    expect(wireTombstoneCheck("questions", deleted, USER)(id)).toBe(true);
    expect(wireTombstoneCheck("questions", deleted, USER)("cnt:card:another")).toBe(false);
    // Owner matters: the wire id is per user.
    expect(wireTombstoneCheck("questions", deleted, "someone-else")(id)).toBe(false);
  });

  it("answers no for every id when the store has no wire tombstones", () => {
    const check = wireTombstoneCheck("cards", new Set([tombstoneKey("cards", id)]), USER);
    expect(check(id)).toBe(false);
  });
});

describe("fresh profile sees onboarding before the bank is installed", () => {
  const store = src("src/state/store.tsx");
  const onboarding = src("src/components/Onboarding.tsx");

  it("StoreProvider renders the onboarding flow for a never-onboarded profile while the snapshot loads", () => {
    expect(store).toContain("repo\n      .hasOnboarded(userId)");
    expect(store).toContain("if (freshProfile && (!value || value.needsOnboarding))");
    // Before the store is ready the flow gets no actions, so nothing can be saved early.
    expect(store).toMatch(/actions=\{\s*value\s*\?/);
    // Returning students still wait for the full snapshot.
    expect(store).toContain("if (!value) return <BootScreen />;");
  });

  it("a final click before the store is ready is held, not dropped or run against an empty store", () => {
    expect(onboarding).toContain("if (actions) void finish(actions);");
    expect(onboarding).toContain("else setFinishQueued(true);");
    expect(onboarding).toContain("if (!finishQueued || !actions) return;");
    expect(onboarding).toContain("Finishing setting up your subjects…");
  });

  it("ensureSeeded installs cards through putMissing, and the legacy-id check reads keys, not rows", () => {
    const repo = src("src/data/repository.ts");
    expect(repo).toContain("const seeded = seedCards(allTopics(), userId);");
    expect(repo).toContain('await putMissing("cards", seeded, userId);');
    // Authored questions are served from the bundle (tests/authored-questions.test.ts).
    expect(repo).not.toContain('putMissing("questions"');
    expect(src("src/data/content-ids.ts")).toContain('db.getAllKeys("questions"), db.getAllKeys("cards")');
  });
});
