import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb } from "@/data/db";
import { MARK_POLICY_VERSION } from "@/ai/task-policy";
import {
  answerKey,
  lookupCachedMark,
  schemeHashForPart,
  storeCachedMark,
  type CachePolicy,
} from "@/ai/semantic-cache";
import type { Attempt } from "@/domain/types";

// ---------------------------------------------------------------------------
// Cache versioning: a cached grade is valid only under the exact mark scheme
// and marking policy that produced it. An edited scheme or a policy change
// must regrade, never reuse. Legacy pre-versioning entries never hit.
// ---------------------------------------------------------------------------

const PART = { id: "p1", marks: 2, markScheme: ["point one", "point two"] };
const MARKED = {
  partId: "p1",
  awarded: 2,
  max: 2,
  creditedPoints: ["point one"],
  missedPoints: [],
  comment: "Good.",
} as Attempt["marked"][number];

const POLICY: CachePolicy = { schemeHash: schemeHashForPart(PART), policyVersion: MARK_POLICY_VERSION };

beforeEach(async () => {
  await clearAll();
});

describe("schemeHashForPart", () => {
  it("is deterministic and sensitive to tariff and scheme text", () => {
    expect(schemeHashForPart(PART)).toBe(schemeHashForPart({ ...PART }));
    expect(schemeHashForPart(PART)).not.toBe(
      schemeHashForPart({ ...PART, markScheme: ["point one", "point two (reworded)"] }),
    );
    expect(schemeHashForPart(PART)).not.toBe(schemeHashForPart({ ...PART, marks: 3 }));
    expect(schemeHashForPart(PART)).toMatch(/^scheme-v1:[0-9a-f]{64}$/);
  });
});

describe("versioned cache reuse", () => {
  it("serves an exact hit under the same scheme and policy", async () => {
    await storeCachedMark("q1", PART, "My answer here.", MARKED, 0.9, null, POLICY);
    const found = await lookupCachedMark("q1", "p1", "My answer here.", PART.markScheme, POLICY);
    expect(found.hit?.via).toBe("exact");
    expect(found.hit?.marked.awarded).toBe(2);
  });

  it("misses when the mark scheme changed, and drops the stale entry", async () => {
    await storeCachedMark("q1", PART, "My answer here.", MARKED, 0.9, null, POLICY);
    const edited = { ...PART, markScheme: ["point one", "point two (reworded)"] };
    const editedPolicy: CachePolicy = { schemeHash: schemeHashForPart(edited), policyVersion: MARK_POLICY_VERSION };
    const found = await lookupCachedMark("q1", "p1", "My answer here.", edited.markScheme, editedPolicy);
    expect(found.hit).toBeNull();
    // The stale entry is deleted on sight, not left to mislead a later read.
    const db = await getDb();
    expect(await db.getAll("aiCache")).toEqual([]);
  });

  it("misses when the marking policy changed", async () => {
    await storeCachedMark("q1", PART, "My answer here.", MARKED, 0.9, null, POLICY);
    const found = await lookupCachedMark("q1", "p1", "My answer here.", PART.markScheme, {
      ...POLICY,
      policyVersion: "mark-policy-v999",
    });
    expect(found.hit).toBeNull();
  });

  it("never serves a pre-versioning entry, even on an exact answer match", async () => {
    const db = await getDb();
    await db.put("aiCache", {
      key: answerKey("q1", "p1", "My answer here."),
      scope: "q1:p1",
      embedding: null,
      marked: MARKED,
      confidence: 0.9,
      markedBy: "ai",
      createdAt: new Date().toISOString(),
    });
    const found = await lookupCachedMark("q1", "p1", "My answer here.", PART.markScheme, POLICY);
    expect(found.hit).toBeNull();
    // Deleted on sight, like any other stale entry.
    expect(await db.getAll("aiCache")).toEqual([]);
  });
});
