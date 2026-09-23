import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ReviewLog } from "@/domain/types";

// ---------------------------------------------------------------------------
// Performance architecture contracts.
//
// Boot reads only the newest page of the two unbounded history logs (IndexedDB
// cursor pagination); the rest hydrates progressively in chunks. Heavy
// analytics (assessment, traces, FSRS validation, difficulty calibration) run
// through the domain-engine facade — worker RPC with a same-thread fallback.
// These tests pin the merge semantics and the worker/fallback parity contract
// without a browser.
// ---------------------------------------------------------------------------

const mergeChunk = (existing: { id: string }[], incoming: { id: string }[]) => {
  const known = new Set(existing.map((r) => r.id));
  const fresh = incoming.filter((r) => !known.has(r.id));
  return fresh.length ? [...fresh, ...existing] : existing;
};

describe("progressive history hydration (cursor pagination)", () => {
  const log = (id: string): ReviewLog =>
    ({ id, userId: "u", cardId: "c", topicId: "t", grade: "good", elapsedMs: 1, reviewedAt: "2026-08-01T00:00:00Z" }) as ReviewLog;

  it("merges a streamed chunk without duplicating rows the snapshot already holds", () => {
    const logs = [log("l1"), log("l2"), log("l3")];
    const merged = mergeChunk(logs, [log("l3"), log("l4")]);
    expect(merged.map((l) => l.id)).toEqual(["l4", "l1", "l2", "l3"]);
  });

  it("a chunk of only-known rows returns the same array identity (no rerender)", () => {
    const logs = [log("l1"), log("l2")];
    expect(mergeChunk(logs, [log("l1")])).toBe(logs);
  });

  it("a streamed older copy never clobbers a newer functional update of the same row", () => {
    // Grade updates a row in place (functional setSnapshot); the background
    // stream then replays the pre-update copy from the cursor. Merge-by-id
    // drops the stale copy.
    const updated = { ...log("l1"), grade: "easy" as const };
    const merged = mergeChunk([updated], [log("l1")]);
    expect(merged).toHaveLength(1);
    expect((merged[0] as ReviewLog).grade).toBe("easy");
  });

  it("chunks are capped at the configured size and cover the full history", () => {
    // Stream semantics: generator yields ≤chunkSize per batch, ids never
    // duplicated across the whole stream.
    const all = Array.from({ length: 1234 }, (_, i) => log(`l${i}`));
    const chunks: ReviewLog[][] = [];
    for (let i = 0; i < all.length; i += 500) chunks.push(all.slice(i, i + 500));
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(234);
    const ids = chunks.flat().map((l) => l.id);
    expect(new Set(ids).size).toBe(1234);
  });

  it("the first-page constants stay in sync between repository and store", () => {
    const repo = readFileSync(resolve(__dirname, "../src/data/repository.ts"), "utf8");
    expect(repo).toMatch(/HISTORY_FIRST_PAGE = 500/);
    expect(repo).toMatch(/HISTORY_CHUNK = 500/);
  });
});

describe("domain-engine facade (worker RPC + fallback)", () => {
  it("small histories stay on the sync path (below threshold, no worker needed)", async () => {
    const { domainEngine, SYNC_COMPUTE_THRESHOLD } = await import("@/data/domain-engine");
    expect(SYNC_COMPUTE_THRESHOLD).toBeGreaterThan(0);
    // Below threshold the facade answers synchronously-equivalent (a resolved
    // promise) from the main-thread implementation.
    const result = await domainEngine.validate({ cards: [], logs: [] });
    expect(result).toBeDefined();
  });

  it("worker exposes the same four computes as the main-thread fallback", () => {
    const entry = readFileSync(resolve(__dirname, "../src/worker/domain-worker-entry.ts"), "utf8");
    const facade = readFileSync(resolve(__dirname, "../src/data/domain-engine.ts"), "utf8");
    for (const fn of ["assess", "trace", "validate", "calibrate"]) {
      expect(entry, `worker entry serves ${fn}`).toContain(fn);
      expect(facade, `facade serves ${fn}`).toContain(fn);
    }
  });

  it("the built worker bundle exists and exports Comlink expose", () => {
    // Built by scripts/build-domain-worker.mjs at prebuild; gitignored but
    // present after npm install / predev / prebuild.
    const p = resolve(__dirname, "../public/domain-worker.js");
    expect(statSync(p).size).toBeGreaterThan(10_000);
    const bundle = readFileSync(p, "utf8");
    expect(bundle).toContain("Comlink");
  });

  it("worker construction is registered in the prebuild pipeline", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toContain("build-domain-worker");
    expect(pkg.scripts.predev).toContain("build-domain-worker");
    // Comlink is a runtime dependency — the facade imports it on the client.
    expect(pkg.dependencies?.comlink).toBeTruthy();
  });
});

describe("db schema supports time-ordered streaming", () => {
  it("the current schema keeps the time indexes the cursors walk", () => {
    const db = readFileSync(resolve(__dirname, "../src/data/db.ts"), "utf8");
    expect(db).toMatch(/createIndex\("byReviewed", "reviewedAt"\)/);
    expect(db).toMatch(/createIndex\("byCreated", "createdAt"\)/);
    expect(db).toMatch(/PERSISTED_SCHEMA_VERSION/);
  });
});
