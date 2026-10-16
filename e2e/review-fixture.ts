import type { Page } from "@playwright/test";
import { seedQuestions } from "../src/content";
import { allTopics } from "../src/domain/curriculum";
import { applyHumanVerificationLedger, type HumanVerificationLedgerFile } from "../src/domain/human-verification-ledger";
import { buildReviewPriorities } from "../src/domain/review-priority";
import { appendReviewDecisions, emptyAuditLog, promotableLedgerEntries } from "../src/domain/review-workflow";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "../src/domain/content-trust";
import type { Question } from "../src/domain/types";

// Fixture-only reviewer approvals, applied INSIDE ONE BROWSER PROFILE through
// the real review workflow (two named fixture reviewers → audit log → ledger →
// trust predicate). Nothing is written to the repository's ledger or audit log.
//
// Since the fifteenth pass the app serves authored questions from the bundle
// and never reads a stored copy of an authored id, so a rewritten question row
// can no longer carry trust. Fixture approvals reach the app the way portal
// approvals do: as a runtime review ledger (installFixtureLedger), which the
// app applies on load with the same fingerprint and trust checks.

const byKey = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The questions the app serves: the authored bundle plus private rows stored in the profile, in key order. */
export async function appQuestions(page: Page): Promise<Question[]> {
  const authored = new Set(seedQuestions.map((q) => q.id));
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rows: Question[] = await new Promise((res) => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => res(r.result as Question[]); });
    db.close();
    return rows;
  });
  return [...seedQuestions, ...stored.filter((q) => !authored.has(q.id))].sort(byKey);
}

export async function readSubjectQuestions(page: Page, subjectId: string): Promise<Question[]> {
  return (await appQuestions(page)).filter((q) => q.subjectId === subjectId);
}

/** The first card's subject and owner in the local profile (what onboarding seeded). */
export async function firstCard(page: Page): Promise<{ subjectId: string; userId: string }> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const cards: { subjectId: string; userId: string }[] = await new Promise((res) => { const r = db.transaction("cards").objectStore("cards").getAll(); r.onsuccess = () => res(r.result); });
    db.close();
    return { subjectId: cards[0]!.subjectId, userId: cards[0]!.userId };
  });
}

/**
 * Install fixture approvals as the profile's runtime review ledger (the cache
 * /api/review-ledger fills in production), and answer that endpoint with the
 * same ledger so a refresh cannot replace it. Reload the page afterwards.
 */
export async function installFixtureLedger(page: Page, trusted: Question[]): Promise<void> {
  const ledger: HumanVerificationLedgerFile = {
    formatVersion: 1,
    entries: trusted.map((q) => {
      if (!q.humanVerification) throw new Error(`fixture question ${q.id} carries no review`);
      return { questionId: q.id, subjectId: q.subjectId, contentFingerprint: physicsContentFingerprint(q), review: q.humanVerification };
    }),
  };
  await page.route("**/api/review-ledger", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ledger) }));
  await page.evaluate(async (value) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ key: "revise.runtimeReviewLedger.v1", value });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, ledger);
}

/** Reviewer decisions for the questions the prioritiser proposes first, applied exactly as production would. */
export function trustViaWorkflow(subjectId: string, questions: Question[], topicCount = 5): Question[] {
  const topics = allTopics().filter((t) => t.subjectId === subjectId);
  const gate = {
    topicIds: new Set(topics.map((t) => t.id)),
    specPointIds: new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id))),
  };
  const { queue } = buildReviewPriorities({ topics, questions, gate, subjectIds: [subjectId], trusted: () => false });
  const firstTopics = [...new Set(queue.map((i) => i.topicId))].slice(0, topicCount);
  const ids = queue.filter((i) => firstTopics.includes(i.topicId)).map((i) => i.questionId);
  return trustIdsViaWorkflow(questions, ids);
}

/**
 * Fixture-only: two named fixture reviewers approve exactly these questions
 * through the real workflow (audit log → ledger → trust predicate), inside the
 * test's own browser profile once installed with installFixtureLedger.
 */
export function trustIdsViaWorkflow(questions: Question[], ids: string[]): Question[] {
  let log = emptyAuditLog();
  for (const who of ["e2e-fixture-reviewer-a", "e2e-fixture-reviewer-b"]) {
    const result = appendReviewDecisions(log, ids.map((id) => {
      const q = questions.find((x) => x.id === id)!;
      return {
        questionId: id, contentFingerprint: physicsContentFingerprint(q), decision: "approve" as const, reviewerId: who, reviewerRole: "teacher" as const,
        reviewerQualification: "Playwright fixture only — not a real review", reviewedAt: new Date(Date.now() - 3_600_000).toISOString(),
        checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c) => [c, true])) as never, comments: "",
      };
    }), questions);
    if (result.problems.length) throw new Error(JSON.stringify(result.problems));
    log = result.log;
  }
  const applied = applyHumanVerificationLedger(questions, { formatVersion: 1, entries: promotableLedgerEntries(questions, log) });
  return applied.questions.filter((q) => ids.includes(q.id));
}
