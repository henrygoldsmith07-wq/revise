// ---------------------------------------------------------------------------
// Video-storyboard cache (localStorage).
//
// A video lesson is an AI storyboard generated per topic. Successful AI
// generations are cached on-device so re-watches start instantly, stay
// consistent, and — the point that matters for a commute — play with no
// network at all. The offline commute pack writes through this same module so
// the player and the pack can never disagree about what is packed.
//
// Only `source: "ai"` generations are cached. A fallback storyboard (offline,
// no provider, 429) is correct-enough to watch but not what a student should
// replay forever, so fallbacks deliberately never enter the cache.
// ---------------------------------------------------------------------------

import type { AiEnvelope, VideoLessonResponse } from "@/ai/types";

export const videoStoryboardKey = (topicId: string): string => `revise.videoLessons.${topicId}`;

/** The cached storyboard for a topic, or null when missing/corrupt. */
export function readCachedStoryboard(topicId: string): AiEnvelope<VideoLessonResponse> | null {
  try {
    const raw = window.localStorage.getItem(videoStoryboardKey(topicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiEnvelope<VideoLessonResponse>;
    if (parsed?.data?.scenes?.length && parsed.data.title) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Persist an AI storyboard (caller decides the source is "ai"). */
export function writeCachedStoryboard(topicId: string, envelope: AiEnvelope<VideoLessonResponse>): void {
  try {
    window.localStorage.setItem(videoStoryboardKey(topicId), JSON.stringify(envelope));
  } catch {
    /* private browsing: caching is best-effort only */
  }
}

/** Drop a cached storyboard (unpacking a topic forces a fresh generation). */
export function clearCachedStoryboard(topicId: string): void {
  try {
    window.localStorage.removeItem(videoStoryboardKey(topicId));
  } catch {
    /* no-op */
  }
}