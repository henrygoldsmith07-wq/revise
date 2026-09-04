import { getDb } from "./db";
import type { Id } from "@/domain/types";
import { readReviseMeta, writeReviseMeta } from "./storage-namespace";

// ---------------------------------------------------------------------------
// Content-id namespacing.
//
// Every deterministic id the authored content bank mints used to collide with
// operator tooling: a maintenance script purging `seed-*` rows to clean up its
// own fixtures also deleted the whole question bank, because bank ids looked
// identical to fixture ids (`seed-q:...`). Ids are content now — attempts,
// mistakes, review logs, plans and papers all reference them — so a prefix is
// part of the public contract and it needs to be unambiguous about who owns it.
//
// The namespace is `cnt:`. Producers mint `cnt:<entity>:<slug>` (questions,
// misconception entries, cards). A one-time data migration rewrites every
// persisted legacy id and every reference to one; it is idempotent (guarded
// by a meta flag), key-aware (legacy ids are also primary keys) and recursive
// (ids hide inside payloads, mark schemes, validation records, cache keys).
//
// Run order matters: this must happen BEFORE ensureSeeded, so a device that
// seed-migrated mid-bank reseeds against already-remapped rows and never
// writes a legacy id again. Bump CONTENT_ID_MIGRATION_VERSION if the mapping
// ever grows.
// ---------------------------------------------------------------------------

/** Current migration level for the cnt: namespacing. */
export const CONTENT_ID_MIGRATION_VERSION = 1;

/** Legacy id prefixes the content bank used before the cnt: namespace. */
export const LEGACY_CONTENT_PREFIXES = ["seed-q:", "seed-misconception:", "seed:"] as const;

export type LegacyContentPrefix = (typeof LEGACY_CONTENT_PREFIXES)[number];

/** Legacy prefix → namespaced replacement. Longest match wins, so `seed-q:` is never mangled by `seed:`. */
const LEGACY_TO_NAMESPACED: Readonly<Record<LegacyContentPrefix, string>> = {
  "seed-q:": "cnt:question:",
  "seed-misconception:": "cnt:misconception:",
  "seed:": "cnt:card:",
};

/** True when this id was minted by the old, collision-prone scheme. */
export function isLegacyContentId(id: string): boolean {
  return LEGACY_CONTENT_PREFIXES.some((p) => id.startsWith(p));
}

/** True when this id belongs to the namespaced content bank. */
export function isContentId(id: string): boolean {
  return id.startsWith("cnt:");
}

/**
 * Rewrite every legacy content id inside `text`. One pass, longest-prefix:
 * `seed-q:a:b` becomes `cnt:question:a:b`, and a `seed:` fallback never sees
 * it (alternation order matters). Anything already namespaced — or prose that
 * merely contains the word "seed" — passes through untouched.
 */
export function remapContentIdString(text: string): string {
  if (!text.includes("seed")) return text;
  // The capture group excludes the colon; the table is keyed by the full
  // prefix including it.
  return text.replace(/(seed-q|seed-misconception|seed):/g, (_m, p: string) => LEGACY_TO_NAMESPACED[`${p}:` as LegacyContentPrefix]);
}

type Changes = { value: unknown; changes: number };

/**
 * Deep remap of one persisted record. Returns the record (same shape) with
 * every legacy id — as a string value, as an object key, or buried anywhere
 * in a nested structure — rewritten to its namespaced form.
 *
 * Handles the places ids actually hide in this app's stores:
 *  - `attempts.questionId`, `answers` keys, `marked[].partId`
 *  - `mistakes.questionId/partId/cardId/misconceptionEntryId/attemptId`
 *  - `reviewLogs.cardId`
 *  - `papers.questionIds[]`, `plannedSessions.topicId`-keyed payloads
 *  - `questions` themselves (primary key + embedded validation records)
 *  - `aiCache` key/scope strings (`<qid>:<pid>:<hash>`) and `marked.partId`
 *  - `aiDlq` embedded `Question` snapshots
 *  - outbox payloads (any of the above, pre-push)
 */
/**
 * Fields whose string values are student- or author-authored PROSE, never
 * ids: a biology answer legitimately says "seed dispersal", and rewriting
 * that would corrupt the record the migration exists to protect. String
 * values under these keys (at any depth — outbox payloads nest attempts) are
 * passed through untouched. Object KEYS still remap: the answers map is keyed
 * by part id, which is exactly what must be rewritten.
 */
const FREE_TEXT_KEYS: ReadonlySet<string> = new Set([
  "answers",
  "description",
  "reason",
  "lastError",
  "note",
  "notes",
  "explanation",
  "statement",
  "stem",
  "prompt",
  "modelAnswer",
  "answer",
  "markScheme",
  "scheme",
  "point",
  "creditedPoints",
  "questionText",
  "sourceText",
  "markSchemeText",
  "learningClaims",
]);

export function remapContentIds<T>(root: T): Changes {
  const changes = { count: 0 };
  const visited = new Map<unknown, unknown>();

  const remapString = (s: string): string => {
    const next = remapContentIdString(s);
    if (next !== s) changes.count += 1;
    return next;
  };

  const walk = (node: unknown, valuesRemap: boolean): unknown => {
    if (typeof node === "string") return valuesRemap ? remapString(node) : node;
    if (!node || typeof node !== "object") return node;
    if (node instanceof Date || node instanceof RegExp) return node;

    const memo = visited.get(node);
    if (memo !== undefined) return memo;

    if (Array.isArray(node)) {
      const copy: unknown[] = [];
      visited.set(node, copy);
      for (let i = 0; i < node.length; i++) copy[i] = walk(node[i], valuesRemap);
      return copy;
    }

    const source = node as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    visited.set(node, copy);
    for (const [key, value] of Object.entries(source)) {
      // Legacy ids also serve as object keys (attempt answer maps, keyed
      // part results), so keys remap with the same rules as values — and
      // count toward the report. Free-text subtrees keep their prose but
      // still remap their keys.
      const nextKey = remapContentIdString(key);
      if (nextKey !== key) changes.count += 1;
      copy[nextKey] = walk(value, valuesRemap && !FREE_TEXT_KEYS.has(key));
    }
    return copy;
  };

  const value = walk(root, true);
  return { value: value as T, changes: changes.count };
}

/** Stores that can carry a legacy content id, in migration order. */
export const CONTENT_ID_MIGRATION_STORES = [
  "questions",
  "cards",
  "reviewLogs",
  "attempts",
  "mistakes",
  "papers",
  "plannedSessions",
  "examDates",
  "outbox",
  "aiCache",
  "aiDlq",
] as const;

/** Which field keys each store above (aiCache keys on its composite string). */
const STORE_KEY_FIELD: Readonly<Record<ContentIdMigrationStore, string>> = {
  questions: "id",
  cards: "id",
  reviewLogs: "id",
  attempts: "id",
  mistakes: "id",
  papers: "id",
  plannedSessions: "id",
  examDates: "id",
  outbox: "id",
  aiCache: "key",
  aiDlq: "id",
};

export type ContentIdMigrationStore = (typeof CONTENT_ID_MIGRATION_STORES)[number];

export interface ContentIdMigrationReport {
  /** False when the migration had already run on this device. */
  migrated: boolean;
  /** Rows rewritten (only rows that actually changed are written back). */
  rowsRewritten: number;
  /** Individual id occurrences remapped across keys and values. */
  idsRemapped: number;
}

/**
 * One-time, idempotent rewrite of every persisted legacy content id. Runs at
 * the very start of ensureSeeded, before the bank tops itself up, so the two
 * can never disagree about what an id looks like.
 *
 * The remap is a pure prefix substitution, so it is injective: no two rows
 * can ever land on the same new key and the "does the remapped key already
 * exist" dance is unnecessary. When the primary key itself changed, the old
 * row is deleted after the remapped one is written, so no legacy id survives
 * anywhere — not as a value, not as a key.
 */
export async function migrateContentIds(userId?: Id): Promise<ContentIdMigrationReport> {
  const done = await readReviseMeta<number>("contentIdMigration");
  if (done === CONTENT_ID_MIGRATION_VERSION) {
    // Defense in depth: a device that recorded the flag but was interrupted
    // mid-remap (upgrade aborted between the flag write and the last store,
    // or a crash) would otherwise keep legacy ids forever — and the next
    // seeding would then treat legacy and namespaced rows as different
    // content and double the bank. A scan of the two stores that hold the
    // bank settles it cheaply; the remap itself is idempotent.
    const db = await getDb();
    const [questions, cards] = await Promise.all([db.getAll("questions"), db.getAll("cards")]);
    const hasLegacy =
      questions.some((q) => isLegacyContentId(q.id)) || cards.some((c) => isLegacyContentId(c.id));
    if (!hasLegacy) {
      return { migrated: false, rowsRewritten: 0, idsRemapped: 0 };
    }
  }

  let rowsRewritten = 0;
  let idsRemapped = 0;

  const db = await getDb();
  for (const store of CONTENT_ID_MIGRATION_STORES) {
    let rows: unknown[];
    try {
      rows = await db.getAll(store);
    } catch {
      // A store this early device never created — nothing to remap in it.
      continue;
    }
    const keyField = STORE_KEY_FIELD[store];
    for (const row of rows) {
      const record = row as Record<string, unknown>;
      const oldKey = typeof record[keyField] === "string" ? (record[keyField] as string) : undefined;
      const { value, changes } = remapContentIds(row);
      if (changes === 0) continue;
      idsRemapped += changes;
      await db.put(store, value as never);
      rowsRewritten += 1;
      if (oldKey !== undefined && oldKey.includes("seed")) {
        await db.delete(store, oldKey);
      }
    }
  }

  await writeReviseMeta("contentIdMigration", CONTENT_ID_MIGRATION_VERSION);
  return { migrated: true, rowsRewritten, idsRemapped };
}
