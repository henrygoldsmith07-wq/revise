// ---------------------------------------------------------------------------
// Offline commute pack.
//
// The app is offline-first: cards, questions, lesson text and review history
// all live in IndexedDB and every AI call has a local fallback, so studying
// already works with no network. The one quality-gated network dependency is
// the *video lesson*: an AI storyboard generated per topic and cached only
// after a successful AI call. A commute pack therefore means one thing —
// while you still have a signal, pre-generate and cache the storyboards for
// the topics you plan to study, so those lessons play instantly on the train.
//
// The manifest is device-local (packs are per-device caches, not synced
// state): key -> topicId -> packedAt. A topic counts as packed only when the
// manifest entry *and* the actual storyboard cache agree — if a browser ever
// evicts localStorage, the topic honestly reads as unpacked again.
// ---------------------------------------------------------------------------

import { aiVideoLesson } from "@/ai/client";
import type { Id } from "@/domain/types";
import { readCachedStoryboard, writeCachedStoryboard } from "./video-storyboard-cache";

export const OFFLINE_PACK_KEY = "revise.offlinePack.v1";

export interface OfflinePackManifest {
  v: 1;
  /** topicId -> when its storyboard was packed. */
  topics: Record<Id, { packedAt: string }>;
  updatedAt: string;
}

export function emptyPackManifest(): OfflinePackManifest {
  return { v: 1, topics: {}, updatedAt: "" };
}

export function readPackManifest(): OfflinePackManifest {
  if (typeof window === "undefined") return emptyPackManifest();
  try {
    const raw = window.localStorage.getItem(OFFLINE_PACK_KEY);
    if (!raw) return emptyPackManifest();
    const parsed = JSON.parse(raw) as OfflinePackManifest;
    if (parsed?.v === 1 && parsed.topics && typeof parsed.topics === "object") return parsed;
    return emptyPackManifest();
  } catch {
    return emptyPackManifest();
  }
}

export function writePackManifest(manifest: OfflinePackManifest): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFLINE_PACK_KEY, JSON.stringify(manifest));
  } catch {
    /* private browsing: the pack just won't persist past this tab */
  }
}

/** A topic is packed when the manifest lists it AND its storyboard is cached. */
export function packedTopicIds(manifest: OfflinePackManifest, hasStoryboard: (topicId: Id) => boolean): Id[] {
  return Object.keys(manifest.topics).filter((id) => hasStoryboard(id));
}

/** Pure manifest update: record topicIds as packed at `now`. */
export function applyPackedToManifest(manifest: OfflinePackManifest, topicIds: Id[], now: string): OfflinePackManifest {
  const topics = { ...manifest.topics };
  for (const id of topicIds) topics[id] = { packedAt: now };
  return { v: 1, topics, updatedAt: now };
}

/** Pure manifest update: drop topicIds from the pack. */
export function removeFromManifest(manifest: OfflinePackManifest, topicIds: Id[]): OfflinePackManifest {
  const topics = { ...manifest.topics };
  for (const id of topicIds) delete topics[id];
  return { v: 1, topics, updatedAt: new Date().toISOString() };
}

export interface PackProgress {
  done: number;
  total: number;
  current: Id | null;
}

export interface PackOutcome {
  /** Topics whose storyboard is now cached (AI quality, plays offline). */
  packed: Id[];
  /** Topics that could not be packed now — offline or provider down. */
  skipped: Id[];
}

/**
 * Pre-generate and cache storyboards for the given topics. Sequential (never
 * parallel) so a handful of topics cannot fire a burst of model calls at
 * once. Topics already packed are confirmed, not regenerated.
 */
export async function packTopicStoryboards(
  topicIds: Id[],
  onProgress?: (progress: PackProgress) => void,
): Promise<PackOutcome> {
  const packed: Id[] = [];
  const skipped: Id[] = [];
  for (let i = 0; i < topicIds.length; i++) {
    const topicId = topicIds[i];
    onProgress?.({ done: i, total: topicIds.length, current: topicId });
    if (readCachedStoryboard(topicId)) {
      packed.push(topicId);
      onProgress?.({ done: i + 1, total: topicIds.length, current: null });
      continue;
    }
    const envelope = await aiVideoLesson(topicId);
    if (envelope.source === "ai" && envelope.data?.scenes?.length) {
      writeCachedStoryboard(topicId, envelope);
      packed.push(topicId);
    } else {
      // Offline / provider down / fallback: never cache a fallback, so the
      // topic honestly reads as "not packed" instead of pretending.
      skipped.push(topicId);
    }
    onProgress?.({ done: i + 1, total: topicIds.length, current: null });
  }
  return { packed, skipped };
}