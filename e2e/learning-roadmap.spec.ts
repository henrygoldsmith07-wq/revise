import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test("Lessons presents a unit-by-unit learning roadmap with detailed outlines", async ({ page }) => {
  await page.goto("/");
  // This spec intentionally starts with a fresh profile, so wait for the
  // hydrated onboarding screen instead of racing the static SSR shell.
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });
  await completeOnboarding(page, { skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  await page.goto("/lesson");
  const main = page.locator("main#main");
  await expect(main).toContainText("Learning roadmap");
  await expect(main).toContainText("Your learning path");
  await expect(main).toContainText("Unit 1");
  await expect(main).toContainText("Recommended next");

  const outline = main.locator("summary").filter({ hasText: "See detailed lesson outline" }).first();
  await expect(outline).toBeVisible();
  await outline.click();
  await expect(main).toContainText("What you will learn");

  await main.getByRole("button", { name: /Open lesson 1:/i }).first().click();
  await expect(main).toContainText("Checkpoint 1 of");
  await expect(main).toContainText("Know the target");
});
