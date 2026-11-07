import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Settings → Desired retention: the learner picks the recall FSRS schedules
// for, sees what it does to the gaps between reviews, and the choice persists.

test("a learner sets a lower desired retention and it is kept", async ({ page }) => {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);

  await page.goto("/settings");
  const group = page.getByRole("group", { name: "Desired retention" });
  await expect(group).toBeVisible({ timeout: 30_000 });
  await expect(group.getByRole("button", { name: "90%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("The standard FSRS target.")).toBeVisible();

  // Buttons can paint before React attaches handlers; click until it reports pressed.
  const eighty = group.getByRole("button", { name: "80%" });
  await expect(async () => {
    if ((await eighty.getAttribute("aria-pressed")) !== "true") await eighty.click();
    await expect(eighty).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(/about 3\.3× longer than at 90%/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("group", { name: "Desired retention" }).getByRole("button", { name: "80%" })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30_000 },
  );
});
