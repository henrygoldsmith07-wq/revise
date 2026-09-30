import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAll, getDb } from "@/data/db";
import { SYNC_PULL_PAGE_SIZE, sync } from "@/data/sync";
import { readReviseUserMeta } from "@/data/storage-namespace";
import { createCard } from "@/domain/scheduling";
import { encryptPayload } from "@/data/e2ee";
import type { PullCursor } from "@/data/sync";

const USER = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

interface PagedFakeOptions {
  /** Rows per table. */
  tables: Record<string, Row[]>;
  /** Return { error } on this 0-based page index of the given table. */
  failPage?: { table: string; page: number };
  /** getUser call count from which auth reports signed-out. */
  signOutAfter?: number;
  /** getUser call count from which auth reports a different account. */
  switchAccountAfter?: number;
}

function remoteCard(id: string, updatedAt: string, userId = USER): Row {
  return {
    id,
    user_id: userId,
    updated_at: updatedAt,
    data: createCard(
      { id, userId, subjectId: "subject", topicId: "topic", front: "q", back: "a" },
      new Date(updatedAt),
    ),
  };
}

function ts(index: number): string {
  // Spread one row per second from a fixed base so ordering is deterministic.
  return new Date(Date.parse("2026-09-01T00:00:00.000Z") + index * 1000).toISOString();
}

function pagedClient(options: PagedFakeOptions): { client: SupabaseClient; pages: Record<string, number> } {
  const pages: Record<string, number> = {};
  let authCalls = 0;
  const client = {
    auth: {
      getUser: async () => {
        authCalls++;
        if (options.signOutAfter && authCalls >= options.signOutAfter) return { data: { user: null } };
        if (options.switchAccountAfter && authCalls >= options.switchAccountAfter) {
          return { data: { user: { id: "99999999-9999-4999-8999-999999999999" } } };
        }
        return { data: { user: { id: USER } } };
      },
    },
    from: (table: string) => {
      const state: { owner?: string; or?: string } = {};
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.select = () => builder;
      builder.eq = ((_column: string, owner: string) => {
        state.owner = owner;
        return builder;
      }) as never;
      builder.or = ((clause: string) => {
        state.or = clause;
        return builder;
      }) as never;
      builder.order = () => builder;
      builder.gt = () => builder;
      builder.range = (async (from: number, to: number) => {
        const page = pages[table] ?? 0;
        pages[table] = page + 1;
        if (options.failPage?.table === table && options.failPage.page === page) {
          return { data: null, error: { message: "page outage" } };
        }
        let out = (options.tables[table] ?? []).filter((row) => row.user_id === state.owner);
        const match = /updated_at\.gt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.gt\.(.*)\)/.exec(state.or ?? "");
        if (match) {
          const [, gtTs, eqTs, gtId] = match;
          out = out.filter((row) => {
            const rowTs = String(row.updated_at ?? "");
            const rowId = String(row.id ?? "");
            return rowTs > (gtTs ?? "") || (rowTs === (eqTs ?? "") && rowId > (gtId ?? ""));
          });
        }
        out = out.slice().sort(
          (a, b) =>
            String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")) ||
            String(a.id ?? "").localeCompare(String(b.id ?? "")),
        );
        return { data: out.slice(from, to + 1), error: null };
      }) as never;
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, pages };
}

async function cardCount(): Promise<number> {
  return (await getDb()).count("cards");
}

async function entityCursor(entity: string): Promise<PullCursor | undefined> {
  const all = await readReviseUserMeta<Record<string, PullCursor>>("pullCursors", USER);
  return all?.[`lastPullAt:${entity}`];
}

beforeEach(async () => {
  await clearAll();
});

describe("paginated pull", () => {
  it(`pulls 1,001 rows across pages without loss or duplication (page size ${SYNC_PULL_PAGE_SIZE})`, async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => remoteCard(`card-${String(i).padStart(5, "0")}`, ts(i)));
    const { client, pages } = pagedClient({ tables: { cards: rows } });
    const result = await sync(USER, { client, online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(1001);
    expect(await cardCount()).toBe(1001);
    expect(pages.cards).toBeGreaterThan(1);
    const cursor = await entityCursor("cards");
    expect(cursor).toEqual({ updatedAt: ts(1000), id: "card-01000" });
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBe(ts(1000));
  });

  it("pulls 5,000 rows to completion", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => remoteCard(`card-${String(i).padStart(5, "0")}`, ts(i)));
    const { client } = pagedClient({ tables: { cards: rows } });
    const result = await sync(USER, { client, online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(5000);
    expect(await cardCount()).toBe(5000);
    // Spot-check first, middle and last rows landed under their own keys.
    const db = await getDb();
    expect(await db.get("cards", "card-00000")).toBeDefined();
    expect(await db.get("cards", "card-02500")).toBeDefined();
    expect(await db.get("cards", "card-04999")).toBeDefined();
  });

  it("pages thousands of rows sharing one timestamp via the id tie-break", async () => {
    const stamp = "2026-09-05T12:00:00.000Z";
    const rows = Array.from({ length: 1500 }, (_, i) => remoteCard(`same-ts-${String(i).padStart(5, "0")}`, stamp));
    const { client, pages } = pagedClient({ tables: { cards: rows } });
    const result = await sync(USER, { client, online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(1500);
    expect(await cardCount()).toBe(1500);
    expect(pages.cards).toBeGreaterThanOrEqual(3);
    expect(await entityCursor("cards")).toEqual({ updatedAt: stamp, id: "same-ts-01499" });
  });

  it("pins the cursor on a mid-pagination failure and completes on retry without duplicates", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => remoteCard(`card-${String(i).padStart(5, "0")}`, ts(i)));
    const failing = pagedClient({ tables: { cards: rows }, failPage: { table: "cards", page: 1 } });
    const first = await sync(USER, { client: failing.client, online: true });
    expect(first.pulled).toBe(SYNC_PULL_PAGE_SIZE);
    expect(first.failed).toBeGreaterThan(0);
    // Only the first page merged; no cursor was persisted past unprocessed rows.
    expect(await cardCount()).toBe(SYNC_PULL_PAGE_SIZE);
    expect(await entityCursor("cards")).toBeUndefined();

    const healthy = pagedClient({ tables: { cards: rows } });
    const second = await sync(USER, { client: healthy.client, online: true });
    expect(second.failed).toBe(0);
    expect(second.pulled).toBe(1200);
    expect(await cardCount()).toBe(1200);
    expect(await entityCursor("cards")).toEqual({ updatedAt: ts(1199), id: "card-01199" });
  });

  it("stops paginating when the account changes and keeps completed cursors for resume", async () => {
    const cards = Array.from({ length: 600 }, (_, i) => remoteCard(`card-${String(i).padStart(5, "0")}`, ts(i)));
    const attempts = Array.from({ length: 100 }, (_, i) => ({
      id: `attempt-${String(i).padStart(4, "0")}`,
      user_id: USER,
      updated_at: ts(i),
      data: { id: `attempt-${String(i).padStart(4, "0")}`, userId: USER, questionId: "q", subjectId: "s", topicIds: ["t"], answers: {}, awarded: 1, max: 2, marked: true, markedBy: "rubric", mode: "practice", createdAt: ts(i) },
    }));
    // TABLES order puts attempts before cards; switching identity on the 3rd
    // auth call lands mid-pull and must surface account-mismatch.
    const { client } = pagedClient({ tables: { cards, attempts }, switchAccountAfter: 3 });
    const result = await sync(USER, { client, online: true });
    expect(result.skipped).toBe("account-mismatch");
  });

  it("merges the readable rows around an E2EE failure without dropping them, and retries the bad row", async () => {
    const good = (id: string) => remoteCard(id, ts(10));
    const bad: Row = {
      id: "card-bad",
      user_id: USER,
      updated_at: ts(11),
      data: { v: 1, alg: "AES-GCM", iv: "bogus", ct: "bogus", fp: "bogus" },
    };
    const tables = { cards: [good("card-a"), bad, good("card-c")] };
    const result = await sync(USER, { client: pagedClient({ tables }).client, online: true });
    expect(result.failed).toBe(1);
    const db = await getDb();
    expect(await db.get("cards", "card-a")).toBeDefined();
    expect(await db.get("cards", "card-c")).toBeDefined();
    // The entity cursor stays pinned so the unreadable row is retried, not skipped.
    expect(await entityCursor("cards")).toBeUndefined();

    // After the key is restored the row decrypts and the cursor advances.
    const fixed = {
      ...bad,
      data: await encryptPayload({ id: "card-bad", userId: USER, subjectId: "s", topicId: "t", front: "q", back: "a", updatedAt: ts(11) }),
    };
    const retry = await sync(USER, { client: pagedClient({ tables: { cards: [good("card-a"), fixed, good("card-c")] } }).client, online: true });
    expect(retry.failed).toBe(0);
    expect(await db.get("cards", "card-bad")).toBeDefined();
    expect(await entityCursor("cards")).toEqual({ updatedAt: ts(11), id: "card-bad" });
  });

  it("records the exact final-row cursor for a small page", async () => {
    const rows = [remoteCard("b", ts(2)), remoteCard("a", ts(1)), remoteCard("c", ts(2))];
    const result = await sync(USER, { client: pagedClient({ tables: { cards: rows } }).client, online: true });
    expect(result.failed).toBe(0);
    expect(result.pulled).toBe(3);
    // (ts1,a) < (ts2,b) < (ts2,c): the cursor is the final row in keyset order.
    expect(await entityCursor("cards")).toEqual({ updatedAt: ts(2), id: "c" });
  });

  it("lets a failed entity keep its cursor pinned while other entities progress", async () => {
    const cards = [remoteCard("card-1", ts(5))];
    const attempts = Array.from({ length: 3 }, (_, i) => ({
      id: `attempt-${i}`,
      user_id: USER,
      updated_at: ts(i),
      data: { id: `attempt-${i}`, userId: USER, questionId: "q", subjectId: "s", topicIds: ["t"], answers: {}, awarded: 1, max: 2, marked: true, markedBy: "rubric", mode: "practice", createdAt: ts(i) },
    }));
    // TABLES order pulls attempts before cards; failing attempts page 0 must
    // not stop cards from completing, and the legacy global cursor stays
    // frozen so old clients retry the failed table too.
    const { client } = pagedClient({ tables: { cards, attempts }, failPage: { table: "attempts", page: 0 } });
    const result = await sync(USER, { client, online: true });
    expect(result.failed).toBeGreaterThan(0);
    expect(await entityCursor("cards")).toEqual({ updatedAt: ts(5), id: "card-1" });
    expect(await entityCursor("attempts")).toBeUndefined();
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBeUndefined();

    const retry = await sync(USER, { client: pagedClient({ tables: { cards, attempts } }).client, online: true });
    expect(retry.failed).toBe(0);
    expect(await entityCursor("attempts")).toEqual({ updatedAt: ts(2), id: "attempt-2" });
    expect(await readReviseUserMeta<string>("lastPullAt", USER)).toBe(ts(5));
  });
});
