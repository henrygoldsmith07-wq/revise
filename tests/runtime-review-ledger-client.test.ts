import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll } from "@/data/db";
import { applyRuntimeReviewLedger, readRuntimeReviewLedger, refreshRuntimeReviewLedger } from "@/data/runtime-review-ledger";
import { trustedAssessmentContent } from "@/domain/content-trust";
import { promotableLedgerEntries } from "@/domain/review-workflow";
import type { Question } from "@/domain/types";
import { PROMPTS, verifyThroughWorkflow, wq } from "./helpers-review";

// Acceptance: an approval in the portal makes the question available to the
// student's provable supply without a new build, using the same ledger
// application the bundle uses, and survives going offline.

const q1 = wq("q1", "algebra", PROMPTS[0]!);
const q2 = wq("q2", "algebra", PROMPTS[1]!);
const verified = verifyThroughWorkflow([q1, q2], [q1.id]);
const ledger = { formatVersion: 1 as const, entries: promotableLedgerEntries([q1, q2], verified.log) };

const okFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

beforeEach(async () => {
  await clearAll();
});

describe("runtime review ledger on the student device", () => {
  it("caches the fetched ledger and makes approved bank questions trusted", async () => {
    expect(trustedAssessmentContent(q1)).toBe(false);
    expect(await refreshRuntimeReviewLedger(okFetch(ledger))).toBe(true);
    const cached = await readRuntimeReviewLedger();
    const applied = applyRuntimeReviewLedger([q1, q2], cached);
    expect(trustedAssessmentContent(applied[0]!)).toBe(true);
    expect(trustedAssessmentContent(applied[1]!)).toBe(false);
    // Unchanged ledger: no churn.
    expect(await refreshRuntimeReviewLedger(okFetch(ledger))).toBe(false);
  });

  it("keeps the last good copy when offline, failing or sent garbage", async () => {
    await refreshRuntimeReviewLedger(okFetch(ledger));
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await refreshRuntimeReviewLedger(offline)).toBe(false);
    expect(await refreshRuntimeReviewLedger((async () => new Response("down", { status: 503 })) as unknown as typeof fetch)).toBe(false);
    expect(await refreshRuntimeReviewLedger(okFetch({ formatVersion: 99 }))).toBe(false);
    expect((await readRuntimeReviewLedger())?.entries).toHaveLength(1);
  });

  it("never trusts an entry whose fingerprint no longer matches, nor touches learner-owned questions", () => {
    const edited = { ...q1, stem: `${q1.stem} (edited)` } as Question;
    expect(trustedAssessmentContent(applyRuntimeReviewLedger([edited], ledger)[0]!)).toBe(false);
    const owned = { ...q1, userId: "learner" } as unknown as Question;
    expect(applyRuntimeReviewLedger([owned], ledger)[0]).toBe(owned);
  });

  it("is applied on every snapshot load and refreshed by the sync engine", () => {
    const repo = readFileSync("src/data/repository.ts", "utf8");
    expect(repo).toContain("applyRuntimeReviewLedger(");
    expect(repo).toContain("await readRuntimeReviewLedger()");
    const engine = readFileSync("src/state/sync-engine.ts", "utf8");
    expect(engine).toContain("refreshRuntimeReviewLedger()");
  });
});
