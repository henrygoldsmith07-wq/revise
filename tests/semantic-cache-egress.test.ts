import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// Thirty-first pass. The 360px walkthrough saw a fresh student's browser
// request https://huggingface.co/Xenova/all-MiniLM-L6-v2/... on their first
// marked diagnostic answer, with AI never switched on and the result saying
// "no AI was involved". The semantic cache loaded its embedding model before
// checking whether there was anything to compare against, and nothing in the
// app ever stored an embedding, so the tier could never hit. The embedding
// tier and @huggingface/transformers are now gone: the cache is an exact
// answer-hash lookup in IndexedDB and cannot reach a third party.

const { clearAll } = await import("@/data/db");
const { MARK_POLICY_VERSION } = await import("@/ai/task-policy");
const { lookupCachedMark, schemeHashForPart, storeCachedMark } = await import("@/ai/semantic-cache");

const PART = { id: "p1", marks: 2, markScheme: ["point one", "point two"] };
const POLICY = { schemeHash: schemeHashForPart(PART), policyVersion: MARK_POLICY_VERSION };
const MARKED = { partId: "p1", awarded: 2, max: 2, creditedPoints: ["point one"], missedPoints: [], comment: "Good." };

beforeEach(async () => {
  await clearAll();
});

describe("the AI mark cache never fetches a model", () => {
  it("has no embedding model to load", () => {
    const source = readFileSync(join(process.cwd(), "src/ai/semantic-cache.ts"), "utf8");
    expect(source).not.toMatch(/import\(["']@huggingface\/transformers["']\)/);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@huggingface/transformers"]).toBeUndefined();
  });

  it("misses on an empty cache and on a different answer, and hits only the identical one", async () => {
    expect((await lookupCachedMark("q1", "p1", "An answer.", POLICY)).hit).toBeNull();
    await storeCachedMark("q1", PART, "Some answer.", MARKED as never, 0.9, POLICY);
    expect((await lookupCachedMark("q1", "p1", "A different answer.", POLICY)).hit).toBeNull();
    expect((await lookupCachedMark("q1", "p1", "Some answer.", POLICY)).hit?.via).toBe("exact");
  });
});
