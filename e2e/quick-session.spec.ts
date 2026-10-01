import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

test("Practice exposes question sprints from five to sixty minutes", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/practice");
  await expect(today).toContainText("Short on time?");
  await expect(today).toContainText("I Have 5 Minutes");
  for (const minutes of [10, 20, 30, 45, 60]) {
    await expect(today).toContainText(`I Have ${minutes} Minutes`);
  }

  await page.getByRole("button", { name: "I Have 5 Minutes" }).click();
  await expect(today).toContainText("Use the time you actually have.");
  await expect(today).toContainText("Start 5-minute sprint");
  await expect(today).toContainText("unseen questions and weaker topics first");
});

test("a thirty-minute sprint is built to a mark budget", async ({ page }) => {
  await page.goto("/practice");
  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await page.goto("/practice");
  }
  await page.getByRole("button", { name: "I Have 30 Minutes" }).click();
  await expect(today).toContainText("Start 30-minute sprint");
  await expect(today).toContainText("Topics are mixed and the set fits about 30 marks.");
});
