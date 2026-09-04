import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cosineSimilarity, fnv1a, answerKey, scopeKey, CACHE_THRESHOLD } from "@/ai/semantic-cache";
import { dlqBackoffMs, dlqNextAttemptAt, DLQ_BASE_DELAY_MS, DLQ_MAX_DELAY_MS, DLQ_MAX_ATTEMPTS, AI_DLQ_RESOLVED_EVENT } from "@/ai/mark-dlq";
import type { MarkTier } from "@/ai/marking-resilience";

// ---------------------------------------------------------------------------
// AI marking resilience: supply-chain fallbacks for grading.
//
// The semantic cache and the dead-letter queue are the two levers that keep
// marking working when the free-tier provider is rate-limiting or down. The
// pure math below is unit-tested directly; the IDB-backed flows follow the
// repo's structural-contract pattern (see performance-optimization.test.ts)
// because the vitest environment is plain node without IndexedDB.
// ---------------------------------------------------------------------------

describe("semantic cache math", () => {
  it("cosine similarity: identical vectors are 1, orthogonal are 0", () => {
    expect(cosineSimilarity([1, 0, 2], [2, 0, 4])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0); // zero vector guards div-by-zero
  });

  it("cosine similarity orders candidates by angle, not magnitude", () => {
    const query = [1, 1, 0];
    const near = [0.9, 1, 0.1];
    const far = [0.1, 0.2, 1];
    expect(cosineSimilarity(query, near)).toBeGreaterThan(cosineSimilarity(query, far));
  });

  it("FNV-1a is deterministic and sensitive to content", () => {
    expect(fnv1a("the mitochondria is the powerhouse")).toBe(fnv1a("the mitochondria is the powerhouse"));
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("the exact tier keys on normalised text, so case/whitespace variants hit", () => {
    const a = answerKey("q1", "p1", "  Diffusion is PASSIVE  ");
    const b = answerKey("q1", "p1", "diffusion is passive");
    expect(a).toBe(b);
    expect(a).not.toBe(answerKey("q1", "p2", "diffusion is passive")); // part-scoped
    expect(a).not.toBe(answerKey("q2", "p1", "diffusion is passive")); // question-scoped
    expect(scopeKey("q1", "p1")).toBe(scopeKey("q1", "p1"));
    expect(scopeKey("q1", "p1")).not.toBe(scopeKey("q1", "p2"));
  });

  it("the semantic threshold is strict enough to avoid wrong-but-similar grades", () => {
    expect(CACHE_THRESHOLD).toBeGreaterThanOrEqual(0.9);
    expect(CACHE_THRESHOLD).toBeLessThanOrEqual(0.99);
  });
});

describe("dead-letter queue backoff", () => {
  it("grows exponentially with attempts", () => {
    const noJitter = (attempts: number) => dlqBackoffMs(attempts, () => 0.999999);
    expect(noJitter(0)).toBeGreaterThan(0);
    expect(noJitter(2)).toBeGreaterThan(noJitter(1));
    expect(noJitter(5)).toBeGreaterThan(noJitter(2));
  });

  it("full jitter stays within [0, cap) and honours the 24h ceiling", () => {
    for (const attempts of [0, 1, 3, 10, 50]) {
      const cap = Math.min(DLQ_MAX_DELAY_MS, DLQ_BASE_DELAY_MS * 2 ** attempts);
      for (let i = 0; i < 200; i++) {
        const delay = dlqBackoffMs(attempts);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(cap);
      }
    }
    // At huge attempt counts the cap (not the base) bounds the delay.
    expect(Math.min(DLQ_MAX_DELAY_MS, DLQ_BASE_DELAY_MS * 2 ** 50)).toBe(DLQ_MAX_DELAY_MS);
  });

  it("zero random yields zero delay; the schedule is a valid ISO instant", () => {
    expect(dlqBackoffMs(3, () => 0)).toBe(0);
    const at = dlqNextAttemptAt(1, new Date("2026-09-01T00:00:00.000Z"), () => 0.5);
    expect(Date.parse(at)).not.toBeNaN();
    expect(Date.parse(at)).toBeGreaterThan(Date.parse("2026-09-01T00:00:00.000Z"));
  });

  it("retires items after a bounded number of attempts", () => {
    expect(DLQ_MAX_ATTEMPTS).toBeGreaterThan(3);
    expect(DLQ_MAX_ATTEMPTS).toBeLessThanOrEqual(30);
  });
});

describe("resilience chain wiring (structural contracts)", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("marking tries cache → local model → cloud AI → rubric, in that order", () => {
    const src = read("src/ai/marking-resilience.ts");
    const tier1 = src.indexOf("lookupCachedMark");
    const tier2 = src.indexOf("tryLocalPart");
    const tier3 = src.indexOf("callServer()");
    expect(tier1).toBeGreaterThan(-1);
    expect(tier2).toBeGreaterThan(tier1);
    expect(tier3).toBeGreaterThan(tier2);
    expect(src).toMatch(/tier:\s*"fallback"/);
    const tiers: MarkTier[] = ["cache", "local", "ai", "fallback"];
    expect(tiers).toHaveLength(4);
  });

  it("aiMark reports the serving tier honestly and stores cache entries only from AI grades", () => {
    const client = read("src/ai/client.ts");
    expect(client).toMatch(/resilientMark\(/);
    expect(client).toMatch(/tier/);
    const resilience = read("src/ai/marking-resilience.ts");
    // storeCachedMark must sit on the serverEnvelope.source === "ai" branch,
    // never on the fallback branch — grading rubric output into the cache
    // would poison future lookups with non-model grades.
    const aiBranch = resilience.slice(resilience.indexOf('serverEnvelope.source === "ai"'), resilience.indexOf("// --- tier 4"));
    expect(aiBranch).toContain("storeCachedMark");
    expect(aiBranch).not.toContain("markFallback");
  });

  it("the runner enqueues only genuine fallback grades and after the attempt is persisted", () => {
    const runner = read("src/components/QuestionRunner.tsx");
    const persist = runner.indexOf("await store.recordAttempt(persistedAttempt, question);");
    const enqueue = runner.indexOf("enqueueDeadMark(");
    expect(persist).toBeGreaterThan(-1);
    expect(enqueue).toBeGreaterThan(persist);
    expect(runner).toMatch(/markTier === "fallback"/);
  });

  it("the drain retries transient failures and never re-grades cache/local tiers", () => {
    const dlq = read("src/ai/mark-dlq.ts");
    expect(dlq).toMatch(/429/);
    expect(dlq).toMatch(/res\.status >= 500/);
    expect(dlq).toMatch(/drainDeadMarks/);
    expect(dlq).toMatch(/AI_DLQ_RESOLVED_EVENT/);
  });

  it("a resolved DLQ mark reaches the sync outbox and the snapshot listener", () => {
    const dlq = read("src/ai/mark-dlq.ts");
    expect(dlq).toMatch(/import \{ saveAttempt \} from "@\/data\/repository"/);
    expect(dlq).toMatch(/await saveAttempt\(upgraded\)/);
    const store = read("src/state/store.tsx");
    expect(store).toMatch(/drainDeadMarks/);
    expect(store).toMatch(/AI_DLQ_RESOLVED_EVENT/);
  });

  it("the local-model tier is opt-in through UserSettings.localAiMarking", () => {
    const types = read("src/domain/types.ts");
    expect(types).toMatch(/localAiMarking\?: boolean/);
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toMatch(/localAiMarking/);
    const runner = read("src/components/QuestionRunner.tsx");
    expect(runner).toMatch(/useLocalModel: Boolean\(store\.settings\?\.localAiMarking\)/);
  });

  it("current schema defines the aiCache and aiDlq stores", () => {
    const db = read("src/data/db.ts");
    expect(db).toMatch(/PERSISTED_SCHEMA_VERSION/);
    expect(db).toMatch(/aiCache:/);
    expect(db).toMatch(/aiDlq:/);
  });

  it("the resolve event name is stable (public contract between modules)", () => {
    expect(AI_DLQ_RESOLVED_EVENT).toBe("revise:ai-dlq-resolved");
  });
});
