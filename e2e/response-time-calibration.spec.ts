import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("response-time calibration explains the first data threshold", async ({ page }) => {
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

  await page.goto("/response-time");
  await expect(today).toContainText("Response-Time Calibration");
  await expect(page.getByLabel("Response-time subject")).toBeVisible();
  await expect(today).toContainText(/Need more data|On target|Rushing|Overthinking/);
  await expect(today).toContainText(/three marked questions|measured answers/);
});
