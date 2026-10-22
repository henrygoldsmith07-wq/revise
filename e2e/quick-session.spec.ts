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
  await expect(today).toContainText("I have 5 minutes");
  for (const minutes of [10, 20, 30, 45, 60]) {
    await expect(today).toContainText(`I have ${minutes} minutes`);
  }

  await page.getByRole("button", { name: "I have 5 minutes" }).click();
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
  await page.getByRole("button", { name: "I have 30 minutes" }).click();
  await expect(today).toContainText("Start 30-minute sprint");
  await expect(today).toContainText("Topics are mixed and the set fits about 30 marks.");
});

// Exam readiness's "Run a timed question set" links here; it used to open
// untimed practice through a mode flag /practice never read.
test("a quick=10 deep link opens a timed sprint for that subject", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }
  await page.goto("/practice?quick=10&subject=wjec-alevel-physics");
  await expect(main).toContainText("I have 10 minutes", { timeout: 30_000 });
  await expect(main).toContainText(/Physics · 4 questions selected/);
  await page.getByRole("button", { name: "Start 10-minute sprint" }).click();
  await expect(page.getByLabel(/^\d+:\d{2} remaining$/)).toBeVisible();
  await expect(main).toContainText("Question 1 of 4");
});
