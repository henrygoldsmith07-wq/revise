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
