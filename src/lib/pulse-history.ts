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
 * Per-table Supabase filter for a cursor page. Because ordering spans two
 * tables, each table is queried with `updated_at >= cursor.ts` (or `> since`
 * on the first page) and the exact tie-break happens in memory via
 * isAfterPulseCursor. Fetching `limit + 1` per table guarantees the merged
 * page can be filled and hasMore detected without missing interleaved rows.
 */
export function pulseTableFloorTs(input: { cursor: PulseCursor | null; since: string }): string {
  return input.cursor ? input.cursor.ts : input.since;
}
