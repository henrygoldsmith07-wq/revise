import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Anki-style statistics: Card info on the review screen, and the Study page's
// forecast, review calendar and deck numbers once a card has been reviewed.

test("a reviewed card shows up in card info, the forecast and the calendar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);

  await page.goto("/review");
  const main = page.locator("main#main");
  const showAnswer = main.getByRole("button", { name: /Show answer/ }).first();
  await expect(showAnswer).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (await showAnswer.isVisible()) await showAnswer.click();
    await expect(main.getByRole("button", { name: "Card info" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await main.getByRole("button", { name: "Card info" }).click();
  await expect(main.getByText("Never reviewed, so there is nothing to measure yet.")).toBeVisible();
  await main.getByRole("button", { name: /^Good/ }).first().click();
  // The grade buttons go only once the review is saved; leaving before that
  // aborted the write and the statistics page then had nothing to show.
  await expect(main.getByRole("button", { name: /^Good/ })).toHaveCount(0, { timeout: 15_000 });

  await page.goto("/study?stats=1");
  const stats = page.getByRole("region", { name: "Flashcard statistics" });
  await expect(stats).toBeVisible({ timeout: 30_000 });
  await expect(stats.getByRole("heading", { name: "Cards due, next 30 days" })).toBeVisible();
  await expect(stats.getByText(/Studied on 1 of \d+ days · 1 review a day when you studied/)).toBeVisible();
  await expect(stats.getByRole("img", { name: /1 card due over the next 30 days/ })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  await stats.screenshot({ path: test.info().outputPath("flashcard-statistics.png") });
});
