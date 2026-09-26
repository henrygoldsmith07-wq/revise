import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  comparePulseRow,
  decodePulseCursor,
  encodePulseCursor,
  isAfterPulseCursor,
  paginatePulseRows,
  pulseOrCondition,
  pulseTableQuery,
  queryTableTail,
  type PulseCursor,
  type PulseKind,
  type PulseSortable,
} from "@/lib/pulse-history";
import { pulseHistoryAllowed } from "@/data/pulse-consent";

type Row = PulseSortable & { payload: string };

function row(kind: "attempt" | "review", id: string, updatedAt: string): Row {
  return { kind, id, updatedAt, payload: `${kind}:${id}` };
}

const SINCE = "1970-01-01T00:00:00.000Z";

// Faithful route simulation: each table applies its own lexicographic SQL
// tail (WHERE scope ORDER BY updated_at, id LIMIT limit+1) — exactly what the
// database returns — then the route merges, applies the exact cursor filter,
// sorts globally and slices one page. Any skip/duplicate the real queries
// would cause shows up here.
function sqlWalkPages(all: Row[], limit: number, startCursor: PulseCursor | null = null): Row[][] {
  let cursor: PulseCursor | null = startCursor;
  const pages: Row[][] = [];
  for (let guard = 0; guard < 5000; guard++) {
    const fetched = [
      ...queryTableTail({ rows: all, kind: "attempt", cursor, since: SINCE, limit: limit + 1 }),
      ...queryTableTail({ rows: all, kind: "review", cursor, since: SINCE, limit: limit + 1 }),
    ];
    const after = fetched
      .filter((r) => (cursor ? isAfterPulseCursor(r, cursor) : r.updatedAt > SINCE))
      .sort(comparePulseRow);
    const page = after.slice(0, limit);
    const hasMore = after.length > limit;
    pages.push(page);
    if (!hasMore) break;
    const last = page[page.length - 1]!;
    cursor = { ts: last.updatedAt, kind: last.kind, id: last.id };
  }
  return pages;
}

/** Walk every page and assert the full history arrives exactly once, in order. */
function expectCompleteWalk(all: Row[], limit: number): void {
  const pages = sqlWalkPages(all, limit);
  const flat = pages.flat();
  const expected = [...all].sort(comparePulseRow);
  expect(flat.map((r) => `${r.kind}:${r.id}:${r.updatedAt}`)).toEqual(
    expected.map((r) => `${r.kind}:${r.id}:${r.updatedAt}`),
  );
  expect(new Set(flat.map((r) => `${r.kind}:${r.id}`)).size).toBe(all.length);
}

function tieRows(kind: PulseKind, count: number, ts: string, prefix: string): Row[] {
  return Array.from({ length: count }, (_, i) => row(kind, `${prefix}-${String(i).padStart(4, "0")}`, ts));
}

describe("pulse history deterministic pagination", () => {
  it("empty history returns no records, null cursor, hasMore false", () => {
    const { page, nextCursor, hasMore } = paginatePulseRows({ rows: [], cursor: null, limit: 10 });
    expect(page).toEqual([]);
    expect(nextCursor).toBeNull();
    expect(hasMore).toBe(false);
  });

  it("fewer than limit returns all rows with hasMore false and null cursor", () => {
    const rows = [row("review", "r1", "2026-01-01T00:00:00.000Z"), row("attempt", "a1", "2026-01-02T00:00:00.000Z")];
    const { page, nextCursor, hasMore } = paginatePulseRows({ rows, cursor: null, limit: 10 });
    expect(page).toHaveLength(2);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  it("exactly limit returns hasMore false and null cursor (never hasMore:true + cursor:null mismatch)", () => {
    const rows = [
      row("attempt", "a1", "2026-01-01T00:00:00.000Z"),
      row("review", "r1", "2026-01-02T00:00:00.000Z"),
      row("attempt", "a2", "2026-01-03T00:00:00.000Z"),
    ];
    const { page, nextCursor, hasMore } = paginatePulseRows({ rows, cursor: null, limit: 3 });
    expect(page).toHaveLength(3);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  it("limit+1 sets hasMore true with a non-null cursor", () => {
    const rows = [
      row("attempt", "a1", "2026-01-01T00:00:00.000Z"),
      row("review", "r1", "2026-01-02T00:00:00.000Z"),
      row("attempt", "a2", "2026-01-03T00:00:00.000Z"),
      row("review", "r2", "2026-01-04T00:00:00.000Z"),
    ];
    const { page, nextCursor, hasMore } = paginatePulseRows({ rows, cursor: null, limit: 3 });
    expect(page).toHaveLength(3);
    expect(hasMore).toBe(true);
    expect(nextCursor).not.toBeNull();
    // Continuing from the cursor yields the tail with hasMore false.
    const tail = paginatePulseRows({ rows, cursor: nextCursor, limit: 3 });
    expect(tail.page).toHaveLength(1);
    expect(tail.hasMore).toBe(false);
    expect(tail.nextCursor).toBeNull();
  });

  it("walks multiple pages with a small limit without skipping or duplicating", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 25; i++) {
      const day = String(1 + (i % 20)).padStart(2, "0");
      rows.push(row(i % 2 === 0 ? "attempt" : "review", `id-${String(i).padStart(3, "0")}`, `2026-01-${day}T12:00:00.000Z`));
    }
    expectCompleteWalk(rows, 4);
    expect(sqlWalkPages(rows, 4).length).toBeGreaterThan(3);
  });

  it("handles only reviews", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row("review", `r${i}`, `2026-02-0${i}T00:00:00.000Z`));
    const pages = sqlWalkPages(rows, 2);
    expect(pages.flat()).toHaveLength(5);
    expect(pages).toHaveLength(3);
  });

  it("handles only attempts", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row("attempt", `a${i}`, `2026-02-0${i}T00:00:00.000Z`));
    const pages = sqlWalkPages(rows, 2);
    expect(pages.flat()).toHaveLength(5);
    expect(pages).toHaveLength(3);
  });

  it("interleaves mixed reviews/attempts in stable (updated_at, kind, id) order", () => {
    const rows = [
      row("review", "r1", "2026-03-01T10:00:00.000Z"),
      row("attempt", "a1", "2026-03-01T10:00:00.000Z"),
      row("review", "r2", "2026-03-01T09:00:00.000Z"),
      row("attempt", "a2", "2026-03-01T11:00:00.000Z"),
    ];
    const { page } = paginatePulseRows({ rows, cursor: null, limit: 10 });
    // 09:00 first, then 10:00 attempt before review (kind ASC), then 11:00.
    expect(page.map((r) => `${r.kind}:${r.id}`)).toEqual(["review:r2", "attempt:a1", "review:r1", "attempt:a2"]);
  });

  it("identical timestamps paginate deterministically across pages", () => {
    const ts = "2026-04-01T00:00:00.000Z";
    const rows = [
      row("review", "r-b", ts),
      row("attempt", "a-b", ts),
      row("review", "r-a", ts),
      row("attempt", "a-a", ts),
      row("review", "r-c", ts),
    ];
    const pages = sqlWalkPages(rows, 2);
    const flat = pages.flat().map((r) => `${r.kind}:${r.id}`);
    expect(flat).toEqual(["attempt:a-a", "attempt:a-b", "review:r-a", "review:r-b", "review:r-c"]);
    expect(new Set(flat).size).toBe(5);
  });

  it("each table queries its exact lexicographic tail (no coarse >= prefix)", () => {
    const ts = "2026-04-01T00:00:00.000Z";
    // Same-kind cursor continues inside the tie via id.
    expect(pulseTableQuery("attempt", { ts, kind: "attempt", id: "a-0500" }, SINCE)).toEqual({
      mode: "or", ts, id: "a-0500",
    });
    expect(pulseOrCondition({ mode: "or", ts, id: "a-0500" })).toBe(
      `updated_at.gt.${ts},and(updated_at.eq.${ts},id.gt.a-0500)`,
    );
    // A table whose kind sorts after the cursor kind takes the whole tie-block.
    expect(pulseTableQuery("review", { ts, kind: "attempt", id: "a-0500" }, SINCE)).toEqual({
      mode: "gte", ts,
    });
    // A table whose kind sorts before the cursor kind is already exhausted at ts.
    expect(pulseTableQuery("attempt", { ts, kind: "review", id: "r-0001" }, SINCE)).toEqual({
      mode: "gt", ts,
    });
    expect(pulseTableQuery("review", null, SINCE)).toEqual({ mode: "gt", ts: SINCE });
  });

  it("1000 attempts sharing one timestamp survive small page sizes", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = tieRows("attempt", 1000, ts, "a");
    for (const limit of [1, 10, 100]) expectCompleteWalk(rows, limit);
  });

  it("1000 reviews sharing one timestamp survive small page sizes", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = tieRows("review", 1000, ts, "r");
    for (const limit of [1, 10, 100]) expectCompleteWalk(rows, limit);
  });

  it("mixed reviews+attempts sharing one timestamp survive small page sizes", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = [...tieRows("attempt", 500, ts, "a"), ...tieRows("review", 500, ts, "r")];
    for (const limit of [1, 10, 100]) expectCompleteWalk(rows, limit);
  });

  it("a cursor inside a timestamp tie continues inside the tie", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = tieRows("attempt", 200, ts, "a");
    // First two pages at limit 10, then continue from that cursor.
    const first = sqlWalkPages(rows, 10);
    expect(first[0]).toHaveLength(10);
    expect(first[1]).toHaveLength(10);
    const midCursor: PulseCursor = (() => {
      let cursor: PulseCursor | null = null;
      for (let i = 0; i < 2; i++) {
        const current: PulseCursor | null = cursor;
        const fetched: Row[] = [
          ...queryTableTail({ rows, kind: "attempt", cursor: current, since: SINCE, limit: 11 }),
          ...queryTableTail({ rows, kind: "review", cursor: current, since: SINCE, limit: 11 }),
        ];
        const after: Row[] = fetched
          .filter((r: Row) => (current ? isAfterPulseCursor(r, current) : r.updatedAt > SINCE))
          .sort(comparePulseRow);
        const page: Row[] = after.slice(0, 10);
        const last: Row = page[page.length - 1]!;
        cursor = { ts: last.updatedAt, kind: last.kind, id: last.id };
      }
      return cursor!;
    })();
    expect(midCursor.ts).toBe(ts);
    const rest = sqlWalkPages(rows, 10, midCursor);
    expect(rest.flat()).toHaveLength(180);
    expect(rest.flat()[0]?.id).toBe("a-0020");
  });

  it("a cursor on the final attempt before reviews continues with reviews", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = [
      ...tieRows("attempt", 3, ts, "a"),
      ...tieRows("review", 2, ts, "r"),
    ];
    const cursor: PulseCursor = { ts, kind: "attempt", id: "a-0002" };
    // The attempts table is exhausted at ts; the reviews table takes its tie-block.
    expect(queryTableTail({ rows, kind: "attempt", cursor, since: SINCE, limit: 11 })).toEqual([]);
    expect(
      queryTableTail({ rows, kind: "review", cursor, since: SINCE, limit: 11 }).map((r) => r.id),
    ).toEqual(["r-0000", "r-0001"]);
    expectCompleteWalk(rows, 1);
  });

  it("a cursor on the final review at a timestamp moves past the timestamp", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    const rows = [
      row("attempt", "a-0000", ts),
      row("review", "r-0000", ts),
      row("attempt", "a-0001", "2026-06-02T00:00:00.000Z"),
    ];
    const cursor: PulseCursor = { ts, kind: "review", id: "r-0000" };
    expect(queryTableTail({ rows, kind: "attempt", cursor, since: SINCE, limit: 11 }).map((r) => r.id)).toEqual(["a-0001"]);
    expect(queryTableTail({ rows, kind: "review", cursor, since: SINCE, limit: 11 })).toEqual([]);
  });

  it("seeded interleaved histories with heavy ties walk completely at sizes 1/10/100", () => {
    for (const seed of [7, 42, 1337]) {
      let s = seed >>> 0;
      const rnd = () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return ((s >>> 0) / 0xffffffff);
      };
      const stamps = ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-02-14T00:00:00.000Z", "2026-03-03T12:00:00.000Z"];
      const rows: Row[] = Array.from({ length: 300 }, (_, i) =>
        row(rnd() > 0.5 ? "review" : "attempt", `id-${String(i).padStart(4, "0")}`, stamps[Math.floor(rnd() * stamps.length)]!),
      );
      for (const limit of [1, 10, 100]) expectCompleteWalk(rows, limit);
      // Deterministic: the same input always yields the same pages.
      expect(sqlWalkPages(rows, 10).flat().map((r) => r.id)).toEqual(
        sqlWalkPages(rows, 10).flat().map((r) => r.id),
      );
    }
  });

  it("new rows arriving between requests do not duplicate or skip", () => {
    const rows = [
      row("attempt", "a1", "2026-05-01T00:00:00.000Z"),
      row("review", "r1", "2026-05-02T00:00:00.000Z"),
      row("attempt", "a2", "2026-05-03T00:00:00.000Z"),
    ];
    const first = paginatePulseRows({ rows, cursor: null, limit: 2 });
    expect(first.page).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    // A new row arrives with an older timestamp (backfill) + a newer row.
    const later = [
      ...rows,
      row("review", "r0-backfill", "2026-05-01T12:00:00.000Z"),
      row("attempt", "a3-new", "2026-05-04T00:00:00.000Z"),
    ];
    const second = paginatePulseRows({ rows: later, cursor: first.nextCursor, limit: 2 });
    // Cursor is positional: rows after the cursor only. Backfill before the
    // cursor is not re-yielded (documented continuation semantics), newer rows are.
    const ids = second.page.map((r) => r.id);
    expect(ids).toContain("a2");
    expect(ids).toContain("a3-new");
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("r1");
  });

  it("rejects invalid cursors", () => {
    expect(decodePulseCursor(null)).toBeNull();
    expect(decodePulseCursor("")).toBeNull();
    expect(decodePulseCursor("not-base64!!!")).toBeNull();
    expect(decodePulseCursor(encodePulseCursor({ ts: "bad", kind: "review", id: "x" }))).toBeNull();
    expect(decodePulseCursor(encodePulseCursor({ ts: "2026-01-01T00:00:00.000Z", kind: "bogus" as never, id: "x" }))).toBeNull();
    expect(decodePulseCursor("x".repeat(600))).toBeNull();
    // Truncated cursor fails round-trip check.
    const good = encodePulseCursor({ ts: "2026-01-01T00:00:00.000Z", kind: "attempt", id: "a1" });
    expect(decodePulseCursor(good.slice(0, good.length - 2))).toBeNull();
    // Valid cursor round-trips.
    expect(decodePulseCursor(good)).toEqual({ ts: "2026-01-01T00:00:00.000Z", kind: "attempt", id: "a1" });
  });

  it("route rejects invalid cursors with 400 and never returns hasMore:true with cursor:null", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/pulse/history/route.ts"), "utf8");
    expect(source).toContain("status: 400");
    expect(source).toContain("decodePulseCursor");
    expect(source).toContain("encodePulseCursor");
    // Continuation is lexicographic at the query level, not a coarse >= prefix.
    expect(source).toContain("pulseTableQuery");
    expect(source).toContain(".or(");
    expect(source).not.toContain("pulseTableFloorTs");
    // No legacy `cursor: null` + unchecked hasMore path remains.
    expect(source).not.toMatch(/cursor:\s*null,\s*\n\s*hasMore:\s*records\.length\s*>\s*limit/);
  });

  it("route enforces authentication (401) and Pulse consent on every request (403)", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/pulse/history/route.ts"), "utf8");
    expect(source).toContain("status: 401");
    expect(source).toContain("status: 403");
    expect(source).toContain("pulseHistoryAllowed");
    // Consent helper itself fails closed.
    expect(pulseHistoryAllowed(null)).toBe(false);
    expect(pulseHistoryAllowed({ pulseEnabled: true })).toBe(true);
    // Revoked between requests withholds.
    expect(pulseHistoryAllowed({ pulseEnabled: false })).toBe(false);
    expect(pulseHistoryAllowed({})).toBe(false);
  });
});
