import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test("Lessons presents a unit-by-unit learning roadmap with detailed outlines", async ({ page }) => {
  await page.goto("/");
  // This spec intentionally starts with a fresh profile, so wait for the
  // hydrated onboarding screen instead of racing the static SSR shell.
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });
  await completeOnboarding(page, { skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  await page.goto("/");
  const today = page.locator("main#main");
  await expect(today).toContainText("Learning roadmap");
  await expect(today).toContainText(/Continue roadmap|Review roadmap/);
  // Units show their curriculum title, not "Unit <list position>" (some titles
  // already name their exam unit, e.g. "Unit 4 options: …").
  // (The roadmap sits in the collapsed "Plan, pace and outlook" section.)
  await expect(today.getByRole("list", { name: "Learning roadmap units", includeHidden: true })).toHaveCount(1);
  await expect(today).not.toContainText(/Unit \d+ · Unit \d/);

  await page.goto("/lesson");
  const main = page.locator("main#main");
  await expect(main).toContainText("Learning roadmap");
  await expect(main).toContainText("Your learning path");
  await expect(main).toContainText("Step 1");
  await expect(main).toContainText("Recommended next");
  await expect(main).not.toContainText(/video|commute pack/i);

  const outline = main.locator("summary").filter({ hasText: "See detailed lesson outline" }).first();
  await expect(outline).toBeVisible();
  await outline.click();
  await expect(main).toContainText("What you will learn");

  await main.getByRole("button", { name: /Open lesson 1:/i }).first().click();
  await expect(main).toContainText("Checkpoint 1 of");

  // An outline lesson (no written teaching): no orientation screen and no
  // invented model answer. It says what the specification asks and, after the
  // student has said what they know, the key points Revise has on it.
  await expect(main.getByTestId("lesson-outline-note")).toContainText("Outline only");
  await expect(main).not.toContainText("Know the target");
  await expect(main).toContainText(/What the specification asks( \(.+?\))?:/);
  const reveal = main.getByTestId("lesson-reveal");
  if (await reveal.count()) {
    await expect(main.getByRole("button", { name: "Show the key points first" })).toBeDisabled();
    await reveal.getByRole("button", { name: "Show the key points" }).click();
    await expect(main).toContainText("Key points Revise has on this");
  }
  await expect(main).not.toContainText(/Model answer|Reveal model answer/);
  // Finish however many steps the outline has; each mistake step is a decision.
  for (let step = 0; step < 4; step++) {
    const finish = main.getByRole("button", { name: "Finish lesson" });
    const next = main.getByRole("button", { name: "Next", exact: true });
    if (!(await finish.count()) && !(await next.count())) {
      await main.getByRole("listitem").getByRole("button").first().click();
    }
    if (await main.getByRole("button", { name: "Finish lesson" }).count()) {
      await main.getByRole("button", { name: "Finish lesson" }).click();
      break;
    }
    await main.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(main.getByTestId("lesson-practice-handoff").getByRole("link", { name: "Try an exam question on this" })).toHaveAttribute("href", /&point=.*&from=lesson$/);
});
