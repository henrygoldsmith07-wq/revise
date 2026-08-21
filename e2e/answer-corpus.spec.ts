import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("double-marked answer corpus exposes agreement and adjudication review", async ({ page }) => {
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

  await page.goto("/answer-corpus");
  await expect(today).toContainText("Double-Marked Answer Corpus");
  await expect(today).toContainText("No double-marked answers loaded");

  await page.getByRole("button", { name: "Load demonstration rows" }).first().click();
  await expect(today).toContainText("Source: synthetic demonstration");
  await expect(today).toContainText("Needs adjudication");

  const mark = page.getByLabel(/Adjudicated mark for/).first();
  await mark.selectOption("1");
  await page.getByRole("button", { name: "Record decision" }).first().click();
  await expect(today).toContainText(/Adjudication recorded/);
});

