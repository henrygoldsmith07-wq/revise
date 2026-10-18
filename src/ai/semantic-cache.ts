"use client";

// ---------------------------------------------------------------------------
// Device-local cache for AI marks.
//
// Re-grading an identical answer with an identical mark scheme is a pure
// waste of a rate-limited API call, so the cache answers before the network
// does. One tier: key = questionId:partId + FNV-1a hash of the normalised
// answer. No model, no downloads, no network, deterministic. A hit
// additionally requires the entry's mark-scheme hash and policy version to
// equal the current ones — an edited scheme or policy regrades.
//
// There used to be a second, embedding tier (a MiniLM sentence transformer
// fetched from huggingface.co on first use). It was removed: it downloaded a
// model from a third party on the marking path with no consent check, even
// with AI off, and it could never hit, because every entry was stored without
// an embedding. `AiCacheEntry.embedding` stays in the persisted shape (schema
// changes are additive) and is always written as null.
//
// Only genuine AI marks are cached — a fallback rubric grade must never be
// served as if the model graded it.
// ---------------------------------------------------------------------------

import type { Attempt, Question } from "@/domain/types";
import { canonicalJson, sha256Hex } from "@/domain/content-fingerprint";
import { getDb } from "@/data/db";
import type { AiCacheEntry } from "@/data/db";

/** Cache entries older than this are treated as stale (evicted on sweep). */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Bounds on total cached entries so IndexedDB growth stays intentional. */
export const CACHE_MAX_ENTRIES = 2_000;

/** FNV-1a 32-bit, hex-encoded — stable across sessions, no crypto needed. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Case- and whitespace-insensitive normalisation for the cache key. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function answerKey(questionId: string, partId: string, answer: string): string {
  return `${questionId}:${partId}:${fnv1a(normalise(answer))}`;
}

export function scopeKey(questionId: string, partId: string): string {
  return `${questionId}:${partId}`;
}

/**
 * What a cached grade is valid under. A cached mark may be reused only for
 * the exact mark scheme and marking policy that produced it: an edited
 * scheme or a policy change must regrade, never reuse. Entries written
 * before versioning carry neither field and never hit.
 */
export interface CachePolicy {
  schemeHash: string;
  policyVersion: string;
}

/**
 * Stable fingerprint of one part's tariff: id, marks, mark-scheme text and,
 * when it has any, its "do not accept" lines (a new reject rule changes what
 * earns a mark, so a mark cached before it must not be reused). A part with
 * no rules hashes exactly as before.
 */
export function schemeHashForPart(part: Pick<Question["parts"][number], "id" | "marks" | "markScheme" | "rejects">): string {
  return `scheme-v1:${sha256Hex(canonicalJson({ id: part.id, marks: part.marks, markScheme: part.markScheme,
    ...(part.rejects?.length ? { rejects: part.rejects } : {}) }))}`;
}

export interface CachedMark {
  marked: Attempt["marked"][number];
  confidence: number;
  /** How the hit was found — surfaced for diagnostics. */
  via: "exact";
}

export interface CacheLookupResult {
  hit: CachedMark | null;
}

/**
 * Look up a previously AI-graded mark for this part's answer. A miss is the
 * normal path, never an error. Reads IndexedDB only: no model, no network.
 *
 * Versioning is conservative on purpose: a hit requires the entry's scheme
 * hash and policy version to equal the current ones. An entry from an edited
 * mark scheme, a changed policy, or the pre-versioning era is deleted on
 * sight, never served.
 */
export async function lookupCachedMark(
  questionId: string,
  partId: string,
  answer: string,
  policy: CachePolicy,
): Promise<CacheLookupResult> {
  const db = await getDb();
  // The retention period is enforced on read as well as on write: an entry
  // past its TTL is never served, and is deleted when found.
  const cutoff = Date.now() - CACHE_TTL_MS;
  const fresh = (entry: AiCacheEntry) => Date.parse(entry.createdAt) >= cutoff;
  const current = (entry: AiCacheEntry) =>
    entry.schemeHash === policy.schemeHash && entry.policyVersion === policy.policyVersion;

  const exact = await db.get("aiCache", answerKey(questionId, partId, answer));
  if (!exact) return { hit: null };
  if (!fresh(exact) || !current(exact)) {
    await db.delete("aiCache", exact.key);
    return { hit: null };
  }
  return { hit: { marked: exact.marked, confidence: exact.confidence, via: "exact" } };
}

/** Persist an AI grade so identical future answers skip the network. */
export async function storeCachedMark(
  questionId: string,
  part: Pick<Question["parts"][number], "id">,
  answer: string,
  marked: Attempt["marked"][number],
  confidence: number,
  policy: CachePolicy,
): Promise<void> {
  const db = await getDb();
  const entry: AiCacheEntry = {
    key: answerKey(questionId, part.id, answer),
    scope: scopeKey(questionId, part.id),
    // There is no embedding tier; the field stays in the persisted shape.
    embedding: null,
    marked,
    confidence,
    markedBy: "ai",
    schemeHash: policy.schemeHash,
    policyVersion: policy.policyVersion,
    createdAt: new Date().toISOString(),
  };
  await db.put("aiCache", entry);
  await evictIfNeeded(db);
}

/** LRU-ish eviction: hard cap, then TTL sweep. */
async function evictIfNeeded(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const all = await db.getAll("aiCache");
  const cutoff = Date.now() - CACHE_TTL_MS;
  const stale = all.filter((e) => Date.parse(e.createdAt) < cutoff);
  for (const entry of stale) await db.delete("aiCache", entry.key);
  if (all.length - stale.length < CACHE_MAX_ENTRIES) return;
  const over = all
    .filter((e) => !stale.includes(e))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, all.length - stale.length - CACHE_MAX_ENTRIES + 1);
  for (const entry of over) await db.delete("aiCache", entry.key);
}

/** Drop the whole cache (Settings action; also used by "forget this device"). */
export async function clearCache(): Promise<void> {
  const db = await getDb();
  await db.clear("aiCache");
}
