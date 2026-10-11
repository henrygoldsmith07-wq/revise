import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { answerOnScreen } from "./journey-helpers";
import { putQuestions, readSubjectQuestions, trustViaWorkflow } from "./review-fixture";

// A marked answer must stay on screen until the student chooses to move on.
// Until the fifth pass, the adaptive session swapped the step out the moment
// marking finished, and the full diagnostic replaced the result with "How sure
// were you?". These checks drive the real UI and wait past the replan, so a
// regression that unmounts the result after a tick still fails.

const SUBJECT = "wjec-alevel-maths";

async function startAdaptiveSession(page: Page): Promise<void> {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { skipExamDates: true });
  }
  const main = page.locator("main#main");
  const skip = main.getByRole("button", { name: /Skip, just start revising/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const start = main.getByRole("link", { name: "Start session", exact: true });
  await expect(start).toHaveAttribute("href", /\/adaptive-session\?topic=/, { timeout: 30_000 });
  await start.click();
  await expect(main).toContainText("Adaptive session", { timeout: 30_000 });
}

test("adaptive session: the marked result stays visible until Continue", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await startAdaptiveSession(page);
  const main = page.locator("main#main");

  // Walk to the first marked question step. Non-question steps (retrieval,
  // explanation) are finished with their own primary control.
  const submit = page.getByRole("button", { name: /submit for marking/i }).first();
  for (let i = 0; i < 6 && !(await submit.isVisible().catch(() => false)); i++) {
    const advance = main.getByRole("button", { name: /^(Continue|Done|I've read this|Show answer|Skip this step|Mark as read)/ }).first();
    if (await advance.isVisible().catch(() => false)) await advance.click();
    await page.waitForTimeout(1500);
  }
  await expect(submit, "the session should reach a marked question step").toBeVisible({ timeout: 30_000 });

  await answerOnScreen(page, false);
  const held = page.getByText(/Read the marking above, then continue when you are ready/);
  await expect(held).toBeVisible({ timeout: 60_000 });
  await expect(main).toContainText("Examiner marking");

  // Still there after the record and replan have had time to land.
  const proceed = main.getByRole("button", { name: /^(Continue|Finish session)/ });
  await expect(proceed).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(4000);
  await expect(held).toBeVisible();
  await expect(main).toContainText("Examiner marking");

  await proceed.click();
  await expect(held).toBeHidden({ timeout: 10_000 });
});

test("full diagnostic: confidence is asked before the mark, and the mark stays until Continue", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics"], skipExamDates: true });
  }
  await page.waitForTimeout(3000);
  // The full diagnostic only runs on reviewed questions: approve some inside
  // this browser profile through the real workflow (fixture reviewers only).
  const trusted = trustViaWorkflow(SUBJECT, await readSubjectQuestions(page, SUBJECT), 8);
  expect(trusted.length).toBeGreaterThanOrEqual(5);
  await putQuestions(page, trusted);

  await page.goto(`/diagnostic?subject=${SUBJECT}`);
  const main = page.locator("main#main");
  await main.getByRole("button", { name: /^Full/ }).click();
  await expect(main).toContainText("Before you see the mark: how sure are you?", { timeout: 60_000 });
  await expect(main).not.toContainText("How sure were you of that answer?");

  await answerOnScreen(page, false, /Confident · submit/);
  const held = page.getByText(/on this one, and you said you were confident\. Read what you missed/);
  await expect(held).toBeVisible({ timeout: 60_000 });
  await expect(main).toContainText("Examiner marking");
  await page.waitForTimeout(4000);
  await expect(held).toBeVisible();
  await expect(main).not.toContainText("How sure were you of that answer?");

  await main.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(held).toBeHidden({ timeout: 10_000 });
  await expect(main).toContainText(/1 answered/);
});
