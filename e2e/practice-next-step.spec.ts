import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// A wrong practice answer at 360px: one next step with one primary button,
// everything else collapsed, and no false "same wrong idea more than once"
// claim after a first wrong answer. Real offline marking; no mocks.
test("practice: a lost mark gets one next step at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(main).toBeVisible({ timeout: 15_000 });
  }
  await page.goto("/practice?question=cnt:question:maths-quadratic-discriminant");
  const answer = page.getByLabel("Your answer").first();
  await expect(answer).toBeVisible({ timeout: 30_000 });
  await answer.fill("I think it is because the cells get bigger");
  await main.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  const heading = main.getByRole("heading", { name: /^Examiner marking/ });
  await expect(heading).toBeVisible({ timeout: 60_000 });

  const nextStep = main.getByTestId("practice-next-step");
  await expect(nextStep).toBeVisible();
  await expect(nextStep.getByRole("heading", { name: "Your next step" })).toBeVisible();
  await expect(nextStep.getByRole("link")).toHaveCount(1);
  // The stack this replaced is gone from the visible result.
  await expect(main.getByText("What this taught us", { exact: true })).toHaveCount(0);
  await expect(main.getByText("Think it through", { exact: true })).toHaveCount(0);
  await expect(main.getByText("How to fix it", { exact: true })).toBeHidden();
  await expect(main).not.toContainText("two targeted items");
  await expect(main).not.toContainText("cost marks more than once");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // The rest is one tap away, guiding question included (authored text offline / without AI consent).
  const more = main.getByTestId("practice-more-help");
  await more.getByText("More help with this answer", { exact: true }).click();
  await expect(more.getByText("How to fix it", { exact: true })).toBeVisible();
  await expect(more.getByText("Think it through", { exact: true })).toBeVisible();
  await expect(more.getByLabel("Your repair plan")).toBeVisible();
});
