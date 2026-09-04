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
//   * an AI response with confidence 0 must be treated as untrustworthy and
//     escalate straight into the human-review queue ("Human review requested"),
//     and the escalation must survive on the Progress page.
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

/** Reach the practice runner on a non-MCQ question with the shell hydrated. */
async function openWrittenQuestion(page: Page): Promise<void> {
  await page.goto("/");
  const main = page.locator("main#main");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page);
    await expect(main).toBeVisible({ timeout: 15_000 });
  }
  // Default practice mode queues written questions first; the runner renders
  // the stem and the answer textarea once a question is current.
  await page.goto("/practice");
  await expect(main.locator("textarea")).toBeVisible({ timeout: 30_000 });
}

test("a 503 from the AI mark route degrades to the rubric fallback without crashing", async ({ page }) => {
  await failMarksWith(page, 503, "upstream provider unavailable");
  await openWrittenQuestion(page);

  // Every written part needs some text before submit unlocks.
  await page.locator("main textarea").first().fill("Water moves through the xylem by transpiration pull.");
  await page.getByRole("button", { name: "Submit for marking" }).click();

  // The fallback badge proves the rubric answered; the UI stays interactive.
  const main = page.locator("main#main");
  await expect(main.getByText("From the spec content on this device")).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("Marking…")).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Submit for marking" })).toHaveCount(0);
});

test("a 0-confidence AI mark is escalated to the human-review queue", async ({ page }) => {
  // Intercept the mark call and answer with a schema-valid AI mark whose
  // confidence is exactly 0: the provider "worked", but claims no trust in
  // itself. assessLowConfidenceMark must route that to human review.
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
  await page.locator("main textarea").first().fill("Water moves through the xylem by transpiration pull.");
  await page.getByRole("button", { name: "Submit for marking" }).click();

  const main = page.locator("main#main");
  // The mark came from "AI", so the escalation banner — not a crash — is the
  // contract for a zero-confidence grade.
  await expect(main.getByText("Human review requested")).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("AI confidence 0%")).toBeVisible();
  await expect(main.getByRole("status")).toContainText("second-marker");

  // The escalation is persisted with the attempt and surfaces on Progress.
  await page.goto("/progress");
  await expect(page.locator("main#main").getByText(/escalation|Human review/i).first()).toBeVisible({
    timeout: 30_000,
  });
});
