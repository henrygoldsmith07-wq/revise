import type { Page } from "@playwright/test";
import { allTopics } from "../src/domain/curriculum";
import { applyHumanVerificationLedger } from "../src/domain/human-verification-ledger";
import { buildReviewPriorities } from "../src/domain/review-priority";
import { appendReviewDecisions, emptyAuditLog, promotableLedgerEntries } from "../src/domain/review-workflow";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "../src/domain/content-trust";
import type { Question } from "../src/domain/types";

// Fixture-only reviewer approvals, applied INSIDE ONE BROWSER PROFILE through
// the real review workflow (two named fixture reviewers → audit log → ledger →
// trust predicate). Nothing is written to the repository's ledger or audit log.

export async function readSubjectQuestions(page: Page, subjectId: string): Promise<Question[]> {
  return page.evaluate(async (subject) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rows: Question[] = await new Promise((res) => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => res(r.result as Question[]); });
    return rows.filter((q) => q.subjectId === subject);
  }, subjectId);
}

export async function putQuestions(page: Page, rows: Question[]): Promise<void> {
  await page.evaluate(async (items) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("questions", "readwrite");
    for (const row of items) tx.objectStore("questions").put(row);
    await new Promise((r) => { tx.oncomplete = r; });
  }, rows);
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
