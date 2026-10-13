import { expect, test } from "@playwright/test";

/**
 * A teacher opens the link from their invite in a browser that has never run
 * Revise. Before the eighteenth pass the portal rendered inside the student
 * shell, so they got the student onboarding ("Which exam board are you
 * studying with?") and a learner database in IndexedDB instead of the portal.
 *
 * This deployment (like CI) has no Supabase configured, so the portal answers
 * with its gate; the point is that the portal itself is what the teacher sees,
 * straight from the server HTML, at phone width, and that it creates no
 * student data on the teacher's device. The student app must be unchanged.
 */

test.use({ viewport: { width: 360, height: 760 } });

test("a fresh browser opening a reviewer link sees the portal, not the student onboarding", async ({ page }) => {
  const response = await page.goto("/reviewer/pairs?subject=physics");
  expect(response?.status()).toBe(200);
  // Server-rendered: the portal heading is in the HTML before any script runs.
  expect(await response!.text()).toContain('id="gate-title"');

  await expect(page.getByRole("heading", { name: "Reviewer portal" })).toBeVisible();
  await expect(page.getByText("Reviewer accounts are not configured on this deployment.")).toBeVisible();
  // Give the client every chance to swap it out, as the student shell used to.
  await page.waitForTimeout(2_500);
  await expect(page.getByRole("heading", { name: "Reviewer portal" })).toBeVisible();
  await expect(page.getByText(/Which exam board are you studying with/i)).toHaveCount(0);
  await expect(page.getByText(/Opening your revision profile/i)).toHaveCount(0);

  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(databases).not.toContain("revise");

  // No horizontal overflow at 360px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the student app still opens in its own shell after visiting the portal", async ({ page }) => {
  await page.goto("/reviewer");
  await expect(page.getByRole("heading", { name: "Reviewer portal" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/Which exam board are you studying with/i)).toBeVisible({ timeout: 60_000 });
});
