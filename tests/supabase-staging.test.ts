import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const env = {
  url: process.env.REVISE_STAGING_SUPABASE_URL,
  anonKey: process.env.REVISE_STAGING_SUPABASE_ANON_KEY,
  aEmail: process.env.REVISE_STAGING_USER_A_EMAIL,
  aPassword: process.env.REVISE_STAGING_USER_A_PASSWORD,
  bEmail: process.env.REVISE_STAGING_USER_B_EMAIL,
  bPassword: process.env.REVISE_STAGING_USER_B_PASSWORD,
};
const configured = Object.values(env).every(Boolean);
if (!configured && process.env.REVISE_STAGING_REQUIRED === "1") {
  throw new Error("Staging RLS tests require REVISE_STAGING_SUPABASE_* and both test-user credentials.");
}

const suite = configured ? describe : describe.skip;
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

suite("staging Supabase RLS and conflict contract", () => {
  // Vitest still evaluates a skipped suite's callback while collecting tests;
  // keep construction lazy so a normal local `npm test` does not require
  // staging secrets or attempt a network client with an undefined URL.
  const userA = configured
    ? createClient(env.url!, env.anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const userB = configured
    ? createClient(env.url!, env.anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  let userAId = "";

  beforeAll(async () => {
    if (!userA || !userB) return;
    const a = await userA.auth.signInWithPassword({ email: env.aEmail!, password: env.aPassword! });
    const b = await userB.auth.signInWithPassword({ email: env.bEmail!, password: env.bPassword! });
    expect(a.error, "staging user A sign-in").toBeNull();
    expect(b.error, "staging user B sign-in").toBeNull();
    userAId = a.data.user?.id ?? "";
    expect(userAId, "staging user A id").toMatch(/^[0-9a-f-]{36}$/i);
  });

  afterAll(async () => {
    if (!userA || !userB) return;
    await userA.from("cards").delete().eq("id", id);
    await userA.auth.signOut();
    await userB.auth.signOut();
  });

  it("enforces row ownership with RLS enabled", async () => {
    if (!userA || !userB) return;
    const first = await userA.from("cards").upsert({
      id,
      user_id: userAId,
      subject_id: "staging",
      topic_id: "staging",
      due: "2026-09-04",
      data: { id, userId: userAId, front: "rls fixture", updatedAt: "2026-09-04T10:00:00.000Z" },
      updated_at: "2026-09-04T10:00:00.000Z",
    });
    expect(first.error).toBeNull();

    const hidden = await userB.from("cards").select("id").eq("id", id);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);

    const denied = await userB.from("cards").update({ data: { front: "must not cross accounts" } }).eq("id", id).select("id");
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
  });

  it("does not let an older duplicate-device write overwrite newer data", async () => {
    if (!userA) return;
    const newer = await userA.from("cards").upsert({
      id,
      user_id: userAId,
      subject_id: "staging",
      topic_id: "staging",
      data: { id, front: "newer", updatedAt: "2026-09-04T12:00:00.000Z" },
      updated_at: "2026-09-04T12:00:00.000Z",
    });
    expect(newer.error).toBeNull();
    const older = await userA.from("cards").upsert({
      id,
      user_id: userAId,
      subject_id: "staging",
      topic_id: "staging",
      data: { id, front: "older", updatedAt: "2026-09-04T11:00:00.000Z" },
      updated_at: "2026-09-04T11:00:00.000Z",
    });
    expect(older.error).toBeNull();
    const row = await userA.from("cards").select("data,updated_at").eq("id", id).single();
    expect(row.error).toBeNull();
    expect((row.data?.data as { front?: string })?.front).toBe("newer");
  });
});

