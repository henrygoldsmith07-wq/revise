import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Thirty-first pass. The 360px walkthrough saw a fresh student's browser
// request https://huggingface.co/Xenova/all-MiniLM-L6-v2/... on their first
// marked diagnostic answer, with AI never switched on and the result saying
// "no AI was involved". The semantic cache loaded its embedding model before
// checking whether there was anything to compare against. Nothing in the app
// stores an embedding today, so the tier could never hit; the download was a
// third-party request (and ~23MB) for nothing. The model may now load only
// when an embedded, current entry exists for the part being marked.

const pipeline = vi.fn(async () => async () => ({ tolist: () => [[1, 0, 0]] }));
vi.mock("@huggingface/transformers", () => ({ pipeline, env: {} }));

const { clearAll, getDb } = await import("@/data/db");
const { MARK_POLICY_VERSION } = await import("@/ai/task-policy");
const { lookupCachedMark, schemeHashForPart, scopeKey, storeCachedMark } = await import("@/ai/semantic-cache");

const PART = { id: "p1", marks: 2, markScheme: ["point one", "point two"] };
const POLICY = { schemeHash: schemeHashForPart(PART), policyVersion: MARK_POLICY_VERSION };
const MARKED = { partId: "p1", awarded: 2, max: 2, creditedPoints: ["point one"], missedPoints: [], comment: "Good." };

beforeEach(async () => {
  await clearAll();
  pipeline.mockClear();
});

describe("semantic cache never fetches its model without something to compare", () => {
  it("an empty cache misses without loading the embedding model", async () => {
    const found = await lookupCachedMark("q1", "p1", "An answer.", PART.markScheme, POLICY);
    expect(found.hit).toBeNull();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("entries stored without embeddings (all of them today) do not load it either", async () => {
    await storeCachedMark("q1", PART, "Some other answer.", MARKED as never, 0.9, null, POLICY);
    const found = await lookupCachedMark("q1", "p1", "A different answer.", PART.markScheme, POLICY);
    expect(found.hit).toBeNull();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("an embedded entry under a stale scheme does not justify the download", async () => {
    const db = await getDb();
    await db.put("aiCache", {
      key: "q1:p1:old", scope: scopeKey("q1", "p1"), embedding: [1, 0, 0], marked: MARKED as never, confidence: 0.9,
      markedBy: "ai", schemeHash: "scheme-v1:stale", policyVersion: MARK_POLICY_VERSION, createdAt: new Date().toISOString(),
    });
    await lookupCachedMark("q1", "p1", "A different answer.", PART.markScheme, POLICY);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("a current embedded entry still gets the semantic tier", async () => {
    const db = await getDb();
    await db.put("aiCache", {
      key: "q1:p1:emb", scope: scopeKey("q1", "p1"), embedding: [1, 0, 0], marked: MARKED as never, confidence: 0.9,
      markedBy: "ai", schemeHash: POLICY.schemeHash, policyVersion: MARK_POLICY_VERSION, createdAt: new Date().toISOString(),
    });
    const found = await lookupCachedMark("q1", "p1", "A near-identical answer.", PART.markScheme, POLICY);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(found.hit?.via).toBe("semantic");
  });
});
