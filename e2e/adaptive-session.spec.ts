import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

test("Today presents one adaptive 20-minute sequence and starts its runner", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { skipExamDates: true });
  }

  const main = page.locator("main#main");
  await expect(main).toContainText("Your next session is ready");
  const start = main.getByRole("link", { name: "Start session", exact: true });
  await expect(start).toHaveAttribute("href", /\/adaptive-session\?topic=/);
  await start.click();

  await expect(page).toHaveURL(/\/adaptive-session\?topic=.*start=1/);
  await expect(page.locator("main#main")).toContainText("Adaptive session");
  await expect(page.locator("main#main")).toContainText(/Step 1 of/);
});

test("the next session remains usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { skipExamDates: true });
  }

  const start = page.locator("main#main").getByRole("link", { name: "Start session", exact: true });
  await expect(start).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await start.click();

  await expect(page.locator("main#main")).toContainText("Adaptive session");
  await expect(page.locator("main#main")).toContainText(/Step 1 of/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
