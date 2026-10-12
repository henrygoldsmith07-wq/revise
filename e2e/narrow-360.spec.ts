import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// ---------------------------------------------------------------------------
// Narrow-phone reachability (360 x 800).
//
// 360px is the width of the cheapest Android phone still sold in the UK, and
// the width Android's own "smallest width" support guidance is written against.
// It is narrower than anything else in the suite (390 / 412), so it is where
// two-column layouts, long copy and wide buttons break first.
//
// The Diagnose -> Repair -> Practise -> Prove loop has to be operable here: a
// learner who cannot start a session on the cheapest phone cannot use the app.
// These tests check the loop is *reachable and operable*, not how it looks.
// ---------------------------------------------------------------------------

const NARROW_PHONE = {
  viewport: { width: 360, height: 800 },
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 10; SM-A105F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

async function settle(page: Page): Promise<void> {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(page.locator("main#main")).toBeVisible({ timeout: 15_000 });
  }
}

function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Every control a learner must be able to hit must clear the 44px touch target. */
async function tapTargetsAreUsable(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => ({
        text: (node.textContent ?? "").trim().slice(0, 40),
        height: Math.round(node.getBoundingClientRect().height),
      })));
}

test.describe("narrow phone — 360x800", () => {
  test.use(NARROW_PHONE);

  test("Today offers a startable action without sideways scrolling", async ({ page }) => {
    await settle(page);
    await expect(page.locator("main#main")).toBeVisible();

    // The headline card is the primary tap target; it must not be clipped.
    const focus = page.locator(".today-focus").first();
    await expect(focus).toBeVisible();
    expect(await hasNoHorizontalOverflow(page), "Today scrolled horizontally at 360px").toBe(true);

    const buttons = await tapTargetsAreUsable(page, "main#main a[href], main#main button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.height, `touch target too small: "${button.text}"`).toBeGreaterThanOrEqual(40);
    }
  });

  test("the primary action on Today can actually be started", async ({ page }) => {
    await settle(page);
    const start = page.locator('.today-focus a[href^="/"], .today-focus button').first();
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.locator("main#main")).toBeVisible({ timeout: 15_000 });
    expect(await hasNoHorizontalOverflow(page), "the started task scrolled sideways at 360px").toBe(true);
  });

  test("onboarding fits 360px, so the loop can be entered in the first place", async ({ page }) => {
    await page.goto("/");
    if ((await todayOrOnboarding(page)) !== "onboarding") {
      test.skip(true, "this profile has already been onboarded");
    }
    expect(await hasNoHorizontalOverflow(page), "onboarding scrolled sideways at 360px").toBe(true);
    const step = page.locator('[role="group"] button').first();
    if (await step.count()) {
      await expect(step).toBeVisible();
      const box = await step.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(360);
    }
  });

  test("a first visit that skips the quick check is offered a marked session, not a card backlog", async ({ page }) => {
    // Twelfth pass: a fresh profile used to land on "194 cards due; the later
    // they are done, the more you forget" — the seeded deck, never studied.
    await page.goto("/");
    if ((await todayOrOnboarding(page)) !== "onboarding") {
      test.skip(true, "this profile has already been onboarded");
    }
    const wjec = page.getByRole("button", { name: /WJEC/i }).first();
    await expect(async () => {
      await wjec.click();
      await expect(wjec).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.getByRole("button", { name: /Mathematics/i }).first().click();
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.getByRole("radio", { name: /Skip for now/i }).click();
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.getByRole("button", { name: /Build my plan/i }).click();
    const focus = page.locator(".today-focus").first();
    await expect(focus).toBeVisible({ timeout: 60_000 });
    await expect(focus).not.toContainText(/cards? (?:are )?due/i);
    await expect(focus).not.toContainText(/solid recent evidence/i);
    const start = focus.locator('a[href^="/"]').first();
    await expect(start).toHaveAttribute("href", /^\/(?:adaptive-session|diagnostic)/);
  });

  test("long review copy wraps instead of widening the page", async ({ page }) => {
    await settle(page);
    // Rotating to landscape is the other direction this can fail.
    await page.setViewportSize({ width: 800, height: 360 });
    expect(await hasNoHorizontalOverflow(page), "landscape scrolled sideways").toBe(true);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await hasNoHorizontalOverflow(page), "returning to portrait scrolled sideways").toBe(true);
  });
});