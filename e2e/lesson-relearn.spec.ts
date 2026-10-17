import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// A lost mark on a WJEC Physics question links to the lesson checkpoint that
// teaches that question's specification point (here waves sp-04, total
// internal reflection, checkpoint 4 of its topic rather than the first),
// and the lesson says it is not yet teacher-reviewed. Real offline marking at
// 360px; no mocks.
test("a lost Physics mark links to the lesson for its point, labelled not yet teacher-reviewed", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
    await expect(main).toBeVisible({ timeout: 15_000 });
  }
  await page.goto("/practice?question=cnt:question:physics-depth-waves-sp-04-tir-conditions-0");
  const answer = page.getByLabel("Your answer").first();
  await expect(answer).toBeVisible({ timeout: 30_000 });
  await answer.fill("the light has to go into a denser material");
  await main.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  await expect(main.getByRole("heading", { name: /^Examiner marking/ })).toBeVisible({ timeout: 60_000 });

  // Still one next step with one button.
  const nextStep = main.getByTestId("practice-next-step");
  await expect(nextStep.getByRole("link")).toHaveCount(1);

  const more = main.getByTestId("practice-more-help");
  await more.getByText("More help with this answer", { exact: true }).click();
  const relearn = more.getByTestId("relearn-lesson-more");
  await expect(relearn).toContainText("not yet teacher-reviewed");
  const link = relearn.getByRole("link", { name: /^Open the lesson for Unit / });
  await expect(link).toHaveAttribute("href", /checkpoint=wjec-alevel-physics\.waves\.sp-04/);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  await link.click();
  await page.waitForURL(/\/lesson\?/);
  await expect(main.getByText(/^Checkpoint 4 of \d+\./)).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("lesson-review-state")).toContainText("Not yet teacher-reviewed.");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // The roadmap card carries the same label.
  await main.getByRole("button", { name: "Exit" }).click();
  await expect(main.getByText("Not yet teacher-reviewed", { exact: true }).first()).toBeVisible();
});
