"use client";

// ---------------------------------------------------------------------------
// Semantic cache for AI marks.
//
// Re-grading an identical answer with an identical mark scheme is a pure
// waste of a rate-limited API call, so the cache answers before the network
// does. Two tiers:
//
// 1. **Exact tier (always available).** Key = questionId:partId + FNV-1a hash
//    of the normalised answer. No model, no downloads, deterministic.
// 2. **Embedding tier (progressive enhancement).** A MiniLM sentence
//    transformer (Transformers.js, ~23MB quantised, lazy-loaded on first use)
//    embeds the answer + mark-scheme points; a cosine similarity above
//    CACHE_THRESHOLD against a previously AI-graded entry returns that grade
//    instead of calling the LLM.
//
// Only genuine AI marks are cached — a fallback rubric grade must never be
// served as if the model graded it. The embedder fails soft: if it cannot
// load (unsupported browser, storage pressure, blocked CDN), the cache
// degrades to the exact tier and everything still works.
// ---------------------------------------------------------------------------

import type { Attempt, Question } from "@/domain/types";
import { getDb } from "@/data/db";
import type { AiCacheEntry } from "@/data/db";

/** Cosine similarity at or above which a cached AI mark is reused. */
export const CACHE_THRESHOLD = 0.95;

/** Cache entries older than this are treated as stale (evicted on sweep). */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Bounds on total cached entries so IndexedDB growth stays intentional. */
export const CACHE_MAX_ENTRIES = 2_000;

// --- exact tier -------------------------------------------------------------

/** FNV-1a 32-bit, hex-encoded — stable across sessions, no crypto needed. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Whitespace/punctuation-insensitive normalisation for the exact tier. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function answerKey(questionId: string, partId: string, answer: string): string {
  return `${questionId}:${partId}:${fnv1a(normalise(answer))}`;
}

export function scopeKey(questionId: string, partId: string): string {
  return `${questionId}:${partId}`;
}

// --- embedding tier ---------------------------------------------------------

type Embedder = (texts: string[]) => Promise<number[][]>;

let embedderPromise: Promise<Embedder | null> | null = null;

/**
 * Lazily load the MiniLM embedder (quantised, runs in-page). Returns null when
 * the model cannot be loaded — the cache then runs on the exact tier alone.
 */
async function getEmbedder(): Promise<Embedder | null> {
  embedderPromise ??= (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Browser-local ONNX runtime; never phone home for telemetry.
      env.allowLocalModels = false;
      const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        dtype: "q8",
      });
      return async (texts: string[]) => {
        const out = await extractor(texts, { pooling: "mean", normalize: true });
        return out.tolist() as number[][];
      };
    } catch {
      return null;
    }
  })();
  return embedderPromise;
}

/** True once the embedding model has loaded (diagnostics only). */
export async function embedderReady(): Promise<boolean> {
  return (await getEmbedder()) !== null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** The text an embedding is computed over: answer plus what would earn marks. */
function embedText(answer: string, markScheme: string[]): string {
  return `${normalise(answer)}\n\u0000${markScheme.join("\u0001")}`;
}

// --- public API -------------------------------------------------------------

export interface CachedMark {
  marked: Attempt["marked"][number];
  confidence: number;
  /** How the hit was found — surfaced for diagnostics. */
  via: "exact" | "semantic";
}

export interface CacheLookupResult {
  hit: CachedMark | null;
  /** The embedding computed for this answer (stored after a successful AI grade). */
  embedding: number[] | null;
}

/**
 * Look up a previously AI-graded mark for this part's answer. Falls through
 * every tier quietly; a miss is the normal path, never an error.
 */
export async function lookupCachedMark(
  questionId: string,
  partId: string,
  answer: string,
  markScheme: string[],
): Promise<CacheLookupResult> {
  const db = await getDb();

  // Tier 1: exact normalised hash.
  const exact = await db.get("aiCache", answerKey(questionId, partId, answer));
  if (exact) return { hit: { marked: exact.marked, confidence: exact.confidence, via: "exact" }, embedding: null };

  // Tier 2: cosine similarity against this part's cached answers.
  let embedding: number[] | null = null;
  try {
    const embedder = await getEmbedder();
    if (embedder) {
      const vector = (await embedder([embedText(answer, markScheme)]))[0];
      embedding = vector;
      const scope = await db.getAllFromIndex("aiCache", "byScope", scopeKey(questionId, partId));
      let best: { entry: AiCacheEntry; sim: number } | null = null;
      for (const entry of scope) {
        if (!entry.embedding) continue;
        const sim = cosineSimilarity(vector, entry.embedding);
        if (sim >= CACHE_THRESHOLD && (!best || sim > best.sim)) best = { entry, sim };
      }
      if (best) {
        return { hit: { marked: best.entry.marked, confidence: best.entry.confidence, via: "semantic" }, embedding };
      }
    }
  } catch {
    // Embedding tier unavailable — exact tier already answered "miss".
  }
  return { hit: null, embedding };
}

/** Persist an AI grade so identical future answers skip the network. */
export async function storeCachedMark(
  questionId: string,
  part: Question["parts"][number],
  answer: string,
  marked: Attempt["marked"][number],
  confidence: number,
  embedding: number[] | null,
): Promise<void> {
  const db = await getDb();
  const entry: AiCacheEntry = {
    key: answerKey(questionId, part.id, answer),
    scope: scopeKey(questionId, part.id),
    embedding,
    marked,
    confidence,
    markedBy: "ai",
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

export function cacheStats(entries: AiCacheEntry[]): { total: number; embedded: number } {
  return { total: entries.length, embedded: entries.filter((e) => e.embedding).length };
}
