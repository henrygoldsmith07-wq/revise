import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

test("Progress exposes retention mastery", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await page.getByText(/Skip — I will set this up later/i).click();
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/progress");
  await expect(today).toContainText("Retention mastery");
  await expect(today).toContainText("Measured recall from your real review history");
  await expect(today).toContainText("20 reviews");
  await expect(today.getByRole("link", { name: "Review due cards" })).toHaveAttribute("href", "/review");
});
