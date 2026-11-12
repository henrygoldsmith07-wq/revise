import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Coming back. A flashcard session left part-way leads Today on the day it
// was left. Two days later it must not be the only thing on Today: the day's
// recommendation leads and the unfinished session is one line beneath it.
// Real reviews, no seeded data; the browser clock is moved forward.
test("an unfinished session leads Today that day, and steps aside on a later day", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);

  // Review one card and leave.
  await page.goto("/review");
  const main = page.locator("main#main");
  const showAnswer = main.getByRole("button", { name: /Show answer/ }).first();
  await expect(showAnswer).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (await showAnswer.isVisible()) await showAnswer.click();
    await expect(main.getByRole("button", { name: /^Good/ }).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await main.getByRole("button", { name: /^Good/ }).first().click();
  await expect(main.getByRole("button", { name: /^Good/ })).toHaveCount(0, { timeout: 15_000 });

  // Same day: the unfinished session is what Today leads with.
  await page.goto("/");
  await expect(main.getByRole("heading", { name: "Resume interrupted revision" })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("resume-later")).toHaveCount(0);

  // Two days later: the recommendation leads; the session is offered beneath it.
  await page.clock.install({ time: new Date(Date.now() + 2 * 86_400_000) });
  await page.clock.resume();
  await page.goto("/");
  await expect(main).toContainText("Do this now", { timeout: 30_000 });
  await expect(main.getByRole("heading", { name: "Resume interrupted revision" })).toHaveCount(0);
  const later = main.getByTestId("resume-later");
  await expect(later).toContainText(/Left unfinished on \d+ \w+: spaced repetition, 1 of \d+ reviewed\./);
  await expect(later.getByRole("link", { name: "Resume" })).toHaveAttribute("href", /^\/review\?/);
  // The recommendation comes first on the page, and nothing scrolls sideways.
  const lead = await main.getByText("Do this now").first().boundingBox();
  const line = await later.boundingBox();
  expect(lead && line && lead.y < line.y).toBeTruthy();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // Dismissing it removes the line and leaves the recommendation.
  await later.getByRole("button", { name: "Dismiss" }).click();
  await expect(later).toHaveCount(0);
  await expect(main).toContainText("Do this now");
});
