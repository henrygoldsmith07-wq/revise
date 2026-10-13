import { expect, test } from "@playwright/test";
import { todayOrOnboarding } from "./helpers";

/**
 * The authored question bank is a separate, on-demand chunk (seventeenth
 * pass). If it cannot be downloaded (opened offline before the service worker
 * cached it, or a deploy swapped it mid-session) nothing on the device is
 * wrong, so the student must get a calm "connect and try again" screen, never
 * the storage-recovery screen with its "Reset this device" button, and the
 * retry must actually recover once the chunk is reachable.
 */

// page.route cannot see requests a service worker answers; keep this test on the network path.
test.use({ serviceWorkers: "block" });

test("a bank chunk that cannot be downloaded shows a safe retry, and retrying recovers", async ({ page }) => {
  let block = true;
  let blocked = 0;
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // The bank is the only chunk that is both this large and full of authored question ids.
    if (block && body.length > 1_000_000 && (body.match(/cnt:question:/g)?.length ?? 0) > 50) {
      blocked += 1;
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({ response, body });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Revise needs a connection to finish setting up" })).toBeVisible({
    timeout: 60_000,
  });
  expect(blocked).toBeGreaterThan(0);
  await expect(page.getByText(/your revision data here is safe/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Reset this device|Repair damaged rows/i })).toHaveCount(0);

  block = false;
  await page.getByRole("button", { name: "Try again" }).click();
  // Fresh profile: onboarding (with a working store behind it) or Today.
  await todayOrOnboarding(page);
  await expect(page.locator("[data-boot-error]")).toHaveCount(0);
});
