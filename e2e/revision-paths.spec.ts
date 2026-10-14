import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

/** Real UI journeys only: no seeded learner data, auth stubs or network mocks. */
async function onboardPhysics(page: Page) {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], examDate: "2027-06-01" });
  }
  await expect(page.locator("main#main")).toBeVisible();
}

test("generic technique submissions detect structure and survive reload while the response resets", async ({ page }) => {
  await onboardPhysics(page);
  await page.goto("/technique");
  await expect(page.getByRole("heading", { name: "Make the command word work for you" })).toBeVisible();
  const group = page.getByRole("group", { name: "Technique drill", exact: true });
  const flows = [
    { title: "Describe", answer: "The mean wait decreased from 12 minutes to 8 minutes, a decrease of 4 minutes.", signal: "Observation wording: signal detected" },
    { title: "Explain", answer: "Two staffed desks could reduce the wait because two requests can be handled at the same time, so the queue clears faster. This is a proposed reason, not proof from the trial.", signal: "An explicit reason link: signal detected" },
    { title: "Evaluate", answer: "The mean wait fell from 12 to 8 minutes. However, visitor numbers differed and the trial lasted one day. Overall, I would extend the trial because a comparable week is needed.", signal: "Overall judgement wording: signal detected" },
    { title: "6-mark structure", answer: "Evidence: the mean wait decreased from 12 to 8 minutes.\nReasoning: two staffed desks could handle more requests because both work simultaneously.\nLimitation: however, visitor numbers differed and only one day was measured.\nJudgement: overall, repeat the trial because the present evidence is limited.", signal: "Several sentences or plan sections: signal detected" },
  ];
  for (const flow of flows) {
    await group.getByRole("button", { name: flow.title, exact: true }).click();
    await page.locator("#technique-answer").fill(flow.answer);
    await page.getByRole("button", { name: "Check response structure", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Submission saved on this device" })).toBeVisible();
    await expect(page.getByText(flow.signal, { exact: true })).toBeVisible();
    await expect(page.getByText(`${flow.title}: 1 submissions`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Structure feedback — not a mark", { exact: true })).toBeVisible();
  await page.reload();
  for (const flow of flows) await expect(page.getByText(`${flow.title}: 1 submissions`, { exact: true })).toBeVisible();
  await expect(page.locator("#technique-answer")).toHaveValue("");
  await expect(page.getByText("Structure feedback — not a mark", { exact: true })).toHaveCount(0);
});

test("WJEC Physics practical stages have supported destinations and Sunday plan retains the saved exam", async ({ page }) => {
  await onboardPhysics(page);
  await page.goto("/practicals");
  await expect(page.getByRole("heading", { name: "Practical-topic pathways", exact: true })).toBeVisible();
  const subject = page.getByLabel("Choose a WJEC A-level subject");
  await subject.selectOption("wjec-alevel-physics");
  await expect(subject).toHaveValue("wjec-alevel-physics");
  const paths = page.getByRole("list", { name: /learning path$/ });
  await expect(paths.getByRole("heading", { name: "1. Method and controls", exact: true })).toBeVisible();
  await expect(paths.getByRole("heading", { name: "2. Errors and uncertainty", exact: true })).toBeVisible();
  await expect(paths.getByRole("heading", { name: "3. Graphs and conclusions", exact: true })).toBeVisible();
  const lessons = ["Study method", "Study errors and uncertainty", "Study graphs"];
  for (const label of lessons) {
    const link = paths.getByRole("link", { name: label, exact: true });
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    const url = new URL(href!, "http://localhost");
    expect(url.pathname).toBe("/lesson");
    expect(url.searchParams.get("subject")).toBe("wjec-alevel-physics");
    expect(url.searchParams.get("topic")).toMatch(/^wjec-alevel-physics\./);
    expect([...url.searchParams.keys()].sort()).toEqual(["subject", "topic"]);
  }
  // A prompt link must target a concrete question, not an invented skill filter.
  await expect(page.getByRole("status").filter({ hasText: "Available question prompts loaded" })).toBeVisible({ timeout: 30_000 });
  const practiceLinks = paths.getByRole("link", { name: /^Open a .* practice question$/ });
  for (const link of await practiceLinks.all()) {
    const url = new URL((await link.getAttribute("href"))!, "http://localhost");
    expect(url.pathname).toBe("/practice");
    expect(url.searchParams.get("subject")).toBe("wjec-alevel-physics");
    expect(url.searchParams.get("topic")).toMatch(/^wjec-alevel-physics\./);
    expect(url.searchParams.get("question")).toBeTruthy();
    expect([...url.searchParams.keys()].sort()).toEqual(["question", "subject", "topic"]);
  }
  for (const label of lessons) {
    await paths.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(/\/lesson\?subject=wjec-alevel-physics&topic=wjec-alevel-physics\./);
    await expect(page.getByRole("heading", { name: "Learning roadmap", exact: true })).toBeVisible();
    await page.goto("/practicals");
    await expect(subject).toHaveValue("wjec-alevel-physics");
  }
  await page.goto("/");
  const plan = page.getByRole("region", { name: "Sunday plan: what moved, what’s next", exact: true });
  const optIn = plan.getByRole("button", { name: "Turn on weekly plan", exact: true });
  await expect(optIn).toHaveAttribute("aria-pressed", "false");
  await expect(plan.getByText(/Saved weekly message/)).toHaveCount(0);
  await plan.getByRole("button", { name: "Preview without turning on", exact: true }).click();
  await expect(plan.getByText(/On-demand preview · week of/)).toBeVisible();
  await expect(plan.getByText(/Next saved exam:.*2027-06-01/)).toBeVisible();
  await expect(optIn).toHaveAttribute("aria-pressed", "false");
  await expect(plan.getByText(/This preview is not saved\./)).toBeVisible();
  await optIn.click();
  await expect(plan.getByRole("button", { name: "Turn off weekly plan", exact: true })).toHaveAttribute("aria-pressed", "true");
  const savedWeek = plan.getByText(/Saved weekly message · week of/);
  const captured = plan.getByText(/^Captured .*Frozen until/);
  await expect(savedWeek).toBeVisible();
  await expect(captured).toBeVisible();
  const weekText = await savedWeek.textContent();
  const capturedText = await captured.textContent();
  await page.reload();
  await expect(plan.getByRole("button", { name: "Turn off weekly plan", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(savedWeek).toHaveText(weekText!);
  await expect(captured).toHaveText(capturedText!);
  await expect(plan.getByText(/Next saved exam:.*2027-06-01/)).toBeVisible();
});

test("anonymous classes entry shows the real account boundary, never a demo roster", async ({ page }) => {
  // A new browser profile enters classes directly without seeding or bypassing onboarding.
  await page.goto("/classes");
  await expect(page.getByRole("heading", { name: "Your classes", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Sign in to use real classes", exact: true })).toBeVisible();
  await expect(page.getByText(/No demo roster\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Join class", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create class", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open account settings", exact: true })).toHaveAttribute("href", "/settings");
  await expect(page.getByText(/Revision that knows what to do next/i)).toHaveCount(0);
});
