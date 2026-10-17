import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { answerOnScreen } from "./journey-helpers";

// The quick check saves its run, so a reload resumes the same questions. The
// answer is recorded the moment it is marked, so a reload while the learner is
// still reading that feedback must move on to the next question: re-asking the
// one just answered, with the model answer already seen, would record a second
// attempt that only tests memory of the mark scheme.

const SUBJECT = "wjec-alevel-physics";

test("quick check: a reload on the marked feedback resumes at the next question", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }
  await page.goto(`/diagnostic?subject=${SUBJECT}`);
  const main = page.locator("main#main");
  const counter = main.getByText(/^Question \d+ of \d+/);
  await expect(counter).toContainText("Question 1 of", { timeout: 60_000 });
  const total = (await counter.textContent())!.match(/of (\d+)/)![1];

  await answerOnScreen(page, false);
  await expect(main.getByText(/on this one\./)).toBeVisible({ timeout: 60_000 });

  // The learner is still reading the feedback. Wait for the run to record the
  // marked attempt (a few IndexedDB writes), then reload.
  await expect.poll(() => page.evaluate(async (subject) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const open = indexedDB.open("revise");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const rows: { key: string; value: Record<string, { doneAttemptIds?: string[] }> }[] = await new Promise((resolve) => {
      const all = db.transaction("meta").objectStore("meta").getAll();
      all.onsuccess = () => resolve(all.result);
    });
    db.close();
    const run = rows.find((row) => String(row.key).startsWith("revise.quickDiagnosticRuns.v1"))?.value?.[subject];
    return run?.doneAttemptIds?.length ?? 0;
  }, SUBJECT), { timeout: 15_000 }).toBe(1);

  await page.reload();
  await expect(counter).toContainText(`Question 2 of ${total}`, { timeout: 60_000 });
});
