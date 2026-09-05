import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

test("Today presents one adaptive 20-minute sequence and starts its runner", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { skipExamDates: true });
  }

  const main = page.locator("main#main");
  await expect(main).toContainText("Best use of the next 20 minutes");
  const start = main.getByRole("link", { name: "Start", exact: true });
  await expect(start).toHaveAttribute("href", /\/adaptive-session\?topic=/);
  await start.click();

  await expect(page).toHaveURL(/\/adaptive-session\?topic=.*start=1/);
  await expect(page.locator("main#main")).toContainText("Adaptive session");
  await expect(page.locator("main#main")).toContainText(/Step 1 of/);
});
