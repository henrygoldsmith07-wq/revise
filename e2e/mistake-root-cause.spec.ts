import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("Progress explains the evidence threshold for mistake root-cause diagnosis", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await page.getByText(/Skip — I will set this up later/i).click();
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/progress");
  await expect(today).toContainText("Mistake root-cause diagnosis");
  await expect(today).toContainText(/No open mistakes to diagnose|Marks to recover|Waiting for evidence|Early signal|Actionable pattern/i);
  await expect(today).toContainText(/early signal|Waiting for evidence|Actionable pattern/i);
});
