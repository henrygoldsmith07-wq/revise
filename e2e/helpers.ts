import { expect, type Page } from "@playwright/test";

/**
 * Deterministic onboarding/Today decision point.
 *
 * Why this exists: static SSR paints <main id="main"> before React hydrates;
 * a fresh profile then swaps it for the onboarding dialog. Every spec used to
 * branch on a single `isVisible()`, which raced hydration — on slower machines
 * the static main won, the dialog was missed, and every later page was blocked
 * by the modal. This helper polls until the post-hydration state is stable
 * (main survives a grace window, or the dialog is up) before the caller
 * branches once, deterministically.
 */
export type ShellState = "onboarding" | "today";

export async function todayOrOnboarding(page: Page, timeoutMs = 25_000): Promise<ShellState> {
  const onboarding = page.getByText(/Revision that knows what to do next/i);
  const today = page.locator("main#main");
  let outcome: ShellState | null = null;
  await expect(async () => {
    // A store that cannot be read is a dead end, not something to keep polling
    // for. Surface the reason immediately instead of burning the full timeout
    // and reporting only "main#main not found".
    const bootError = await page
      .evaluate(() => document.querySelector("[data-boot-error]")?.getAttribute("data-boot-error") ?? null)
      .catch(() => null);
    if (bootError) throw new Error(`app failed to boot: ${bootError}`);
    if (await onboarding.isVisible().catch(() => false)) {
      outcome = "onboarding";
      return;
    }
    await expect(today).toBeVisible({ timeout: 2_000 });
    // Grace window: if hydration is about to replace static main with the
    // dialog, this catches it and the surrounding toPass retries.
    await page.waitForTimeout(400);
    if (!(await today.isVisible().catch(() => false))) {
      outcome = null;
      throw new Error("hydration swapped static main for onboarding — retrying");
    }
    outcome = "today";
  }).toPass({ timeout: timeoutMs });
  return outcome ?? "today";
}

/**
 * Waits until the PWA worker is installed, activated and *controlling* the
 * page, so a reload can be served from the precache with no network.
 *
 * Why this exists: the offline spec used to sleep 500ms before cutting the
 * network, which is nowhere near enough for register → precache (the ~22-route
 * app shell) → activate → clients.claim(). The reload then went to the network
 * with no controller and failed outright with ERR_INTERNET_DISCONNECTED.
 *
 * `navigator.serviceWorker.controller` is set by the clients.claim() call in
 * sw.js's activate handler, which runs only after install's precache has
 * settled — so it is exactly the "ready to serve offline" signal, and waiting
 * on it is deterministic rather than a timing guess.
 */
export async function serviceWorkerReady(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, {
    timeout: timeoutMs,
  });
}
