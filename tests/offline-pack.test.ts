import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// --- in-memory browser surface so the pack runner can cache ----------------
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

vi.mock("@/ai/client", () => ({
  aiVideoLesson: vi.fn(async () => ({
    data: {
      scenes: [{ title: "Scene", narration: "n", onScreenText: "t", visual: "v", seconds: 8 }],
      title: "Lesson",
    },
    source: "ai" as const,
    note: null,
  })),
}));

import { aiVideoLesson } from "@/ai/client";
import {
  applyPackedToManifest,
  emptyPackManifest,
  OFFLINE_PACK_KEY,
  packedTopicIds,
  packTopicStoryboards,
  readPackManifest,
  removeFromManifest,
  writePackManifest,
} from "@/data/offline-pack";
import { videoStoryboardKey } from "@/data/video-storyboard-cache";
import type { Id } from "@/domain/types";

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = { localStorage } as Window;
  vi.mocked(aiVideoLesson).mockClear();
});

const hasStoryboard = (id: Id) => store.has(videoStoryboardKey(id));

describe("offline pack manifest", () => {
  it("records packed topics with a timestamp and preserves prior entries", () => {
    const m = applyPackedToManifest(emptyPackManifest(), ["aqa-alevel-biology.biological-molecules"], "2026-09-03T08:00:00Z");
    const m2 = applyPackedToManifest(m, ["aqa-alevel-biology.cells"], "2026-09-03T08:05:00Z");
    expect(m2.topics["aqa-alevel-biology.biological-molecules"]?.packedAt).toBe("2026-09-03T08:00:00Z");
    expect(m2.topics["aqa-alevel-biology.cells"]?.packedAt).toBe("2026-09-03T08:05:00Z");
    expect(m2.updatedAt).toBe("2026-09-03T08:05:00Z");
  });

  it("removes topics from the pack", () => {
    const m = applyPackedToManifest(emptyPackManifest(), ["t1", "t2", "t3"], "now");
    const m2 = removeFromManifest(m, ["t2"]);
    expect(Object.keys(m2.topics).sort()).toEqual(["t1", "t3"]);
  });

  it("a topic counts as packed only when the storyboard cache agrees", () => {
    const m = applyPackedToManifest(emptyPackManifest(), ["t1", "t2"], "now");
    store.set(videoStoryboardKey("t1"), JSON.stringify({ data: { scenes: [{}], title: "x" }, source: "ai" }));
    // t2 is in the manifest but its cache was evicted -> honestly unpacked.
    expect(packedTopicIds(m, hasStoryboard)).toEqual(["t1"]);
  });

  it("persists and re-reads the manifest through localStorage", () => {
    const m = applyPackedToManifest(emptyPackManifest(), ["t1"], "now");
    writePackManifest(m);
    expect(JSON.parse(store.get(OFFLINE_PACK_KEY) ?? "{}").topics.t1).toBeDefined();
    const read = readPackManifest();
    expect(read.topics.t1?.packedAt).toBe("now");
  });

  it("corrupt or wrong-version storage falls back to an empty pack", () => {
    store.set(OFFLINE_PACK_KEY, "not json");
    expect(readPackManifest()).toEqual(emptyPackManifest());
    store.set(OFFLINE_PACK_KEY, JSON.stringify({ v: 99, topics: {} }));
    expect(readPackManifest()).toEqual(emptyPackManifest());
  });
});

describe("packTopicStoryboards — the pack runner", () => {
  it("generates and caches a storyboard per topic, sequentially, reporting progress", async () => {
    const ids = ["t1", "t2", "t3"] as Id[];
    const seen: string[] = [];
    const outcome = await packTopicStoryboards(ids, (p) => {
      if (p.current) seen.push(p.current);
    });
    expect(outcome.packed.sort()).toEqual(ids.slice().sort());
    expect(outcome.skipped).toEqual([]);
    // One model call per topic, in order, no parallelism.
    expect(aiVideoLesson).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(["t1", "t2", "t3"]);
    for (const id of ids) expect(store.has(videoStoryboardKey(id))).toBe(true);
  });

  it("confirms already-packed topics without calling the model again", async () => {
    store.set(videoStoryboardKey("t1"), JSON.stringify({ data: { scenes: [{}], title: "x" }, source: "ai" }));
    const outcome = await packTopicStoryboards(["t1", "t2"] as Id[]);
    expect(aiVideoLesson).toHaveBeenCalledTimes(1);
    expect(outcome.packed.sort()).toEqual(["t1", "t2"]);
  });

  it("never caches a fallback storyboard — an offline pack must not pretend", async () => {
    vi.mocked(aiVideoLesson).mockResolvedValue({
      data: {
        scenes: [{ title: "Scene", narration: "n", onScreenText: "t", visual: "v", seconds: 8 }],
        title: "Lesson",
      },
      source: "fallback",
      note: "offline",
    });
    const outcome = await packTopicStoryboards(["t1"] as Id[]);
    expect(outcome.packed).toEqual([]);
    expect(outcome.skipped).toEqual(["t1"]);
    expect(store.has(videoStoryboardKey("t1"))).toBe(false);
  });
});

describe("lesson hub wiring", () => {
  it("the Lesson hub renders the commute pack above the topic list", () => {
    const source = readFileSync(join(process.cwd(), "src/app/lesson/page.tsx"), "utf8");
    expect(source).toContain("<CommutePack");
    // In the JSX, the pack card comes before LessonMode so it is visible
    // above the topics list (imports above both are irrelevant to ordering).
    expect(source.indexOf("<CommutePack")).toBeLessThan(source.indexOf("<LessonMode"));
  });

  it("the player and the pack share one storyboard cache module", () => {
    const player = readFileSync(join(process.cwd(), "src/components/VideoLesson.tsx"), "utf8");
    expect(player).toContain('from "@/data/video-storyboard-cache"');
    expect(player).not.toContain("const cacheKey =");
    // Both sides key by topic id under the same prefix.
    expect(videoStoryboardKey("aqa-alevel-biology.cells")).toBe("revise.videoLessons.aqa-alevel-biology.cells");
  });
});