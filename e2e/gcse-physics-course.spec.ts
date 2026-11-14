import { expect, test } from "@playwright/test";

// A GCSE physics student (AQA) at 360px. GCSE physics used to be the WJEC
// A-level course; it now builds from the DfE GCSE subject content. The
// onboarding note, the lessons and the flashcards must all be GCSE.
const A_LEVEL_ONLY = /photoelectric|simple harmonic|gravitational potential(?! energy)|centripetal|Young modulus|internal resistance/i;

test("a GCSE physics student is taught GCSE physics, not A-level", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });

  const board = page.getByRole("button", { name: /AQA/i }).first();
  await expect(async () => {
    await board.click();
    await expect(board).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Continue$/i }).click();

  await page.getByRole("button", { name: /unverified preview/i }).first().click();
  // The GCSE row names physics as the subject that follows the GCSE content.
  await expect(page.getByText(/Except Physics: its topics follow the DfE GCSE subject content/)).toBeVisible();
  await page.getByRole("group", { name: "GCSE unverified preview subjects" }).getByRole("button", { name: /Physics/ }).click();
  await page.getByRole("button", { name: /Continue/i }).click();
  const finalCta = page.getByRole("button", { name: /Start my quick check|Build my plan|Start revising|Finish/i });
  for (let step = 0; step < 4 && !(await finalCta.isVisible().catch(() => false)); step++) {
    await page.getByRole("button", { name: /^Continue$/i }).click();
  }
  await finalCta.click();
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  // Lessons: the GCSE outline, under the DfE headings.
  await page.goto("/lesson?subject=aqa-gcse-physics");
  const main = page.locator("main#main");
  await expect(main).toContainText("Energy stores, transfers and power", { timeout: 30_000 });
  await expect(main).toContainText("Stopping distances and road safety");
  await expect(main).not.toContainText(A_LEVEL_ONLY);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // Flashcards: GCSE key points only; no A-level card is offered.
  await page.goto("/review?subject=aqa-gcse-physics");
  const show = main.getByRole("button", { name: /Show answer/ }).first();
  await expect(show).toBeVisible({ timeout: 30_000 });
  for (let card = 0; card < 3; card++) {
    await expect(main).not.toContainText(A_LEVEL_ONLY);
    if (!(await show.isVisible().catch(() => false))) break;
    await show.click();
    await expect(main).not.toContainText(A_LEVEL_ONLY);
    await main.getByRole("button", { name: /^Good/ }).first().click();
    await expect(main.getByRole("button", { name: /^Good/ })).toHaveCount(0, { timeout: 15_000 });
  }
});
