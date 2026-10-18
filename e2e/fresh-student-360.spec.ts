import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// ---------------------------------------------------------------------------
// A fresh Year 12 WJEC Physics student, start to finish, on a 360px phone
// (thirty-first pass). Onboarding → quick check (answered badly) → the best
// next step → repair → the lesson a lost mark links to → Schedule → the proof
// section. Each screen must fit 360px, nothing may reach huggingface.co (the
// semantic cache used to fetch its model on the first marked answer, AI off),
// and the lesson must not promise "Explain that define …".
//
// Known and left alone: Zod's one-off `new Function("")` probe raises a
// `script-src eval` CSP report on every load (caught by Zod, nothing breaks).
// It is filtered below and listed in the thirty-first pass findings.
// ---------------------------------------------------------------------------

test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 10; SM-A105F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
});

async function fits(page: Page, where: string) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { message: `${where} scrolled sideways at 360px` })
    .toBe(true);
}

/** Answer the current question without really trying (first option, or "I am not sure.") and submit. */
async function answerBadly(page: Page) {
  const main = page.locator("main#main");
  const boxes = main.locator("textarea");
  if (await boxes.count()) {
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill("I am not sure.");
  } else {
    await main.getByRole("radio").first().click();
  }
  await main.getByRole("button", { name: /Submit for marking/ }).click();
}

test("fresh WJEC Physics student: quick check → repair → lesson → plan → proof, at 360px", async ({ page }) => {
  test.setTimeout(300_000);
  const thirdParty: string[] = [];
  page.on("request", (request) => {
    if (/huggingface\.co|hf\.co/.test(request.url())) thirdParty.push(request.url());
  });
  // Collected across navigations: each page reports to the test process.
  const csp: string[] = [];
  await page.exposeFunction("__reportCsp", (violation: string) => csp.push(violation));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const cspViolations = () => csp.filter((v) => v !== "script-src eval" && v !== "script-src-elem eval");

  await page.goto("/");
  await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], stayOnQuickCheck: true });
  await page.waitForURL(/\/diagnostic\?subject=wjec-alevel-physics/, { timeout: 30_000 });
  const main = page.locator("main#main");
  await fits(page, "the quick check");

  // Quick check: answer every question badly; each one is marked on the device.
  for (let question = 0; question < 8; question++) {
    const found = main.getByText("What I found");
    if (await found.isVisible().catch(() => false)) break;
    await expect(main.getByText(/Question \d+ of \d+/).first()).toBeVisible({ timeout: 30_000 });
    await answerBadly(page);
    await expect(main.getByText(/on this one\./).first()).toBeVisible({ timeout: 20_000 });
    await main.getByRole("button", { name: /Next question|See what I found/ }).first().click();
  }
  await expect(main.getByText("What I found")).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("Best next step")).toBeVisible();
  await fits(page, "the quick-check result");

  // The best next step is a repair mission for marks just lost.
  await main.getByRole("link", { name: "Start session" }).first().click();
  await page.waitForURL(/\/practice\?mission=.*stage=repair/, { timeout: 30_000 });
  await fits(page, "the repair brief");
  await main.getByRole("button", { name: /Start mission step/ }).click();
  await expect(main.getByRole("button", { name: /Submit for marking/ })).toBeVisible({ timeout: 30_000 });
  await answerBadly(page);
  await expect(main.getByText(/What you missed/i).first()).toBeVisible({ timeout: 20_000 });
  await fits(page, "the repair feedback");

  // A lost mark links to the lesson for its spec point. Below full marks the
  // link sits inside the collapsed "More help with this answer" disclosure.
  const lesson = main.locator('a[href^="/lesson?"][href*="checkpoint="]').first();
  if (!(await lesson.isVisible())) await main.getByText("More help with this answer").first().click();
  await expect(lesson).toBeVisible();
  await lesson.click();
  await page.waitForURL(/\/lesson\?.*checkpoint=/, { timeout: 30_000 });
  await expect(main.getByText("Lesson progress")).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText("Explain that define");
  await fits(page, "the lesson");

  await page.goto("/schedule");
  await expect(main.getByRole("heading", { name: "Schedule" }).first()).toBeVisible({ timeout: 30_000 });
  await fits(page, "the schedule");

  await page.goto("/readiness#proof");
  await expect(main.getByText("Proof of improvement").first()).toBeVisible({ timeout: 30_000 });
  await fits(page, "the proof section");

  expect(thirdParty, "a student with AI off reached huggingface.co").toEqual([]);
  expect(cspViolations(), "CSP violations other than Zod's eval probe").toEqual([]);
});
