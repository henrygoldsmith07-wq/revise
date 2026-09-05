import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test("Label a diagram opens an authored diagram with hotspot labels", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });
  await completeOnboarding(page, { subjectNames: ["Biology"], skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  await page.goto("/study");
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /More ways to study/i }).click();
  const start = page.getByRole("button", { name: "Start label a diagram" });
  await expect(start).toBeEnabled();
  await start.click();

  const main = page.locator("main#main");
  await expect(main).toContainText("Active recall:");
  await expect(main.getByRole("img", { name: /Unlabelled diagram/i })).toBeVisible();
  await expect(main.getByText("Pick a label")).toBeVisible();
});
