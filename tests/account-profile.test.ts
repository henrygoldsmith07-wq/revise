import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSettings } from "@/data/repository";
import { createCard } from "@/domain/scheduling";

const A = "11111111-1111-4111-8111-111111111111";
const outcome = { userId: "local", id: "outcome", subjectId: "wjec-alevel-physics", topicId: "energy", capabilityId: "energy", kind: "independent", priorState: "unknown", plannedMinutes: 2, actualMinutes: 2, support: "none", immediate: { awarded: 1, max: 2, independent: true, attemptId: "fixture-attempt", at: "2026-09-01T00:00:00.000Z" }, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const B = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { vi.resetModules(); globalThis.indexedDB = new IDBFactory(); });

async function fixture() {
  const db = await import("@/data/db");
  const profiles = await import("@/data/account-profile");
  const local = await db.getProfileDb("local");
  const card = createCard({ id: "cnt:card:physics:test", userId: "local", subjectId: "wjec-alevel-physics", topicId: "wjec-alevel-physics.energy-power", front: "Work?", back: "Fs" });
  await local.put("cards", card);
  await local.put("settings", { ...defaultSettings("local"), displayName: "Local learner" });
  await local.put("meta", { key: "revise.revisionCheckpoint.v1", value: { local: { userId: "local", session: "resume" } } });
  await local.put("meta", { key: "revise.experimentAssignment.v1::user:local", value: { arm: "a", anonId: "anonymous" } });
  await local.put("meta", { key: "revise.interventionOutcomes.v1", value: [outcome] });
  await local.put("outbox", { id: "offline-write", ownerId: "local", entity: "cards", op: "upsert", payload: card, queuedAt: new Date().toISOString(), attempts: 0 });
  return { db, profiles, local, card };
}

function replica(account: () => string | null, tables: Record<string, Record<string, unknown>[]>, malicious = false): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: account() ? { id: account() } : null } }) },
    from: (table: string) => {
      let owner = "";
      let cursor = 0;
      const query = {
        select: () => query, order: () => query, or: () => query,
        gt: (_column: string, value: number) => { cursor = value; return query; },
        eq: (_column: string, value: string) => { owner = value; return query; },
        range: async () => ({ data: (tables[table] ?? []).filter((row) => (malicious || row.user_id === owner) && (table !== "learner_records" || Number(row.change_seq) > cursor)), error: null }),
        upsert: async (input: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(input) ? input : [input];
          tables[table] = table === "learner_records" ? rows.map((row, i) => ({ ...row, change_seq: i + 1 })) : rows;
          return { data: rows, error: null };
        },
        delete: () => query, in: async () => ({ error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("canonical account profile boundary", () => {
  it("opens fresh local-only storage and rejects non-account identities", async () => {
    const { canonicalProfile, needsProfileChoice } = await import("@/data/account-profile");
    expect(canonicalProfile(null)).toBe("local");
    expect(canonicalProfile(A)).toBe(A);
    expect(() => canonicalProfile("local")).toThrow("Invalid account");
    expect(await needsProfileChoice(A)).toBe(false);
  });

  it("explicitly adopts rows, metadata and offline queue without destroying the local copy", async () => {
    const { db, profiles, local } = await fixture();
    expect(profiles.adoptOwner({ userId: "local", answers: { local: "Independent answer" } }, A))
      .toEqual({ userId: A, answers: { local: "Independent answer" } });
    expect(await profiles.needsProfileChoice(A)).toBe(true);
    await profiles.initializeAccountProfile(A, true);
    const account = await db.getProfileDb(A);
    expect((await account.getAll("cards"))[0].userId).toBe(A);
    expect((await account.get("settings", A))?.displayName).toBe("Local learner");
    expect((await account.get("meta", "revise.revisionCheckpoint.v1"))?.value).toEqual({ [A]: { userId: A, session: "resume" } });
    expect((await account.get("meta", "revise.interventionOutcomes.v1"))?.value).toEqual([{ ...outcome, userId: A }]);
    expect(await account.get("meta", `revise.experimentAssignment.v1::user:${A}`)).toBeTruthy();
    expect((await account.getAll("outbox")).every((item) => item.ownerId === A)).toBe(true);
    expect((await local.getAll("cards"))[0].userId).toBe("local");
    expect(await profiles.needsProfileChoice(B)).toBe(false);
    await expect(profiles.initializeAccountProfile(B, true)).rejects.toThrow("cannot adopt");
    await profiles.initializeAccountProfile(B, false);
    expect(await (await db.getProfileDb(B)).getAll("cards")).toEqual([]);
    await profiles.initializeAccountProfile(A, true);
    expect(await account.getAll("cards")).toHaveLength(1);
  });

  it("commits adoption only once when two tabs sign into the same account", async () => {
    const { db, profiles } = await fixture();
    await Promise.all([profiles.initializeAccountProfile(A, true), profiles.initializeAccountProfile(A, true)]);
    const account = await db.getProfileDb(A);
    expect(await account.count("cards")).toBe(1);
    // Original offline mutation + one complete card/settings copy.
    expect(await account.count("outbox")).toBe(3);
  });

  it("never overwrites an existing account and rejects mixed-owner adoption atomically", async () => {
    const { db, profiles, local, card } = await fixture();
    await local.put("cards", { ...card, id: "foreign", userId: B });
    await expect(profiles.initializeAccountProfile(A, true)).rejects.toThrow("Mixed-owner");
    const target = await db.getProfileDb(A);
    expect(await target.getAll("cards")).toEqual([]);
    await target.put("cards", { ...card, userId: A });
    await expect(profiles.initializeAccountProfile(A, true)).rejects.toThrow("cannot adopt");
  });

  it("rejects unknown mutation owners and foreign scoped metadata before any copy", async () => {
    const { db, profiles, local } = await fixture();
    await local.put("outbox", { id: "unknown", entity: "cards", op: "delete", payload: { id: "ambiguous" }, queuedAt: new Date().toISOString(), attempts: 0 });
    await expect(profiles.initializeAccountProfile(A, true)).rejects.toThrow("Unknown-owner");
    await local.delete("outbox", "unknown");
    await local.put("meta", { key: `revise.experimentAssignment.v1::user:${B}`, value: { arm: "foreign" } });
    await expect(profiles.initializeAccountProfile(A, true)).rejects.toThrow("Mixed-owner local metadata");
    expect(await (await db.getProfileDb(A)).count("outbox")).toBe(0);
  });

  it("pins asynchronous writes to the old database across auth changes", async () => {
    const { db, card } = await fixture();
    db.bindDatabaseProfile("local");
    const original = await db.getDb();
    expect(() => db.bindDatabaseProfile(A)).toThrow("fresh application boundary");
    await original.put("cards", { ...card, front: "Queued while offline" });
    expect((await db.getDb()).name).toBe("revise");
    expect(await (await db.getProfileDb(A)).getAll("cards")).toEqual([]);
  });

  it("syncs device A, restores device B, and preserves queues across sign-out and switching", async () => {
    const { db, profiles } = await fixture();
    await profiles.initializeAccountProfile(A, true);
    db.bindDatabaseProfile(A);
    let auth: string | null = A;
    const tables: Record<string, Record<string, unknown>[]> = {};
    const client = replica(() => auth, tables);
    const { sync } = await import("@/data/sync");
    const pushed = await sync(A, { client, online: true });
    expect(pushed.failed).toBe(0);
    expect(pushed.pushed).toBeGreaterThan(0);
    expect(String(tables.cards[0].id)).toMatch(/^[0-9a-f-]{36}$/);
    expect((tables.cards[0].data as { id: string }).id).toBe("cnt:card:physics:test");
    const account = await db.getDb();
    await account.put("outbox", { id: "later", ownerId: A, entity: "cards", op: "upsert", payload: (await account.getAll("cards"))[0], attempts: 0, queuedAt: new Date().toISOString() });
    auth = null;
    expect((await sync(A, { client, online: true })).skipped).toBe("signed-out");
    auth = B;
    expect((await sync(A, { client, online: true })).skipped).toBe("account-mismatch");
    expect(await account.count("outbox")).toBe(1);
    auth = A;
    expect((await sync(A, { client, online: true })).failed).toBe(0);
    expect(await account.count("outbox")).toBe(0);
    // A genuinely independent IndexedDB factory models another device.
    globalThis.indexedDB = new IDBFactory();
    db.resetDbConnection();
    const deviceB = await db.getDb();
    expect(await deviceB.count("cards")).toBe(0);
    const pulled = await sync(A, { client, online: true });
    expect(pulled.failed).toBe(0);
    expect(pulled.pulled).toBeGreaterThan(0);
    expect((await deviceB.getAll("cards"))[0].userId).toBe(A);
    expect((await deviceB.get("settings", A))?.displayName).toBe("Local learner");
  });

  it("rejects foreign remote rows and contradictory payload ownership", async () => {
    const { db, profiles, card } = await fixture();
    await profiles.initializeAccountProfile(A, false);
    db.bindDatabaseProfile(A);
    const { sync } = await import("@/data/sync");
    const tables = { cards: [{ id: crypto.randomUUID(), user_id: B, updated_at: new Date().toISOString(), data: { ...card, userId: B } }] };
    expect((await sync(A, { client: replica(() => A, tables, true), online: true })).failed).toBe(1);
    tables.cards[0].user_id = A;
    expect((await sync(A, { client: replica(() => A, tables), online: true })).failed).toBe(1);
    expect(await (await db.getDb()).count("cards")).toBe(0);
  });
});
