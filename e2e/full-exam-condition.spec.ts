import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("past papers exposes the full exam-condition workflow", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await page.getByText(/Skip — I will set this up later/i).click();
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/papers");
  await expect(today).toContainText("Full exam conditions");
  await expect(today).toContainText(/fixed clock|feedback only after submission/i);

  const paperButton = page.getByRole("button", { name: "Full exam conditions", exact: true }).first();
  if (await paperButton.isVisible()) {
    await paperButton.click();
    await expect(today).toContainText("Set up your desk before the clock starts.");
    await expect(today).toContainText(/No hints.*model answers/i);
    await expect(today).toContainText("Start full exam");
  } else {
    await expect(today).toContainText("Extract one to unlock full exam conditions.");
  }
});
