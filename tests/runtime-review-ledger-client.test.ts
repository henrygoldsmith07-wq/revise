import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll } from "@/data/db";
import { applyRuntimeReviewLedger, readRuntimeReviewLedger, refreshRuntimeReviewLedger } from "@/data/runtime-review-ledger";
import { physicsContentFingerprint, trustedAssessmentContent } from "@/domain/content-trust";
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

  it("withdraws runtime approvals from already-overlaid questions when the ledger is empty or missing", () => {
    const approved = applyRuntimeReviewLedger([q1, q2], ledger);
    for (const withdrawn of [null, { formatVersion: 1 as const, entries: [] }]) {
      const next = applyRuntimeReviewLedger(approved, withdrawn);
      expect(trustedAssessmentContent(next[0]!)).toBe(false);
      expect(next[0]).toEqual(q1);
    }
  });

  it("caches an empty withdrawal and removes the previous snapshot's approval on refresh", async () => {
    await refreshRuntimeReviewLedger(okFetch(ledger));
    const previous = applyRuntimeReviewLedger([q1], await readRuntimeReviewLedger());
    expect(trustedAssessmentContent(previous[0]!)).toBe(true);
    const empty = { formatVersion: 1 as const, entries: [] };
    expect(await refreshRuntimeReviewLedger(okFetch(empty))).toBe(true);
    const cached = await readRuntimeReviewLedger();
    expect(cached?.entries).toEqual([]);
    expect(trustedAssessmentContent(applyRuntimeReviewLedger(previous, cached)[0]!)).toBe(false);
    expect(await refreshRuntimeReviewLedger(okFetch(empty))).toBe(false);
  });

  it("removes just withdrawn approvals while preserving committed approvals and learner-owned questions", () => {
    const both = verifyThroughWorkflow([q1, q2], [q1.id, q2.id]);
    const full = { formatVersion: 1 as const, entries: promotableLedgerEntries([q1, q2], both.log) };
    const owned = { ...q2, userId: "learner" } as unknown as Question;
    const committed = verified.questions[0]!;
    const applied = applyRuntimeReviewLedger([q1, q2, owned], full);
    const partial = applyRuntimeReviewLedger(applied, ledger);
    expect(trustedAssessmentContent(partial[0]!)).toBe(true);
    expect(trustedAssessmentContent(partial[1]!)).toBe(false);
    expect(partial[2]).toBe(owned);
    const committedOverlay = applyRuntimeReviewLedger([committed], full);
    expect(applyRuntimeReviewLedger(committedOverlay, null)[0]).toEqual(committed);
    expect(trustedAssessmentContent(applyRuntimeReviewLedger(committedOverlay, null)[0]!)).toBe(true);
  });

  it("removes an earlier overlay for stale ledger fingerprints and preserves edits to an overlaid question", () => {
    const applied = applyRuntimeReviewLedger([q1], ledger);
    const edited = { ...applied[0]!, stem: `${q1.stem} (edited)` };
    const next = applyRuntimeReviewLedger([edited], ledger);
    expect(next[0]!.stem).toBe(edited.stem);
    expect(next[0]!.humanVerification).toEqual(q1.humanVerification);
    expect(trustedAssessmentContent(next[0]!)).toBe(false);
    const other = { ...q1, stem: `${q1.stem} (new content)` };
    const stale = structuredClone(ledger);
    stale.entries[0]!.contentFingerprint = physicsContentFingerprint(other);
    stale.entries[0]!.review.contentFingerprint = stale.entries[0]!.contentFingerprint;
    expect(trustedAssessmentContent(applyRuntimeReviewLedger(applied, stale)[0]!)).toBe(false);
  });

  it.each(["status", "reviewerId", "reviewerRole", "reviewerQualification", "checks", "notes"] as const)(
    "refreshes changed approval %s even when fingerprint and review date are unchanged",
    async (field) => {
      await refreshRuntimeReviewLedger(okFetch(ledger));
      const changed = structuredClone(ledger);
      const review = changed.entries[0]!.review;
      switch (field) {
        case "status": review.status = "changes-requested"; break;
        case "reviewerId": review.reviewerId = "replacement-fixture"; break;
        case "reviewerRole": review.reviewerRole = "examiner"; break;
        case "reviewerQualification": review.reviewerQualification = "Updated fixture qualification"; break;
        case "checks": review.checks = { ...review.checks, marking: false }; break;
        case "notes": review.notes = "Updated fixture note"; break;
      }
      expect(await refreshRuntimeReviewLedger(okFetch(changed))).toBe(true);
      expect((await readRuntimeReviewLedger())?.entries[0]?.review).toEqual(review);
      const applied = applyRuntimeReviewLedger(applyRuntimeReviewLedger([q1], ledger), await readRuntimeReviewLedger());
      expect(trustedAssessmentContent(applied[0]!)).toBe(field !== "status" && field !== "checks");
      expect(await refreshRuntimeReviewLedger(okFetch(changed))).toBe(false);
    },
  );

  it("treats entry ordering and object key ordering as unchanged", async () => {
    const both = verifyThroughWorkflow([q1, q2], [q1.id, q2.id]);
    const full = { formatVersion: 1 as const, entries: promotableLedgerEntries([q1, q2], both.log) };
    await refreshRuntimeReviewLedger(okFetch(full));
    const reordered = { entries: [...full.entries].reverse(), formatVersion: 1 };
    expect(await refreshRuntimeReviewLedger(okFetch(reordered))).toBe(false);
  });

  it("is applied on every snapshot load and refreshed by the sync engine", () => {
    const repo = readFileSync("src/data/repository.ts", "utf8");
    expect(repo).toContain("applyRuntimeReviewLedger(");
    expect(repo).toContain("await readRuntimeReviewLedger()");
    const engine = readFileSync("src/state/sync-engine.ts", "utf8");
    expect(engine).toContain("refreshRuntimeReviewLedger()");
  });
});
