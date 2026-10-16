import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// A fresh student with exam dates gets ONE plan: before the twenty-third
// pass onboarding's rebuild and the dynamic replan both wrote, and Schedule
// showed two blocks at the same time on the same day.
test("a fresh four-flagship plan has no overlapping blocks and one date format at 360px", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics A Level", "Physics A Level", "Biology A Level", "Chemistry A Level"] });
  }
  await page.goto("/schedule");
  const firstDay = page.locator("article.card").first();
  await expect(firstDay).toBeVisible({ timeout: 30_000 });

  // Every day: no two blocks start at the same time.
  const clashes = await page.locator("article.card").evaluateAll((days) =>
    days.flatMap((day) => {
      const times = [...day.querySelectorAll("li span.tabular-nums")].map((el) => el.textContent?.trim() ?? "");
      return times.filter((time, index) => times.indexOf(time) !== index).map((time) => `${day.getAttribute("aria-label")} ${time}`);
    }),
  );
  expect(clashes).toEqual([]);

  // Week headers read "Week of 12 Oct – 18 Oct": no ISO date.
  const headers = await page.getByText(/^Week of /).allInnerTexts();
  expect(headers.length).toBeGreaterThan(0);
  for (const header of headers) expect(header).not.toMatch(/\d{4}-\d{2}-\d{2}/);

  // Today's blocks say they are the long-range plan and link to Today.
  const note = page.getByTestId("schedule-today-note");
  await expect(note).toBeVisible();
  await expect(note.getByRole("link", { name: "Today screen" })).toHaveAttribute("href", "/");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
});

test("/teacher goes to classes instead of a 404", async ({ page }) => {
  const response = await page.goto("/teacher");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/classes$/);
});
