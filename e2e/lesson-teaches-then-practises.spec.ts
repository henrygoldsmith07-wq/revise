import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// A taught WJEC Physics lesson at 360px: it teaches from its first screen,
// gives each step one task (a check, a worked example a step at a time, an
// exam question answered before its model), and ends on a question, not only
// on the next lesson. Nothing is mocked; the lesson records no evidence.
test("a taught lesson teaches from the first screen and hands on to an exam question", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
    await expect(main).toBeVisible({ timeout: 15_000 });
  }
  await page.goto("/lesson?subject=wjec-alevel-physics&topic=wjec-alevel-physics.kinematics-dynamics&checkpoint=wjec-alevel-physics.kinematics-dynamics.sp-01");
  await expect(main.getByText(/^Checkpoint 1 of \d+\./)).toBeVisible({ timeout: 30_000 });

  // Step 1 is the idea itself and a question on it: no orientation screen and
  // no typed "recall" of text that is still on the page.
  await expect(main).toContainText("Step 1 of 4");
  await expect(main).toContainText("A scalar has size only");
  await expect(main).not.toContainText("Know the target");
  await expect(main.getByRole("textbox", { name: "Your active recall answer" })).toHaveCount(0);
  const next = main.getByRole("button", { name: "Next", exact: true });
  await expect(main.getByRole("button", { name: "Choose an answer" })).toBeDisabled();
  await main.getByRole("button", { name: /Its displacement/ }).click();
  await expect(main).toContainText(/Correct — you have the idea\./);
  await next.click();

  // Step 2: the worked example is revealed a step at a time.
  const worked = main.getByTestId("worked-steps");
  await expect(worked).toBeVisible();
  await expect(worked.getByRole("listitem")).toHaveCount(1);
  await expect(main.getByRole("button", { name: "Show every step first" })).toBeDisabled();
  while (await worked.getByRole("button", { name: /Show the next step|Show the answer/ }).count()) {
    await worked.getByRole("button", { name: /Show the next step|Show the answer/ }).click();
  }
  await expect(worked).toContainText("Answer:");
  await next.click();

  // Step 3: an exam question, answered before the model is shown.
  const apply = main.getByTestId("lesson-apply");
  await expect(apply).not.toContainText("Model answer");
  await expect(main.getByRole("button", { name: "Write your answer first" })).toBeDisabled();
  await apply.getByRole("textbox", { name: "Your answer to the exam question" }).fill("12 sin 40 = 7.7 N; the horizontal part cannot lift the box.");
  await apply.getByRole("button", { name: "Compare with the model answer" }).click();
  await expect(apply).toContainText("You wrote");
  await expect(apply).toContainText("Model answer");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
  await next.click();

  // Step 4: the usual mistake is a decision; neither option is given away first.
  await expect(main).toContainText("Spot the usual mistake");
  await main.getByRole("button", { name: /Use cos for the side adjacent/ }).click();
  await main.getByRole("button", { name: "Finish lesson" }).click();

  // The summary leads to a question on the lesson's point, said to be practice.
  const handoff = main.getByTestId("lesson-practice-handoff");
  await expect(handoff).toContainText("Practice, not proof.");
  const link = handoff.getByRole("link", { name: "Try an exam question on this" });
  await expect(link).toHaveAttribute("href", /\/practice\?topic=wjec-alevel-physics\.kinematics-dynamics&unaided=1&minutes=6&point=wjec-alevel-physics\.kinematics-dynamics\.sp-01&from=lesson$/);
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: "Unaided exam question" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("step-length-note")).toContainText("Opened from your lesson");
  await expect(page.getByTestId("step-point-note")).toContainText("your lesson taught");
  await expect(main).not.toContainText(/mark you lost|repair plan/);
  await expect(page.getByTestId("unaided-step-note")).toContainText("counts as practice, not proof");
});
