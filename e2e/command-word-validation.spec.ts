import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("command-word validation updates while answering an exam question", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await page.getByRole("button", { name: /Continue/i }).first().click();
    await page.waitForTimeout(300);
    const subjectCard = page.locator("button.card").first();
    if (await subjectCard.isVisible()) await subjectCard.click();
    const subjectContinue = page.getByRole("button", { name: /Continue/i }).first();
    if (await subjectContinue.isVisible()) await subjectContinue.click();
    await page.waitForTimeout(300);
    const examContinue = page.getByRole("button", { name: /Continue/i }).first();
    if (await examContinue.isVisible()) await examContinue.click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Build my plan|Continue/i }).first().click();
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/practice?question=seed-q:maths-quadratic-discriminant");
  await expect(today).toContainText("Show that");
  await expect(today).toContainText("Start with the verb");

  const answer = page.getByLabel("Your answer").first();
  await answer.fill("k^2 - 10k + 9 > 0");
  await expect(today).toContainText("Verb covered");
});
