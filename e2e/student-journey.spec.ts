import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Today → recommended session → Subjects → Progress, on desktop and a phone.
// Answer-level behaviour (diagnosis, repair, closure) is covered by domain tests;
// this pins that the three destinations exist and the first-viewport promise holds.

async function openToday(page: import("@playwright/test").Page) {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page, { skipExamDates: true });
}

test("Today leads with one start action, and the three destinations are reachable", async ({ page }) => {
  await openToday(page);
  const main = page.locator("main#main");
  const start = main.getByRole("link", { name: "Start session", exact: true });
  await expect(start).toBeVisible();
  await expect(main.getByText(/Provisional:|marks at risk|day|No exam date set/i).first()).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Today", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Subjects", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Progress", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Progress", exact: true }).click();
  await expect(page).toHaveURL(/\/readiness/);
  for (const question of ["What am I strong at?", "Where am I losing marks?", "What has been proven?", "What should I work on next?"]) {
    await expect(main.getByText(question)).toBeVisible();
  }

  await page.goto("/");
  await main.getByRole("link", { name: "Start session", exact: true }).click();
  await expect(page).toHaveURL(/\/adaptive-session\?topic=.*start=1/);
  await expect(main).toContainText(/Step 1 of/);
});

test("the three destinations work on a phone without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openToday(page);
  const bar = page.getByRole("navigation", { name: "Primary sections (mobile)" });
  for (const name of ["Today", "Subjects", "Progress"]) await expect(bar.getByRole("link", { name, exact: true })).toBeVisible();
  await bar.getByRole("link", { name: "Progress", exact: true }).click();
  await expect(page.locator("main#main").getByText("What should I work on next?")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
