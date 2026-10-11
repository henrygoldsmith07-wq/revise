import { expect, test, type Page } from "@playwright/test";
import { allTopics } from "../src/domain/curriculum";
import { applyHumanVerificationLedger } from "../src/domain/human-verification-ledger";
import { buildReviewPriorities } from "../src/domain/review-priority";
import { appendReviewDecisions, emptyAuditLog, promotableLedgerEntries } from "../src/domain/review-workflow";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "../src/domain/content-trust";
import type { Question } from "../src/domain/types";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { answerOnScreen, runQuestionSet } from "./journey-helpers";

// WJEC A-level Mathematics, on a phone: cold start → trusted quick diagnostic → wrong answers → lost marks →
// Today leads with recovery → repair is still not "Proven".
//
// The shipped bank has no human-reviewed questions, so this test gives a handful of them reviewer approvals
// INSIDE ITS OWN BROWSER PROFILE, through the real review workflow (two named fixture reviewers → audit log →
// ledger → trust predicate). Nothing is written to the repository's ledger or audit log.

const SUBJECT = "wjec-alevel-maths";

async function readMathsQuestions(page: Page): Promise<Question[]> {
  return page.evaluate(async (subjectId) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rows: Question[] = await new Promise((res) => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => res(r.result as Question[]); });
    return rows.filter((q) => q.subjectId === subjectId);
  }, SUBJECT);
}

/** Reviewer decisions for the questions the prioritiser proposes first, applied exactly as production would. */
function trustViaWorkflow(questions: Question[]): Question[] {
  const topics = allTopics().filter((t) => t.subjectId === SUBJECT);
  const gate = {
    topicIds: new Set(topics.map((t) => t.id)),
    specPointIds: new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id))),
  };
  const { queue } = buildReviewPriorities({ topics, questions, gate, subjectIds: [SUBJECT], trusted: () => false });
  const firstTopics = [...new Set(queue.map((i) => i.topicId))].slice(0, 5);
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

test("WJEC Maths: trusted quick diagnostic → lost marks → Today recovers → repair is not proof", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics"], examDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10) });
  }
  const main = page.locator("main#main");
  await page.waitForTimeout(3000);

  // No reviewed questions yet: Today does not offer a diagnostic it cannot run, and claims nothing.
  await expect(main).not.toContainText("Find where to start");
  await expect(main).not.toContainText("Proven");

  const trusted = trustViaWorkflow(await readMathsQuestions(page));
  expect(trusted.length).toBeGreaterThanOrEqual(5);
  await page.evaluate(async (rows) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction("questions", "readwrite");
    for (const row of rows) tx.objectStore("questions").put(row);
    await new Promise((r) => { tx.oncomplete = r; });
  }, trusted);
  await page.goto("/");
  await expect(main).toContainText("Your highest-value session", { timeout: 30_000 });

  // Cold start with reviewed supply: one clear, skippable action above the fold.
  await expect(main).toContainText("Find where to start");
  const start = main.getByRole("link", { name: "Start quick check" });
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await expect(main.getByRole("button", { name: /Skip, just start revising/ })).toBeVisible();
  await start.click();

  await expect(page).toHaveURL(/\/diagnostic\?subject=wjec-alevel-maths/);
  const progress = page.getByText(/Question \d of \d/);
  await expect(progress).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/initial signal .* not a predicted grade/i)).toBeVisible();
  const total = Number((await progress.innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(3);
  for (let n = 1; n <= total; n++) {
    await expect(page.getByText(new RegExp(`Question ${n} of ${total}`))).toBeVisible({ timeout: 60_000 });
    await answerOnScreen(page, false);
    // The mark and what was missed stay on screen until the student moves on.
    await expect(page.getByText(/on this one\. Read what you missed/)).toBeVisible({ timeout: 60_000 });
    await expect(main).toContainText("Examiner marking");
    await page.getByRole("button", { name: n === total ? "See what I found" : "Next question" }).click();
  }
  await expect(main).toContainText("What I found", { timeout: 60_000 });
  await expect(main).toContainText(/initial signal, not a predicted grade/i);

  // The same attempts feed recovery: Today changes immediately.
  await page.goto("/");
  await expect(main).toContainText("Your highest-value session", { timeout: 30_000 });
  await expect(main).not.toContainText("Find where to start");
  await expect(main).toContainText(/Recover \d+(\.\d)? marks?|marks/);
  const repair = main.getByRole("link", { name: "Start session", exact: true });
  await expect(repair).toHaveAttribute("href", /\/practice\?mission=.*stage=/);
  await repair.click();

  await page.getByRole("button", { name: /Start mission step/ }).click();
  const count = await page.getByText(/Question 1 of (\d+)/).first().innerText();
  await runQuestionSet(page, Number(count.match(/of (\d+)/)![1]), true);
  await expect(main).toContainText("Session complete", { timeout: 30_000 });

  // Repair alone is never proof.
  await page.goto("/");
  await expect(main).toContainText("Your highest-value session", { timeout: 30_000 });
  await expect(main).not.toContainText("Proven");
});
