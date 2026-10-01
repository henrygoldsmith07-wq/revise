import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedQuestions } from "@/content";
import { buildPortabilitySnapshot } from "@/domain/portability";
import { createCard } from "@/domain/scheduling";
import { syncWireIdValue } from "@/data/sync-contract";

vi.mock("@/data/supabase", () => ({ isSupabaseConfigured: true, getSupabase: () => null }));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const privateQuestion = () => ({ ...seedQuestions[0]!, id: crypto.randomUUID(), origin: "past-paper" as const });
beforeEach(() => { vi.resetModules(); globalThis.indexedDB = new IDBFactory(); });

function replica(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return { auth: { getUser: async () => ({ data: { user: { id: A } } }) }, from: (table: string) => {
    let owner = "";
    const query = { select: () => query, order: () => query, or: () => query, gt: () => query,
      eq: (_column: string, value: string) => { owner = value; return query; },
      range: async () => ({ data: (tables[table] ?? []).filter(row => row.user_id === owner), error: null }),
      upsert: async (input: Record<string, unknown>[]) => { tables[table] = input; return { error: null }; },
    };
    return query;
  } } as unknown as SupabaseClient;
}

it("replicates an uploaded paper with its private questions to an independent device", async () => {
  const db = await import("@/data/db"); db.bindDatabaseProfile(A);
  const repo = await import("@/data/repository");
  const { sync } = await import("@/data/sync");
  const question = privateQuestion();
  const paper = { id: crypto.randomUUID(), userId: A, subjectId: question.subjectId, title: "Imported paper", questionIds: [question.id], totalMarks: question.totalMarks, status: "extracted" as const, createdAt: question.createdAt };
  await repo.saveQuestions([question]); // default owner is the pinned profile
  await repo.savePaper(paper);
  const tables: Record<string, Record<string, unknown>[]> = {};
  expect((await sync(A, { client: replica(tables), online: true })).failed).toBe(0);
  expect(tables.questions[0].user_id).toBe(A);
  expect(await (await db.getDb()).count("outbox")).toBe(0);
  globalThis.indexedDB = new IDBFactory(); db.resetDbConnection();
  expect((await sync(A, { client: replica(tables), online: true })).pulled).toBe(2);
  expect(await (await db.getDb()).get("questions", question.id)).toMatchObject(question);
  expect(await (await db.getDb()).get("papers", paper.id)).toMatchObject({ questionIds: [question.id] });
});

it("repairs a legacy question queue only in its pinned account", async () => {
  const db = await import("@/data/db"); db.bindDatabaseProfile(A);
  const connection = await db.getDb();
  const question = privateQuestion();
  await connection.put("questions", question);
  const queuedAt = new Date().toISOString();
  await connection.put("outbox", { id: "legacy", entity: "questions", op: "upsert", payload: question, queuedAt, attempts: 0 });
  const { repairQuestionOutboxOwners } = await import("@/data/question-ownership");
  await repairQuestionOutboxOwners(B);
  expect((await connection.get("outbox", "legacy"))?.ownerId).toBeUndefined();
  await repairQuestionOutboxOwners(A);
  expect((await connection.get("outbox", "legacy"))?.ownerId).toBe(A);
  for (const [id, payload, entity] of [
    ["foreign", { ...question, userId: B }, "questions"],
    ["public", seedQuestions[0]!, "questions"],
    ["missing", { ...question, id: "absent" }, "questions"],
    ["other-entity", question, "cards"],
  ] as const) await connection.put("outbox", { id, entity, op: "upsert", payload, queuedAt, attempts: 0 });
  await repairQuestionOutboxOwners(A);
  expect((await connection.getAll("outbox")).filter(row => row.id !== "legacy").every(row => !row.ownerId)).toBe(true);
});

it("adopts private local questions and their legacy queue without queueing public curriculum", async () => {
  const db = await import("@/data/db");
  const { initializeAccountProfile } = await import("@/data/account-profile");
  const { defaultSettings } = await import("@/data/repository");
  const local = await db.getProfileDb("local");
  const question = privateQuestion();
  await local.put("settings", defaultSettings("local"));
  await local.put("questions", question); await local.put("questions", seedQuestions[0]!);
  await local.put("outbox", { id: "legacy-local", entity: "questions", op: "upsert", payload: question, queuedAt: new Date().toISOString(), attempts: 0 });
  await initializeAccountProfile(A, true);
  const queued = (await (await db.getProfileDb(A)).getAll("outbox")).filter(row => row.entity === "questions");
  expect(queued).toHaveLength(2);
  expect(queued.every(row => row.ownerId === A && (row.payload as {id:string}).id === question.id)).toBe(true);
});

it("queues restored private questions, preserves same-account UUIDs, and leaves seed questions local", async () => {
  const db = await import("@/data/db"); db.bindDatabaseProfile(A);
  const { restorePortableSnapshot } = await import("@/data/portable-restore");
  const question = privateQuestion();
  const snapshot = buildPortabilitySnapshot({ userId: A, cards: [], questions: [question, seedQuestions[0]!], attempts: [], reviewLogs: [], mistakes: [], plannedSessions: [], examDates: [] });
  await restorePortableSnapshot(snapshot, A);
  const queued = (await (await db.getDb()).getAll("outbox")).filter(row => row.entity === "questions");
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ ownerId: A, payload: { id: question.id } });
});

it("restores another account's UUID records with valid ownership and linked references", async () => {
  const db = await import("@/data/db"); db.bindDatabaseProfile(B);
  const { restorePortableSnapshot } = await import("@/data/portable-restore");
  const card = createCard({ id: crypto.randomUUID(), userId: A, subjectId: "reference", topicId: "topic", front: "Source", back: "Answer" });
  // Pulled questions carry a wire owner even though authored Question has no userId.
  const question = { ...privateQuestion(), userId: A };
  const review = { id: crypto.randomUUID(), userId: A, cardId: card.id, topicId: "topic", grade: "good" as const, elapsedMs: 10, reviewedAt: "2026-09-30T00:00:00Z" };
  const snapshot = buildPortabilitySnapshot({ userId: A, cards: [card], questions: [question], attempts: [], reviewLogs: [review], mistakes: [], plannedSessions: [], examDates: [] });
  await restorePortableSnapshot(snapshot, B);
  const connection = await db.getDb();
  const copiedCard = (await connection.getAll("cards"))[0]!;
  const copiedQuestion = (await connection.getAll("questions"))[0]!;
  expect(syncWireIdValue(A, card.id)).not.toBe(syncWireIdValue(B, copiedCard.id));
  expect((await connection.getAll("reviewLogs"))[0]!.cardId).toBe(copiedCard.id);
  expect((await connection.getAll("outbox")).every(row => row.ownerId === B)).toBe(true);
  expect((await connection.getAll("outbox")).find(row => row.entity === "questions")?.payload).toMatchObject({ id: copiedQuestion.id, userId: B });
  expect(question.userId).toBe(A);
  await restorePortableSnapshot(snapshot, B);
  expect((await connection.getAll("cards"))[0]!.id).toBe(copiedCard.id);
  const foreignQuestion = { ...question, userId: "other" };
  await expect(restorePortableSnapshot({ ...snapshot, questions: [foreignQuestion] }, B)).rejects.toThrow(/snapshot owner/);
});
