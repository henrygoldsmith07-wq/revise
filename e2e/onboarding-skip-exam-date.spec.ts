import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

test("lets a student finish onboarding without knowing an exam date", async ({ page }) => {
  await page.goto("/");

  if ((await todayOrOnboarding(page)) === "today") {
    test.skip(true, "This browser context already has onboarding complete");
  }

  await expect(page.getByText("When are the exams?", { exact: false })).not.toBeVisible();
  await completeOnboarding(page, { skipExamDates: true });

  const today = page.locator("main#main");
  await expect(today).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Revision that knows what to do next")).not.toBeVisible();
});
