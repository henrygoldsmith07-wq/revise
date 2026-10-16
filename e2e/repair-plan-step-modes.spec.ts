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
  // No question in the shipped bank has two teacher approvals yet, so the
  // plan's unaided and timed steps must say "practice", never "evidence".
  await expect(nextStep).not.toContainText(/counts as (your own )?evidence|will count as evidence/);
  const guidedLink = nextStep.getByRole("link", { name: /Guided application/ });
  await expect(guidedLink).toHaveAttribute("href", `/practice?topic=${encodeURIComponent(TOPIC)}&guided=1&minutes=8`);
  await guidedLink.click();
  // An 8-minute step at 90 s a mark: one 4-mark question (6 min), not three (18 min).
  await expect(page.getByText(/^0\/\d answered$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("step-length-note")).toContainText(/about \d+ min at exam pace/);

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
  const unaidedNote = page.getByTestId("unaided-step-note");
  await expect(unaidedNote).toBeVisible();
  // The note matches what is recorded: this question is unreviewed ("practice
  // evidence only" beside it), so its mark is practice, not "your own evidence".
  await expect(page.getByText("Needs human review · practice evidence only")).toBeVisible();
  await expect(unaidedNote).toHaveAttribute("data-evidence", "practice");
  await expect(unaidedNote).toContainText("counts as practice, not proof");
  await expect(page.getByText(/counts as your own evidence/)).toHaveCount(0);
  await unaidedNote.screenshot({ path: "artifacts/unaided-note-360.png" });
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

test("the worked-example step shows a worked solution first, then a fresh question, at 360px", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }
  await page.goto(`/practice?topic=${encodeURIComponent(TOPIC)}&worked=1&minutes=7`);
  await expect(page.getByRole("heading", { level: 1, name: "Worked example" })).toBeVisible({ timeout: 30_000 });
  const example = page.getByTestId("worked-example");
  await expect(example).toBeVisible();
  // The question's own authored model answer and mark-scheme points.
  await expect(example).toContainText("Model answer");
  await expect(example).toContainText("Marks are given for");
  await expect(example).toContainText("Practice, not proof");
  await expect(page.getByTestId("step-length-note")).toContainText("a worked example, then 1 question to try");
  await expect(page.getByText("0/1 answered")).toBeVisible();
  // Example first, then the try, and no hub cards.
  const exampleBox = await example.boundingBox();
  const answerBox = await page.locator("textarea, [role=radiogroup]").first().boundingBox();
  expect(exampleBox && answerBox && exampleBox.y < answerBox.y).toBeTruthy();
  await expect(page.getByText("Do only questions I got wrong")).toHaveCount(0);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
  await example.screenshot({ path: "artifacts/worked-example-360.png" });
  // It collapses so the try is reachable on a phone.
  await example.locator("summary").click();
  await expect(example.getByText("Model answer")).toBeHidden();
});
