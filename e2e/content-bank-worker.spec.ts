import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

/**
 * Nineteenth pass: for a fresh profile the authored question bank is built in
 * a dedicated worker while onboarding is open, so the first taps are not held
 * up by it. This pins, in a real browser and a production build, that the
 * worker path is the one taken (the loader falls back to the main thread
 * silently, so a broken worker would otherwise only show up as a slower
 * phone), that it raises no console errors, that the student still reaches a
 * working Today, and that a returning visit keeps the main-thread import (it
 * reached Today sooner that way; see src/data/authored-questions.ts).
 */

test.use({ viewport: { width: 360, height: 760 } });

test("a fresh profile's question bank is built in the worker, Today works, and a returning visit imports it", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "today") test.skip(true, "This browser context already has onboarding complete");

  // The bank is ready (from the worker) while onboarding is still open.
  await expect(page.locator("html")).toHaveAttribute("data-question-bank", "worker", { timeout: 60_000 });

  await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics"], skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Revision that knows what to do next")).not.toBeVisible();

  // A returning visit imports the bank on the main thread.
  await page.reload();
  await expect(page.locator("main#main")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-question-bank", "main-thread", { timeout: 60_000 });

  expect(errors.filter((text) => /worker|content-bank|question bank/i.test(text))).toEqual([]);
});
