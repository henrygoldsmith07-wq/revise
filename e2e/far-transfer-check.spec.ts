import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { appQuestions } from "./review-fixture";
import { verifyThroughWorkflow, wq, PROMPTS, SUBJECT } from "../tests/helpers-review";

// A delayed far-transfer check, end to end: a strong unaided answer a week ago
// schedules a new-context question on the same spec point, and
// /practice?retest=<id> must run it unaided and record it as the check.
// No shipped question can schedule one yet (WJEC needs two teacher reviews;
// no reference question carries transfer demand), so the two questions are
// fixture-only reviewed rows in this browser, as in evidence-operations.spec.ts.

const SOURCE = "cnt:question:e2e-far-source";
const CANDIDATE = "cnt:question:e2e-far-candidate";
const ATTEMPT = "e2e-far-source-attempt";

async function seed(page: Page) {
  const base = (await appQuestions(page)).find((q) => q.subjectId === SUBJECT)!;
  const slug = base.topicIds[0]!.replace(`${SUBJECT}.`, "");
  const bank = [
    { ...wq(SOURCE, slug, PROMPTS[0]!, { marks: 3 }), origin: "manual" as const },
    { ...wq(CANDIDATE, slug, PROMPTS[3]!, { marks: 3, flavour: "transfer" }), origin: "manual" as const },
  ];
  const trusted = verifyThroughWorkflow(bank, bank.map((q) => q.id)).questions;
  await page.evaluate(async ({ questions, subject, attemptId }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => { const r = indexedDB.open("revise"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const cards: { userId: string }[] = await new Promise((resolve) => { const r = db.transaction("cards").objectStore("cards").getAll(); r.onsuccess = () => resolve(r.result); });
    const userId = cards[0]!.userId;
    const tx = db.transaction(["questions", "attempts"], "readwrite");
    for (const q of questions) tx.objectStore("questions").put(q);
    const source = questions[0]!;
    tx.objectStore("attempts").put({
      id: attemptId, userId, questionId: source.id, subjectId: subject, topicIds: source.topicIds,
      answers: {}, marked: [], awarded: 3, max: 3, feedback: "Test fixture", markedBy: "rubric", elapsedMs: 60_000,
      mode: "practice", createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { questions: trusted, subject: SUBJECT, attemptId: ATTEMPT });
}

test("a due far-transfer check opens, runs unaided and records its result", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics"], skipExamDates: true });
  }
  await seed(page);

  await page.goto(`/practice?retest=${encodeURIComponent(`far-transfer:${ATTEMPT}`)}`);
  await expect(page.getByText("Delayed check in a new context")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Due now")).toBeVisible();
  await expect(page.getByText(/no longer available/)).toHaveCount(0);
  await expect(page.getByText(PROMPTS[3]!).first()).toBeVisible();
  // Unaided: no hint ladder and no topic reminders restating the content.
  await expect(page.getByRole("button", { name: /^Reveal / })).toHaveCount(0);
  await expect(page.getByText("Topic reminders")).toHaveCount(0);
  // Reviewed (fixture) question, so the evidence banner may say it counts.
  await expect(page.getByRole("region", { name: "Proof check" })).toBeVisible();

  await page.locator("textarea").first().fill(`Point 1 for ${CANDIDATE}. Point 2 for ${CANDIDATE}. Point 3 for ${CANDIDATE}.`);
  await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  // The result stays on screen after the check completes, and carries it.
  await expect(page.getByText(/^Transfer \d+%$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no longer available/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
