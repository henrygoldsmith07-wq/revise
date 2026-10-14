import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Outside a check, a wrong answer still gets the full practice toolkit
// (Improve my answer), but the missed points are listed once, the live verb
// check gives way to the mark, and focus lands on the result heading.
test("practice: wrong answer gets one missed-points list, Improve my answer, and focus on the result", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(main).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/practice?question=cnt:question:maths-quadratic-discriminant");
  await expect(main).toContainText("Show that");
  const answer = page.getByLabel("Your answer").first();
  await answer.fill("I think it is because the cells get bigger");
  await expect(main).toContainText(/Verb covered|Check the verb/);

  await main.getByRole("button", { name: /^Submit for marking$/ }).click();
  const heading = main.getByRole("heading", { name: /^Examiner marking/ });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  await expect(heading).toBeFocused();
  await expect(main.getByRole("heading", { name: "What you missed" })).toBeVisible();
  await expect(main).not.toContainText("Verb covered");
  await expect(main).not.toContainText("Check the verb");
  await expect(main).not.toContainText("The scheme still wants");
  await expect(main.getByRole("button", { name: /Improve my answer/ }).first()).toBeVisible();
});
