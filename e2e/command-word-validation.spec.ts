import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

test("command-word validation updates while answering an exam question", async ({ page }) => {
  await page.goto("/");

  const today = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(today).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/practice?question=seed-q:maths-quadratic-discriminant");
  await expect(today).toContainText("Show that");
  await expect(today).toContainText("Start with the verb");

  const answer = page.getByLabel("Your answer").first();
  await answer.fill("k^2 - 10k + 9 > 0");
  await expect(today).toContainText("Verb covered");
});
