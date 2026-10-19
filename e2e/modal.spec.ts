import { expect, test } from "@playwright/test";
import { completeOnboarding, serviceWorkerReady, todayOrOnboarding } from "./helpers";

// The shared Modal (Base UI dialog) must do what the hand-rolled overlays did
// not: hide the page behind it from assistive tech, stop it scrolling, and
// still give focus back to the control that opened it.
test("search modal makes the page inert, locks scroll and returns focus", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);

  const opener = page.getByRole("button", { name: "Search" }).first();
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Search query" })).toBeFocused();
  // Everything outside the dialog is hidden from the accessibility tree.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow + getComputedStyle(document.body).overflow)).toContain("hidden");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
});

test("shortcut help closes on an outside click", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);

  await page.locator("body").press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});

// Search is split out of the shell bundle; it must be preloaded (and so cached
// by the service worker) while online, or it would not open offline.
test("search still opens offline after an online visit", async ({ page, context }) => {
  await page.goto("/");
  await serviceWorkerReady(page);
  await page.reload();
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
              if (!request.url.endsWith(".js")) continue;
              const body = await (await cache.match(request))?.text();
              if (body?.includes("Search topics, cards, questions and misconceptions")) return true;
            }
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);
  await page.getByRole("button", { name: "Search" }).first().click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await context.setOffline(false);
});
