import { expect, test, type Page, type Route } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// ---------------------------------------------------------------------------
// AI marking supply-chain failure drills.
//
// The AI provider chain is a free-tier supply chain: 429s, 5xx and broken
// payloads are normal operating conditions, not exceptions. These specs force
// each failure mode at the network boundary (page.route, so no provider key or
// external service is involved) and assert what the student actually sees:
//
//   * a 503 from the mark route must degrade to the rubric fallback with an
//     honest "from the spec content on this device" badge — never a crash,
//     never a stuck "Marking…" state;
//   * an AI response with confidence 0 must be treated as untrustworthy:
//     the student is told the mark is not counted ("AI mark not counted"),
//     and never that a person will review it, because nobody does.
//
// Both tests drive a real written question through the real submit path, so
// the DLQ enqueue, escalation record and attempt persistence all run for real.
// ---------------------------------------------------------------------------

/** Route every /api/ai mark request to `status` with a JSON error body. */
async function failMarksWith(page: Page, status: number, error: string): Promise<void> {
  await page.route("**/api/ai", async (route: Route) => {
    const body = route.request().postDataJSON() as { task?: string } | null;
    if (body?.task === "mark") {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error }) });
      return;
    }
    await route.fallback();
  });
}

/**
 * AI is off until the learner opts in (Settings → AI), so no mark request
 * would reach the route at all without this. Local mode records the choice
 * on the device and sends the versioned consent header.
 */
async function enableAiConsent(page: Page): Promise<void> {
  await page.goto("/settings");
  const section = page.locator("section", { hasText: "Use AI for marking, explanations" });
  // Settings renders after the store loads, and its buttons can paint before
  // React attaches handlers. `toggle.count()` right after goto raced that and
  // skipped the click (0 matches), so wait for the toggle, then click until it
  // reports pressed.
  const toggle = section.getByRole("button", { name: /^(On|Off)$/ });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    // Never click while a previous choice is still saving (disabled): the
    // click would land after it settled and switch AI back off.
    await expect(toggle).toBeEnabled({ timeout: 10_000 });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(section.getByRole("button", { name: "On" })).toBeVisible({ timeout: 10_000 });
}

/** Reach the practice runner on a non-MCQ question with the shell hydrated. */
async function openWrittenQuestion(page: Page): Promise<void> {
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(main).toBeVisible({ timeout: 15_000 });
  }
  await enableAiConsent(page);
  // Default practice mode queues written questions first; the runner renders
  // the stem and the answer textarea once a question is current.
  await page.goto("/practice");
  // A multi-part question renders one textarea per part.
  await expect(main.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
}

/** Every written part needs some text before submit unlocks. */
async function answerEveryPart(page: Page, text: string): Promise<void> {
  const boxes = page.locator("main textarea");
  for (let index = 0; index < (await boxes.count()); index += 1) await boxes.nth(index).fill(text);
}

test("a 503 from the AI mark route degrades to the rubric fallback without crashing", async ({ page }) => {
  await failMarksWith(page, 503, "upstream provider unavailable");
  await openWrittenQuestion(page);

  await answerEveryPart(page, "Water moves through the xylem by transpiration pull.");
  await page.getByRole("button", { name: "Submit for marking" }).click();

  // The fallback badge proves the rubric answered; the UI stays interactive.
  const main = page.locator("main#main");
  await expect(main.getByText("From the spec content on this device")).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("Marking…")).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Submit for marking" })).toHaveCount(0);
});

test("a 0-confidence AI mark is left out of progress, and no human review is promised", async ({ page }) => {
  // Intercept the mark call and answer with a schema-valid AI mark whose
  // confidence is exactly 0: the provider "worked", but claims no trust in
  // itself. assessLowConfidenceMark must keep that mark out of progress.
  await page.route("**/api/ai", async (route: Route) => {
    const body = route.request().postDataJSON() as
      | { task?: string; payload?: { question?: { parts?: { id: string; marks: number }[] } } }
      | null;
    if (body?.task === "mark" && body.payload?.question) {
      const parts = body.payload.question.parts ?? [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "ai",
          data: {
            marked: parts.map((part) => ({
              partId: part.id,
              awarded: 0,
              max: part.marks,
              creditedPoints: [],
              missedPoints: ["No creditable points found in the submitted answer."],
              comment: "The submitted answer does not address the mark scheme.",
            })),
            feedback: "This answer does not engage with the question.",
            confidence: 0,
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  await openWrittenQuestion(page);
  await answerEveryPart(page, "Water moves through the xylem by transpiration pull.");
  await page.getByRole("button", { name: "Submit for marking" }).click();

  const main = page.locator("main#main");
  const reviewStatus = main.getByTestId("ai-mark-not-counted");
  await expect(reviewStatus).toBeVisible({ timeout: 20_000 });
  await expect(reviewStatus).toContainText("AI mark not counted");
  await expect(reviewStatus).toContainText("The AI marker was only 0% sure of this mark, below the 60% it needs");
  await expect(reviewStatus).toContainText("left out of your progress");
  // Nothing in the product sends a mark to a person, so nothing may say so.
  await expect(main).not.toContainText(/Human review requested|second-marker/);

  // The pending record is saved with the attempt (IndexedDB + sync outbox),
  // which is what keeps it out of progress; the box stays on the result.
  await expect(reviewStatus).toBeVisible();
});
