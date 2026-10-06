import { expect, test } from "@playwright/test";

test("subject picker shows clear multi-select state during onboarding", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });

  await page.getByRole("button", { name: /AQA/i }).first().click();
  await page.getByRole("button", { name: /Continue/i }).click();

  // AQA has no flagship subjects: every subject is an unverified preview and
  // must be opted into explicitly before any of them can be chosen.
  const preview = page.getByRole("button", { name: /unverified preview/i }).first();
  await expect(preview).toBeVisible();
  await expect(page.getByRole("group", { name: /subjects/i })).toHaveCount(0);

  await preview.click();

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

test("flagship subjects are offered without an unverified-preview detour", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });

  await page.getByRole("button", { name: /WJEC/i }).first().click();
  await page.getByRole("button", { name: /Continue/i }).click();

  // The A-level group carries the flagship subjects and is visible immediately.
  await expect(page.getByRole("group", { name: /A level subjects/i })).toBeVisible();
  await expect(page.getByText(/Flagship/).first()).toBeVisible();
  // The other levels are still behind the explicit choice.
  await expect(page.getByRole("button", { name: /unverified preview/i }).first()).toBeVisible();
});
