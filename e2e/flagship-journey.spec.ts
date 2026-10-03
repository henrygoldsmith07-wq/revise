import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { answerOnScreen, runQuestionSet } from "./journey-helpers";

// The whole first-use loop on a phone: a new student skips nothing, takes the short quick check,
// gets exam answers wrong, is sent to repair, succeeds without help, and is told honestly that
// nothing is proven until a later check.

test("onboarding → quick check → Today → repair → independent success → summary → awaiting proof", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);
  const main = page.locator("main#main");

  // Cold start: one clear action, visible without scrolling, and skippable.
  await expect(main).toContainText("Your best next step", { timeout: 30_000 });
  await expect(main).toContainText("Find where to start");
  const start = main.getByRole("link", { name: "Start quick check" });
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await expect(main.getByRole("button", { name: /Skip, just start revising/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Start/ })).toHaveCount(1);
  await start.click();

  // Quick check: exam answers that are wrong. Each answer is marked, then the next question appears.
  await expect(page).toHaveURL(/\/diagnostic\?subject=/);
  const progress = page.getByText(/Question \d of \d/);
  await expect(progress).toBeVisible({ timeout: 30_000 });
  const total = Number((await progress.innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(3);
  for (let n = 1; n <= total; n++) {
    await expect(page.getByText(new RegExp(`Question ${n} of ${total}`))).toBeVisible({ timeout: 60_000 });
    await answerOnScreen(page, false);
  }
  await expect(main).toContainText("What I found", { timeout: 60_000 });

  // The check changed the recommendation: lost marks now lead, and the quick check is gone.
  await page.goto("/");
  await expect(main).toContainText("Your best next step", { timeout: 30_000 });
  await expect(main).not.toContainText("Find where to start");
  await expect(main).toContainText(/Recover \d+(\.\d)? marks?|marks/);
  await expect(main).toContainText(/Needs work|Improving/);
  const repair = main.getByRole("link", { name: "Start session", exact: true });
  await expect(repair).toHaveAttribute("href", /\/practice\?mission=.*stage=/);
  await repair.click();

  // Repair, then an unaided attempt.
  await page.getByRole("button", { name: /Start mission step/ }).click();
  const questions = await page.getByText(/Question 1 of (\d+)/).first().innerText();
  await runQuestionSet(page, Number(questions.match(/of (\d+)/)![1]), true);

  // The summary says what happened without congratulating: a state word, what is still open, when Revise looks again.
  await expect(main).toContainText("Session complete", { timeout: 30_000 });
  for (const heading of ["What changed", "Still weak", "Evidence created", "What happens next"]) await expect(main).toContainText(heading);
  await expect(main).toContainText(/Improving|Awaiting proof|Needs work|Still fragile|Repaired/);
  await expect(main).toContainText("no delayed proof yet");
  await expect(main).not.toContainText(/well done|great job|congratulations/i);
  await expect(main.getByRole("link", { name: /^Continue:/ })).toBeVisible();

  // Today never calls this proven: nothing has been checked after a delay.
  await page.goto("/");
  await expect(main).toContainText("Your best next step", { timeout: 30_000 });
  await expect(main).not.toContainText("Proven");
  await page.goto("/readiness");
  const panel = page.locator("section[aria-label='Marks recovered']");
  await expect(panel).toContainText(/proven recovered/i, { timeout: 20_000 });
  await expect(panel).toContainText(/0 marks proven recovered/);
  await expect(panel).toContainText(/not proven yet/);
});
