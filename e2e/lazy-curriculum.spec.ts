import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// Reference subjects' topic trees load on demand. A learner enrolled only on a
// WJEC flagship never downloads OCR Chemistry's topics at boot; opening a link
// to that subject (a shared /library?subject= link, or a public twin's) must
// load it and show its topics, not an empty library.

test("a link to a subject the learner does not study loads that subject's topics", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });
  await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  await page.goto("/library?subject=ocr-alevel-chemistry");
  const main = page.locator("main#main");
  await expect(main.getByText("Atomic structure and the periodic table").first()).toBeVisible({ timeout: 30_000 });
});
