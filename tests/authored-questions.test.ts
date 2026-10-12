import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb, putMissing } from "@/data/db";
import { ensureSeeded, loadSnapshot } from "@/data/repository";
import { authoredQuestionIds, loadQuestionRows } from "@/data/authored-questions";
import { applyDeletionPage } from "@/data/sync-deletions";
import { syncWireId, syncWireIdValue } from "@/data/sync-contract";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import { seedQuestions } from "@/content";
import type { Question } from "@/domain/types";

// Fifteenth pass: authored (shared curriculum) questions are served from the
// shipped bundle instead of a per-device IndexedDB copy. These pin that the
// snapshot is the same set a fresh install used to produce, that stored
// private questions still load, that tombstones still hide authored ids, and
// that an old device's stale installed copy no longer shadows the current
// authored version (corrected schemes and reject rules now reach it).

const USER = "authored-questions-user";
const RETIRED = "cnt:question:wjec-physics-depth-";
const byKey = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

beforeEach(async () => {
  await clearAll();
});

function privateQuestion(id: string): Question {
  const base = seedQuestions[0]!;
  return { ...base, id, origin: "ai", userId: USER, parts: base.parts.map((part, i) => ({ ...part, id: `${id}:${i}` })) } as Question;
}

describe("authored questions come from the bundle", () => {
  it("a fresh profile writes no questions and its snapshot equals what the old IndexedDB install produced", async () => {
    await ensureSeeded(USER);
    const db = await getDb();
    expect(await db.count("questions")).toBe(0);
    const fresh = (await loadSnapshot(USER)).questions;

    // The old path: copy the whole bank into the store, then read it back.
    await clearAll();
    await putMissing("questions", seedQuestions, USER);
    const installed = (await (await getDb()).getAll("questions")) as Question[];
    const old = installed.filter((q) => !q.id.startsWith(RETIRED));
    expect(fresh.map((q) => q.id)).toEqual(old.map((q) => q.id));
    expect(fresh).toEqual(old);
  }, 60000);

  it("serves questions in IndexedDB key order, as getAll() did", async () => {
    const { questions } = await loadQuestionRows(USER);
    expect(questions.map((q) => q.id)).toEqual([...seedQuestions].sort(byKey).map((q) => q.id));
  });

  it("still loads stored private questions, and does not read stored copies of authored ids", async () => {
    const mine = privateQuestion("2f9b2a3e-1111-4c6d-9e1f-000000000001");
    const db = await getDb();
    await db.put("questions", mine as never);
    const authored = seedQuestions[1]!;
    await db.put("questions", { ...authored, stem: "STALE INSTALLED COPY" } as never);
    const { questions, stored } = await loadQuestionRows(USER);
    expect(questions.find((q) => q.id === mine.id)).toEqual(mine);
    expect(stored.map((row) => (row as Question).id)).toEqual([mine.id]);
    // The current authored version supersedes the old device copy.
    expect(questions.find((q) => q.id === authored.id)?.stem).toBe(authored.stem);
    expect(questions.filter((q) => q.id === authored.id)).toHaveLength(1);
    // Nothing on disk was rewritten or dropped.
    expect(((await db.get("questions", authored.id)) as Question).stem).toBe("STALE INSTALLED COPY");
  });

  it("a local or wire tombstone still hides an authored question", async () => {
    const [a, b] = [seedQuestions[2]!, seedQuestions[3]!];
    const db = await getDb();
    await db.put("meta", { key: tombstoneKey("questions", a.id), value: true } as never);
    await db.put("meta", { key: wireTombstoneKey("questions", syncWireIdValue(USER, b.id)), value: true } as never);
    const ids = new Set((await loadSnapshot(USER)).questions.map((q) => q.id));
    expect(ids.has(a.id)).toBe(false);
    expect(ids.has(b.id)).toBe(false);
    expect(ids.has(seedQuestions[4]!.id)).toBe(true);
  }, 30000);

  it("a synced deletion of an authored question stays deleted across reloads", async () => {
    const target = seedQuestions[5]!;
    await ensureSeeded(USER);
    await applyDeletionPage([{ user_id: USER, table_name: "questions", row_id: await syncWireId(USER, target.id), local_id: null }], USER);
    await ensureSeeded(USER);
    expect((await loadSnapshot(USER)).questions.some((q) => q.id === target.id)).toBe(false);
  }, 30000);

  it("an authored id can never be a private question (private ones are minted as UUIDs)", () => {
    for (const id of authoredQuestionIds()) expect(id.startsWith("cnt:question:")).toBe(true);
    expect(seedQuestions.every((q) => q.origin === "seed")).toBe(true);
  });
});
