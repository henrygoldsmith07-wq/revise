import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

const QUESTION = "cnt:question:physics-motion-graph-negative-velocity";
const TOPIC = "wjec-alevel-physics.kinematics-dynamics";

test("a real offline marked response offers tentative structure practice and a scoped return", async ({ page }) => {
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Chemistry", "Physics"], skipExamDates: true });
  }

  // A topic-only link must beat the remembered/first (Chemistry) subject.
  await page.goto(`/lesson?topic=${encodeURIComponent(TOPIC)}`);
  const subjects = page.getByRole("region", { name: "Choose a lesson subject", exact: true });
  await expect(subjects.getByRole("button", { name: /Physics/ })).toHaveAttribute("aria-pressed", "true");

  // No subject parameter, seeded attempts, auth stubs or AI response mocks.
  await page.goto(`/practice?question=${encodeURIComponent(QUESTION)}`);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("textarea").first().fill("It is moving upwards and speeding up.");
  await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  const suggestion = page.getByTestId("technique-shape-suggestion");
  await expect(suggestion).toBeVisible({ timeout: 30_000 });
  await expect(suggestion).toContainText("This does not establish why marks were lost");
  await suggestion.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/repair-suggestion-desktop.png" });
  const drillLink = suggestion.getByRole("link");
  const href = await drillLink.getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("drill")).toBe("explain");
  await drillLink.click();
  await expect(page.getByRole("group", { name: "Technique drill", exact: true }).getByRole("button", { name: "Explain", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#technique-answer").fill("A second staffed desk could reduce waiting because two requests can be handled at the same time.");
  await page.getByRole("button", { name: "Check response structure", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Submission saved on this device" })).toBeVisible();
  await expect(page.getByText("Explain: 1 submissions", { exact: true })).toBeVisible();
  await page.getByText("Structure feedback — not a mark", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/technique-repair-feedback.png" });
  const returnLink = page.locator(`a[href="/practice?question=${encodeURIComponent(QUESTION)}"]`);
  await expect(returnLink).toBeVisible();
  await page.reload();
  await expect(page.locator("#technique-answer")).toHaveValue("");
  await expect(page.getByText("Explain: 1 submissions", { exact: true })).toBeVisible();
  await expect(returnLink).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await returnLink.scrollIntoViewIfNeeded();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: "artifacts/technique-context-mobile.png" });
  await returnLink.click();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(QUESTION)));
  await expect(page.locator("textarea").first()).toBeVisible();
});

test("unavailable technique context stays honest and never opens an external return URL", async ({ page }) => {
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }
  await page.goto("/technique?drill=evaluate&question=retired-missing&return=https://example.invalid");
  await expect(page.getByRole("heading", { name: "Make the command word work for you", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Technique drill", exact: true }).getByRole("button", { name: "Evaluate", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/The source question or topic is no longer available on this profile/)).toBeVisible();
  await expect(page.locator('a[href^="https://example.invalid"]')).toHaveCount(0);
});
