import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Twenty-sixth pass, both found as a fresh Physics student at 360px on a
// production build: Today's headline read "Recover 3 marks: Recover Motion …
// marks", and opening a repair step then going straight back replaced Today's
// recommendation with "Resume interrupted revision" for a run with nothing in
// it. Real offline marking; nothing is seeded.
const QUESTION = "cnt:question:physics-motion-graph-negative-velocity";
const TOPIC = "wjec-alevel-physics.kinematics-dynamics";
const STEP = `/practice?topic=${encodeURIComponent(TOPIC)}&unaided=1&minutes=10`;

test("Today names the lost marks once, and offers Resume only after an answer, at 360px", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }

  // A real lost mark makes a recovery mission Today's one step.
  await page.goto(`/practice?question=${encodeURIComponent(QUESTION)}`);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("textarea").first().fill("It is moving upwards and speeding up.");
  await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  await expect(page.getByTestId("practice-next-step")).toBeVisible({ timeout: 30_000 });
  const finish = page.getByRole("button", { name: "Finish session", exact: true });
  await finish.first().click();
  await expect(finish).toHaveCount(0);

  const main = page.locator("main#main");
  const resume = page.getByRole("heading", { name: "Resume interrupted revision", exact: true });
  await page.goto("/");
  const headline = main.getByRole("heading", { level: 2, name: /^Recover \d+(\.\d)? marks/ });
  await expect(headline).toBeVisible({ timeout: 30_000 });
  await expect(headline).toHaveText(/^Recover \d+(\.\d)? marks in Motion, forces and Newton's laws$/);
  await expect(main).not.toContainText(/Recover [^\n]*\bRecover\b/);

  // Open the step, answer nothing, come back: Today still leads with its recommendation.
  await page.goto(STEP);
  await expect(page.getByRole("heading", { level: 1, name: "Unaided exam question" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.goto("/");
  await expect(headline).toBeVisible({ timeout: 30_000 });
  await expect(resume).toHaveCount(0);
  await page.goto("/schedule");
  await expect(page.locator('article.card[aria-label$="(today)"]')).not.toContainText("Finish the session you started", { timeout: 30_000 });

  // Answer the step's question and leave without finishing: now there is something to resume.
  await page.goto(STEP);
  await expect(page.getByRole("heading", { level: 1, name: "Unaided exam question" })).toBeVisible({ timeout: 30_000 });
  await page.locator("textarea").first().fill("The velocity is negative so it moves back towards the start.");
  await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  await expect(page.getByTestId("practice-next-step")).toBeVisible({ timeout: 30_000 });
  await page.goto("/");
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
});
