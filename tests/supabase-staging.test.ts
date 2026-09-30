import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb, resetDbConnection } from "@/data/db";
import { sync } from "@/data/sync";
import { SYNC_TABLES, syncWireId } from "@/data/sync-contract";
import { createCard } from "@/domain/scheduling";

const keys = ["REVISE_STAGING_SUPABASE_URL", "REVISE_STAGING_SUPABASE_ANON_KEY", "REVISE_STAGING_USER_A_EMAIL", "REVISE_STAGING_USER_A_PASSWORD", "REVISE_STAGING_USER_B_EMAIL", "REVISE_STAGING_USER_B_PASSWORD"] as const;
const configured = keys.every((key) => Boolean(process.env[key]));
if (!configured && process.env.REVISE_STAGING_REQUIRED === "1") throw new Error(`[infrastructure] Missing staging secrets: ${keys.filter((key) => !process.env[key]).join(", ")}`);
const suite = configured ? describe : describe.skip;
const TABLES = [...Object.values(SYNC_TABLES), "sync_writes"];
const singletons = new Set(["user_settings", "streaks", "lesson_progress"]);
const stamp = new Date(Date.now() - 60 * 60_000).toISOString();
const newer = new Date(Date.parse(stamp) + 10_000).toISOString();

suite("live staging contract", () => {
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let duplicateA: SupabaseClient;
  let aId = "";
  let bId = "";
  const fixtures = new Map<string, string>();
  const created: { client: SupabaseClient; table: string; column: string; id: string }[] = [];
  function row(table: string, owner: string, id: string, updatedAt = stamp, front = "fixture"): Record<string, unknown> {
    return table === "sync_writes" ? { id, user_id: owner }
      : { id, user_id: owner, data: { id, userId: owner, front, updatedAt }, updated_at: updatedAt };
  }

  beforeAll(async () => {
    const makeClient = () => createClient(process.env.REVISE_STAGING_SUPABASE_URL!, process.env.REVISE_STAGING_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    userA = makeClient(); userB = makeClient(); duplicateA = makeClient();
    const results = await Promise.all([
      userA.auth.signInWithPassword({ email: process.env.REVISE_STAGING_USER_A_EMAIL!, password: process.env.REVISE_STAGING_USER_A_PASSWORD! }),
      userB.auth.signInWithPassword({ email: process.env.REVISE_STAGING_USER_B_EMAIL!, password: process.env.REVISE_STAGING_USER_B_PASSWORD! }),
      duplicateA.auth.signInWithPassword({ email: process.env.REVISE_STAGING_USER_A_EMAIL!, password: process.env.REVISE_STAGING_USER_A_PASSWORD! }),
    ]);
    for (const [index, result] of results.entries()) expect(result.error, `[authentication] staging client ${index + 1}`).toBeNull();
    aId = results[0].data.user?.id ?? "";
    bId = results[1].data.user?.id ?? "";
    expect(aId, "[authentication] user A UUID").toMatch(/^[0-9a-f-]{36}$/i);
    expect(bId, "[authentication] user B UUID").toMatch(/^[0-9a-f-]{36}$/i);
    expect(aId, "[infrastructure] independent test users required").not.toBe(bId);
    expect(results[2].data.user?.id, "[authentication] duplicate device A").toBe(aId);
    for (const table of singletons) {
      for (const client of [userA, userB]) {
        const existing = await client.from(table).select("user_id");
        expect(existing.error, `[schema-drift] ${table}`).toBeNull();
        expect(existing.data, `[infrastructure] use dedicated empty test accounts (${table})`).toEqual([]);
      }
    }
  }, 60_000);

  afterAll(async () => {
    const errors: string[] = [];
    for (const fixture of created) {
      const result = await fixture.client.from(fixture.table).delete().eq(fixture.column, fixture.id);
      if (result.error) errors.push(`${fixture.table}: cleanup failed`);
    }
    await Promise.all([userA, userB, duplicateA].filter(Boolean).map((client) => client.auth.signOut()));
    expect(errors, "[infrastructure] fixture cleanup").toEqual([]);
  }, 60_000);

  for (const table of TABLES) {
    it(`[RLS] ${table}: isolates read, insert, update, ownership rewrite and delete`, async () => {
      const id = crypto.randomUUID(); fixtures.set(table, id);
      const key = singletons.has(table) ? "user_id" : "id";
      created.push({ client: userA, table, column: key, id: key === "id" ? id : aId });
      const own = await userA.from(table).insert(row(table, aId, id));
      expect(own.error, `[schema-drift] ${table} own insert`).toBeNull();
      const bRow = crypto.randomUUID();
      created.push({ client: userB, table, column: key, id: key === "id" ? bRow : bId });
      expect((await userB.from(table).insert(row(table, bId, bRow))).error, `[RLS] ${table} B own insert`).toBeNull();
      const target = key === "id" ? id : aId;
      const hidden = await userB.from(table).select("*").eq(key, target);
      expect(hidden.error, `[RLS] ${table} read query`).toBeNull();
      expect(hidden.data, `[RLS] ${table} cross read`).toEqual([]);
      const badInsertId = crypto.randomUUID();
      created.push({ client: userA, table, column: key, id: key === "id" ? badInsertId : aId });
      const denied = await userB.from(table).insert(row(table, aId, badInsertId));
      expect(denied.error?.code, `[RLS] ${table} insert as A`).toBe("42501");
      const mutated = await userB.from(table).update(table === "sync_writes" ? { user_id: bId } : { data: { tampered: true }, updated_at: newer }).eq(key, target).select("*");
      expect(mutated.error, `[RLS] ${table} cross update query`).toBeNull();
      expect(mutated.data, `[RLS] ${table} cross update`).toEqual([]);
      const reowned = await userA.from(table).update({ user_id: bId, ...(table === "sync_writes" ? {} : { updated_at: newer }) }).eq(key, target);
      expect(reowned.error?.code, `[RLS] ${table} cannot rewrite ownership`).toBe("42501");
      const removed = await userB.from(table).delete().eq(key, target).select("*");
      expect(removed.error, `[RLS] ${table} delete query`).toBeNull();
      expect(removed.data, `[RLS] ${table} cross delete`).toEqual([]);
      expect((await userA.from(table).select("*").eq(key, target).single()).error, `[RLS] ${table} owner retains row`).toBeNull();
    }, 30_000);

    if (table !== "sync_writes") it(`[schema-drift] ${table}: preserves newer data, equal retries, and clamps device timestamps`, async () => {
      const id = fixtures.get(table)!;
      const key = singletons.has(table) ? "user_id" : "id";
      const target = key === "id" ? id : aId;
      expect((await userA.from(table).upsert(row(table, aId, id, newer, "newer"), { onConflict: key })).error).toBeNull();
      for (const timestamp of [stamp, newer]) {
        expect((await duplicateA.from(table).upsert(row(table, aId, id, timestamp, "stale"), { onConflict: key })).error).toBeNull();
        const saved = await userA.from(table).select("data").eq(key, target).single();
        expect(saved.error).toBeNull();
        expect(saved.data?.data.front, `[schema-drift] ${table} stale/equal overwrite`).toBe("newer");
      }
      const before = Date.now();
      const future = await userA.from(table).upsert(row(table, aId, id, "2099-01-01T00:00:00.000Z", "future"), { onConflict: key }).select("updated_at").single();
      expect(future.error).toBeNull();
      const clamped = Date.parse(future.data!.updated_at);
      expect(clamped, `[schema-drift] ${table} clamp lower bound`).toBeGreaterThanOrEqual(before + 5 * 60_000 - 30_000);
      expect(clamped, `[schema-drift] ${table} clamp upper bound`).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 30_000);
      // Exercise INSERT clamping independently from UPDATE.
      expect((await userA.from(table).delete().eq(key, target)).error).toBeNull();
      const insertBefore = Date.now();
      const inserted = await userA.from(table).insert(row(table, aId, id, "2099-01-01T00:00:00.000Z", "future insert")).select("updated_at").single();
      expect(inserted.error).toBeNull();
      expect(Date.parse(inserted.data!.updated_at)).toBeGreaterThanOrEqual(insertBefore + 5 * 60_000 - 30_000);
      expect(Date.parse(inserted.data!.updated_at)).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 30_000);
    }, 30_000);
  }

  it("[application-sync] syncs a namespaced card from independent device A to device B", async () => {
    await clearAll();
    const localId = "cnt:card:staging:" + crypto.randomUUID();
    const card = createCard({ id: localId, userId: aId, subjectId: "staging", topicId: "staging", front: "device A", back: "replica" });
    const db = await getDb();
    await db.put("cards", card);
    await db.put("outbox", { id: crypto.randomUUID(), entity: "cards", op: "upsert", ownerId: aId, payload: card, queuedAt: new Date().toISOString(), attempts: 0 });
    const wireId = await syncWireId(aId, localId);
    created.push({ client: userA, table: "cards", column: "id", id: wireId });
    const push = await sync(aId, { client: userA, online: true });
    expect(push.failed, "[application-sync] push and first pull").toBe(0);
    expect(push.pushed).toBe(1);
    globalThis.indexedDB = new IDBFactory(); resetDbConnection();
    const pull = await sync(aId, { client: duplicateA, online: true });
    expect(pull.failed, "[application-sync] independent-device pull").toBe(0);
    expect((await (await getDb()).get("cards", localId))?.front).toBe("device A");
    expect((await sync(bId, { client: duplicateA, online: true })).skipped).toBe("account-mismatch");
  }, 60_000);

  it("[application-sync] keyset pages include every equal-timestamp row", async () => {
    const time = new Date(Date.now() - 30 * 60_000).toISOString();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].sort();
    for (const id of ids) created.push({ client: userA, table: "cards", column: "id", id });
    expect((await userA.from("cards").insert(ids.map((id) => row("cards", aId, id, time)))).error).toBeNull();
    let cursor = "00000000-0000-0000-0000-000000000000";
    const observed: string[] = [];
    for (let page = 0; page < ids.length; page++) {
      const result = await duplicateA.from("cards").select("id,updated_at").eq("user_id", aId).eq("updated_at", time)
        .or(`updated_at.gt.${time},and(updated_at.eq.${time},id.gt.${cursor})`).order("updated_at").order("id").range(0, 0);
      expect(result.error, "[application-sync] deployed keyset query").toBeNull();
      expect(result.data).toHaveLength(1);
      cursor = result.data![0].id; observed.push(cursor);
    }
    expect(observed).toEqual(ids);
  }, 30_000);
});
