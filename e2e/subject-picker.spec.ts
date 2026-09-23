import { expect, test } from "@playwright/test";

test("subject picker shows clear multi-select state during onboarding", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });

  await page.getByRole("button", { name: /AQA/i }).first().click();
  await page.getByRole("button", { name: /Continue/i }).click();

  const subjectGroup = page.getByRole("group", { name: /subjects/i }).first();
  await expect(subjectGroup).toBeVisible();
  await expect(page.getByText("subjects selected")).toBeVisible();

  const subject = subjectGroup.getByRole("button").first();
  await subject.click();
  await expect(subject).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("subject selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(subject).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("subjects selected")).toBeVisible();
});
