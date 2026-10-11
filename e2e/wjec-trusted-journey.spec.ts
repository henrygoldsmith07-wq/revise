import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { answerOnScreen, runQuestionSet } from "./journey-helpers";
import { putQuestions, readSubjectQuestions, trustViaWorkflow } from "./review-fixture";

// WJEC A-level Mathematics, on a phone: cold start → trusted quick diagnostic → wrong answers → lost marks →
// Today leads with recovery → repair is still not "Proven".
//
// The shipped bank has no human-reviewed questions, so this test gives a handful of them reviewer approvals
// INSIDE ITS OWN BROWSER PROFILE, through the real review workflow (two named fixture reviewers → audit log →
// ledger → trust predicate). Nothing is written to the repository's ledger or audit log.

const SUBJECT = "wjec-alevel-maths";

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

  const trusted = trustViaWorkflow(SUBJECT, await readSubjectQuestions(page, SUBJECT));
  expect(trusted.length).toBeGreaterThanOrEqual(5);
  await putQuestions(page, trusted);
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
