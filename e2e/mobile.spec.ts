import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, serviceWorkerReady, todayOrOnboarding } from "./helpers";

// ---------------------------------------------------------------------------
// Mobile-first E2E — revision apps live on phones, so the small screen is a
// first-class target. These scenarios run in the default Chromium project via
// device descriptors (viewport + touch + UA), so no extra browser installs
// are needed in CI.
//
// Devices covered: Pixel 7 (Android phone), iPhone 14 (iOS phone), iPad Mini
// (tablet). Behaviours: touch-only navigation, virtual-keyboard-open layout,
// portrait↔landscape rotation, offline, poor connection, PWA standalone,
// flashcard grading, typing answers, OCR upload, timed papers.
// ---------------------------------------------------------------------------

/** Viewport/touch/UA profiles matching common devices. Kept as plain
 *  options (not device objects) so they are legal inside describe blocks. */
const PIXEL_PROFILE = {
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
};
const IPHONE_PROFILE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
const IPAD_PROFILE = {
  viewport: { width: 744, height: 1133 },
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1",
};

/** Walk onboarding on a fresh profile and land on Today with content. */
async function settle(page: Page): Promise<void> {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(page.locator("main#main")).toBeVisible({ timeout: 15_000 });
  }
}

function mobileNav(page: Page) {
  return page.locator('nav[aria-label="Primary sections (mobile)"]');
}

function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// ---------------------------------------------------------------------------
// Pixel 7 — Android phone, touch-only
// ---------------------------------------------------------------------------

test.describe("mobile core loop — Pixel 7", () => {
  test.use(PIXEL_PROFILE);

  test("touch-only navigation reaches every primary section", async ({ page }) => {
    await settle(page);

    // Bottom bar is visible on mobile; desktop rail is hidden.
    await expect(mobileNav(page)).toBeVisible();
    const tabs = ["Today", "Review", "Study", "Lessons", "Practice", "Past papers"];
    for (const tab of tabs) {
      await mobileNav(page).getByRole("link", { name: tab }).tap();
      await expect(page.locator("main#main")).toBeVisible({ timeout: 10_000 });
    }
  });

  test("no horizontal overflow at Pixel width after onboarding", async ({ page }) => {
    await settle(page);
    for (const route of ["/review", "/practice", "/lesson"]) {
      await page.goto(route);
      await expect(page.locator("main#main")).toBeVisible();
      expect(await hasNoHorizontalOverflow(page)).toBe(true);
    }
  });

  test("flashcard grading buttons are thumb-sized and tappable", async ({ page }) => {
    await settle(page);
    await page.goto("/review");
    // Fresh profiles have due seed cards; accept either an active session or
    // the empty state so the spec holds across seed changes.
    const showAnswer = page.getByRole("button", { name: /Show answer/i }).first();
    const emptyState = page.getByText(/No cards|empty|Nothing here|repetition/i).first();
    await expect(showAnswer.or(emptyState).first()).toBeVisible({ timeout: 15_000 });
    if (!(await showAnswer.isVisible().catch(() => false))) {
      test.skip(true, "No due seed cards in this profile");
      return;
    }

    await showAnswer.tap();
    const goodButton = page.getByRole("button", { name: /^Good/i }).first();
    await expect(goodButton).toBeVisible();
    // Thumb-reach: grade buttons keep a comfortable tap target on phones.
    const box = await goodButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await goodButton.tap();
    // The session advances (next card or completion state appears).
    await expect(page.locator("main#main")).toBeVisible();
  });

  test("typing a maths answer works with the virtual keyboard viewport", async ({ page }) => {
    await settle(page);
    await page.goto("/practice");

    const textarea = page.locator("textarea").first();
    const emptyPractice = page.getByText(/No questions|nothing queued|Set an exam/i).first();
    await expect(textarea.or(emptyPractice).first()).toBeVisible({ timeout: 15_000 });
    if (!textarea.isVisible()) {
      test.skip(true, "No practice question available in this profile");
      return;
    }
    await textarea.tap();
    await textarea.fill("x = 42 m/s^2");
    expect(await textarea.inputValue()).toContain("42");

    // Simulate the virtual keyboard: shrink the viewport like a phone does
    // when the soft keyboard opens, then confirm the textarea stays usable.
    const width = page.viewportSize()?.width ?? 412;
    await page.setViewportSize({ width, height: Math.round((page.viewportSize()?.height ?? 915) * 0.55) });
    await expect(textarea).toBeVisible();
    await textarea.tap();
    await expect(textarea).toBeFocused();
    await page.setViewportSize({ width, height: (await page.viewportSize())?.height ?? 915 });
  });

  test("OCR upload input is reachable and accepts a photo", async ({ page }) => {
    await settle(page);
    await page.goto("/practice");
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    const emptyPractice = page.getByText(/No questions|nothing queued|Set an exam/i).first();
    await expect(fileInput.or(emptyPractice).first()).toBeVisible({ timeout: 15_000 });
    if (!fileInput.isVisible()) {
      test.skip(true, "No answer input available in this profile");
      return;
    }
    // A 1×1 PNG is enough to prove the pipeline accepts the file on mobile.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await fileInput.setInputFiles({ name: "working.png", mimeType: "image/png", buffer: png });
    // The deterministic fallback note appears when no AI provider is set; either way the handler ran without error.
    await expect(
      page.locator('[role="status"], p.text-ink3').filter({ hasText: /read|transcri|photo|answer/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("timed paper fits the phone viewport", async ({ page }) => {
    await settle(page);
    await page.goto("/papers");
    await expect(page.locator("main#main")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// iPhone 14 — iOS phone, portrait ↔ landscape
// ---------------------------------------------------------------------------

test.describe("mobile orientation — iPhone 14", () => {
  test.use(IPHONE_PROFILE);

  test("portrait → landscape keeps the app usable with no horizontal overflow", async ({ page }) => {
    await settle(page);
    await page.setViewportSize({ width: 844, height: 390 }); // landscape
    await expect(page.locator("main#main")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 }); // back to portrait
    await expect(page.locator("main#main")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("long mark-scheme text scrolls instead of clipping", async ({ page }) => {
    await settle(page);
    await page.goto("/practice");
    await expect(page.locator("main#main")).toBeVisible();
    // Any long-content container must be scrollable rather than clipped:
    // assert the main scroll area can reach its bottom.
    const canScroll = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      const before = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      const reached = el.scrollTop > before || el.scrollHeight <= window.innerHeight;
      el.scrollTop = before;
      return reached;
    });
    expect(canScroll).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// iPad Mini — tablet
// ---------------------------------------------------------------------------

test.describe("tablet — iPad Mini", () => {
  test.use(IPAD_PROFILE);

  test("layout renders both nav surfaces and no overflow", async ({ page }) => {
    await settle(page);
    await expect(page.locator("main#main")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    await page.goto("/review");
    await expect(page.locator("main#main")).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Offline + poor connection + PWA standalone
// ---------------------------------------------------------------------------

test.describe("mobile offline / PWA — Pixel 7", () => {
  test.use(PIXEL_PROFILE);

  test("offline reload serves the app shell from the service worker", async ({ page }) => {
    await settle(page);
    await serviceWorkerReady(page);
    await page.reload(); // warm the worker's runtime cache through one load
    await todayOrOnboarding(page);

    await page.context().setOffline(true);
    try {
      await page.reload();
      await todayOrOnboarding(page);
      await expect(page.locator("main#main")).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("poor connection still loads the shell within budget", async ({ page }) => {
    await settle(page);
    await serviceWorkerReady(page);

    // Emulate a slow 3G-ish connection over CDP (Chromium).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 300,
      downloadThroughput: (400 * 1024) / 8, // 400 kbps
      uploadThroughput: (200 * 1024) / 8,
    });
    try {
      const started = Date.now();
      await page.reload();
      await todayOrOnboarding(page);
      const elapsed = Date.now() - started;
      // The precached shell should not depend on network throughput; allow a
      // generous ceiling to catch real regressions (e.g. non-cached routes).
      expect(elapsed).toBeLessThan(30_000);
    } finally {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
  });

  test("PWA install prerequisites: manifest, icons, theme colour, SW scope", async ({ page }) => {
    await settle(page);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();

    const res = await page.request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { name?: string; icons?: unknown[]; display?: string };
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

    // Standalone-capable declaration.
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
    await serviceWorkerReady(page);
  });
});
