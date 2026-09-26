// Deterministic Pulse history pagination.
//
// Ordering is (updated_at ASC, kind ASC, id ASC) where kind is "attempt" <
// "review" alphabetically. That triple is stable even when timestamps collide,
// rows interleave across tables, or new rows arrive between requests.
//
// Cursor is base64url(JSON {ts, kind, id}) pointing at the LAST returned row.
// Next page returns rows strictly greater than the cursor, so pages can never
// skip or duplicate. Fetch limit+1 per table to detect hasMore without a count.

export type PulseKind = "attempt" | "review";

export interface PulseCursor {
  ts: string;
  kind: PulseKind;
  id: string;
}

export interface PulseSortable {
  kind: PulseKind;
  id: string;
  updatedAt: string;
}

export function encodePulseCursor(cursor: PulseCursor): string {
  const json = JSON.stringify(cursor);
  // base64url without padding — safe in query strings, no external dep.
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodePulseCursor(raw: unknown): PulseCursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<PulseCursor>;
    if (typeof parsed.ts !== "string" || !Number.isFinite(Date.parse(parsed.ts))) return null;
    if (parsed.kind !== "attempt" && parsed.kind !== "review") return null;
    if (typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id.length > 256) return null;
    // Round-trip check: reject cursors that were not produced by the encoder
    // (truncated base64, trailing bytes, wrong shape).
    const reencoded = encodePulseCursor({ ts: parsed.ts, kind: parsed.kind, id: parsed.id });
    if (reencoded !== raw) return null;
    return { ts: parsed.ts, kind: parsed.kind, id: parsed.id };
  } catch {
    return null;
  }
}

export function comparePulseRow(a: PulseSortable, b: PulseSortable): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** True when row sorts strictly after the cursor. */
export function isAfterPulseCursor(row: PulseSortable, cursor: PulseCursor): boolean {
  if (row.updatedAt !== cursor.ts) return row.updatedAt > cursor.ts;
  if (row.kind !== cursor.kind) return row.kind > cursor.kind;
  return row.id > cursor.id;
}

/**
 * Merge two already-fetched table slices, sort deterministically, apply the
 * cursor, and slice one page. Callers fetch `limit + 1` per table so
 * `merged.length > limit` reliably means more rows exist.
 */
export function paginatePulseRows<T extends PulseSortable>(input: {
  rows: T[];
  cursor: PulseCursor | null;
  limit: number;
}): { page: T[]; nextCursor: PulseCursor | null; hasMore: boolean } {
  const sorted = [...input.rows].sort(comparePulseRow);
  const after = input.cursor ? sorted.filter((row) => isAfterPulseCursor(row, input.cursor!)) : sorted;
  const page = after.slice(0, input.limit);
  const hasMore = after.length > input.limit;
  const last = page[page.length - 1] ?? null;
  const nextCursor =
    hasMore && last ? { ts: last.updatedAt, kind: last.kind, id: last.id } satisfies PulseCursor : null;
  return { page, nextCursor: nextCursor, hasMore };
}

/**
 * Lexicographic tail of ONE table for a cursor page.
 *
 * The global order is (updated_at, kind, id), but each table holds a single
 * kind — so each table's query must represent exactly the part of that order
 * still relevant to it. A coarse `updated_at >= cursor.ts … LIMIT n` prefix is
 * NOT sufficient: when more rows share the cursor timestamp than the limit
 * allows, the database returns the tie's earliest rows, the in-memory cursor
 * filter discards every one of them, and the tie's later rows are never
 * fetched. Each table therefore queries its own exact continuation:
 *
 * - same kind as the cursor: `updated_at > ts OR (updated_at = ts AND id > id)`
 * - a kind sorting after the cursor kind: `updated_at >= ts` (the whole
 *   tie-block of this table is still ahead)
 * - a kind sorting before the cursor kind: `updated_at > ts` (this table's
 *   tie-block is entirely behind)
 * - first page: `updated_at > since`
 */
export type PulseTableQuery =
  | { mode: "gt"; ts: string }
  | { mode: "gte"; ts: string }
  | { mode: "or"; ts: string; id: string };

export function pulseTableQuery(
  kind: PulseKind,
  cursor: PulseCursor | null,
  since: string,
): PulseTableQuery {
  if (!cursor) return { mode: "gt", ts: since };
  if (kind === cursor.kind) return { mode: "or", ts: cursor.ts, id: cursor.id };
  if (kind > cursor.kind) return { mode: "gte", ts: cursor.ts };
  return { mode: "gt", ts: cursor.ts };
}

/** PostgREST `.or()` condition string for an `{ mode: "or" }` scope. */
export function pulseOrCondition(query: Extract<PulseTableQuery, { mode: "or" }>): string {
  return `updated_at.gt.${query.ts},and(updated_at.eq.${query.ts},id.gt.${query.id})`;
}

/**
 * In-memory mirror of one table's SQL tail: the rows a
 * `WHERE <scope> ORDER BY updated_at, id LIMIT n` query returns. The route's
 * Supabase queries implement this exact predicate; tests simulate the
 * database (filter + order + limit per table) through it so pagination is
 * verified against what the database actually returns, not a full-array
 * in-memory paginator.
 */
export function queryTableTail<T extends PulseSortable>(input: {
  rows: T[];
  kind: PulseKind;
  cursor: PulseCursor | null;
  since: string;
  limit: number;
}): T[] {
  const scope = pulseTableQuery(input.kind, input.cursor, input.since);
  const tail = input.rows.filter((row) => {
    if (row.kind !== input.kind) return false;
    if (scope.mode === "gt") return row.updatedAt > scope.ts;
    if (scope.mode === "gte") return row.updatedAt >= scope.ts;
    return row.updatedAt > scope.ts || (row.updatedAt === scope.ts && row.id > scope.id);
  });
  tail.sort((a, b) =>
    a.updatedAt !== b.updatedAt ? (a.updatedAt < b.updatedAt ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return tail.slice(0, input.limit);
}
