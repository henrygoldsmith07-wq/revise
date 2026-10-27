import { test, expect } from "@playwright/test";
import { todayOrOnboarding, completeOnboarding } from "./helpers";

// The phone Tools menu is a sheet: a tap on the scrim, Escape, or any
// navigation closes it, so it never lingers over the next screen.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test("tools sheet dismisses on scrim, Escape and navigation", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"] });
  const nav = page.locator('nav[aria-label="Primary sections (mobile)"]');
  const sheet = nav.getByRole("dialog", { name: "Tools" });
  await nav.locator("summary").tap(); await expect(sheet).toBeVisible();
  await page.mouse.click(195, 100); await expect(sheet).toBeHidden();
  await nav.locator("summary").tap(); await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape"); await expect(sheet).toBeHidden();
  await nav.locator("summary").tap(); await sheet.getByRole("link", { name: /^Tutor/ }).tap();
  await expect(page).toHaveURL(/\/tutor/); await expect(sheet).toBeHidden();
  await page.goBack(); await expect(sheet).toBeHidden();
});
