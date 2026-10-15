import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// The repair plan's "Guided application", "Unaided exam question" and
// "Timed question" links must open what they promise: real offline marking,
// no mocks, no seeded attempts.
const QUESTION = "cnt:question:physics-motion-graph-negative-velocity";
const TOPIC = "wjec-alevel-physics.kinematics-dynamics";

test("repair-plan practice links honour guided, unaided and timed at 360px", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }

  // A real lost mark makes "Guided application" the one next step.
  await page.goto(`/practice?question=${encodeURIComponent(QUESTION)}`);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("textarea").first().fill("It is moving upwards and speeding up.");
  await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
  const nextStep = page.getByTestId("practice-next-step");
  await expect(nextStep).toBeVisible({ timeout: 30_000 });
  // Clicked, not typed: the step opens on the same route, which used to keep
  // the just-answered question as the "guided" one.
  const guidedLink = nextStep.getByRole("link", { name: /Guided application/ });
  await expect(guidedLink).toHaveAttribute("href", `/practice?topic=${encodeURIComponent(TOPIC)}&guided=1`);
  await guidedLink.click();
  await expect(page.getByText("0/3 answered")).toBeVisible({ timeout: 30_000 });

  // Guided: the steps are on screen before the answer box, and the page is
  // the one question, not the practice hub.
  await expect(page.getByRole("heading", { level: 1, name: "Guided application" })).toBeVisible({ timeout: 30_000 });
  const steps = page.getByTestId("guided-steps");
  await expect(steps).toBeVisible();
  await expect(steps).toContainText("Small cue:");
  await expect(steps).toContainText("Practice, not proof");
  await expect(page.getByText("Do only questions I got wrong")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Topic" })).toHaveCount(0);
  // Above the fold at 360×760: the question starts before the bottom nav.
  expect((await page.getByText(/^\d+ marks?$/).first().boundingBox())!.y).toBeLessThan(700);
  await steps.screenshot({ path: "artifacts/guided-steps-360.png" });
  const stepsBox = await steps.boundingBox();
  const answerBox = await page.locator("textarea, [role=radiogroup]").first().boundingBox();
  expect(stepsBox && answerBox && stepsBox.y < answerBox.y).toBeTruthy();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // Unaided: no hint ladder at all.
  await page.goto(`/practice?topic=${encodeURIComponent(TOPIC)}&unaided=1`);
  await expect(page.getByRole("heading", { level: 1, name: "Unaided exam question" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("unaided-step-note")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reveal / })).toHaveCount(0);

  // Timed: a visible exam-pace clock that ticks, no hints, and it stops at marking.
  await page.goto(`/practice?topic=${encodeURIComponent(TOPIC)}&timed=1&command=explain`);
  await expect(page.getByRole("heading", { level: 1, name: /^Timed question/ })).toBeVisible({ timeout: 30_000 });
  const timer = page.getByTestId("exam-pace-timer");
  await expect(timer).toBeVisible();
  await expect(timer).toContainText("exam pace");
  await expect(page.getByRole("button", { name: /^Reveal / })).toHaveCount(0);
  const first = await timer.getByRole("timer").innerText();
  await expect.poll(async () => timer.getByRole("timer").innerText(), { timeout: 5_000 }).not.toBe(first);
  const field = page.locator("textarea").first();
  if (await field.count()) {
    await field.fill("Because the resultant force acts against the motion.");
    await page.getByRole("button", { name: /^(Not sure · submit|Submit for marking)$/ }).click();
    await expect(timer).toContainText("Time taken", { timeout: 30_000 });
  }
});
