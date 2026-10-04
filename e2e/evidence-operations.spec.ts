import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { verifyThroughWorkflow, wq, PROMPTS, SUBJECT } from "../tests/helpers-review";
import type { Question } from "../src/domain/types";

async function onboard(page: Page) {
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page, { board: "WJEC", subjectNames: ["Mathematics"], examDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10) });
  await expect(page.locator("main#main")).toBeVisible();
}

// Only this browser receives these two-reviewer fixtures. Neither the repository
// review log nor corpus is changed; this tests claim behaviour, not real efficacy.
async function seedReviewChain(page: Page, proven: boolean) {
  const base = await page.evaluate(async (subject): Promise<Question> => {
    const db: IDBDatabase = await new Promise((resolve, reject) => { const r = indexedDB.open("revise"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows: Question[] = await new Promise(resolve => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return rows.find(q => q.subjectId === subject)!;
  }, SUBJECT);
  const topic = base.topicIds[0]!;
  const slug = topic.replace(`${SUBJECT}.`, "");
  const bank = [0, 1, 2].map(i => ({ ...wq(`cnt:question:e2e-evidence-${i}`, slug, PROMPTS[i]!, { marks: 3 }), origin: "manual" as const }));
  const trusted = verifyThroughWorkflow(bank, (proven ? bank : bank.slice(0, 2)).map(q => q.id)).questions;
  await page.evaluate(async ({ questions, topic, subject, proven }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => { const r = indexedDB.open("revise"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const cards: { userId: string }[] = await new Promise(resolve => { const r = db.transaction("cards").objectStore("cards").getAll(); r.onsuccess = () => resolve(r.result); });
    const userId = cards[0]!.userId;
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const tx = db.transaction(["questions", "attempts", "mistakes"], "readwrite");
    for (const q of questions) tx.objectStore("questions").put(q);
    for (const [i, days] of (proven ? [12, 7, 2] : [12, 7]).entries()) tx.objectStore("attempts").put({
      id: `e2e-evidence-attempt-${i}`, userId, questionId: questions[i]!.id, subjectId: subject, topicIds: [topic],
      answers: {}, marked: [], awarded: i === 0 ? 0 : 3, max: 3, feedback: "Test fixture", markedBy: "rubric", elapsedMs: 60_000,
      mode: "practice", createdAt: ago(days), ...(i ? { retestMistakeId: "e2e-evidence-mistake" } : {}),
    });
    tx.objectStore("mistakes").put({ id: "e2e-evidence-mistake", userId, subjectId: subject, topicId: topic, questionId: questions[0]!.id,
      attemptId: "e2e-evidence-attempt-0", marksLost: 3, category: "method", description: "Test fixture only", resolved: false, createdAt: ago(12) });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { questions: trusted, topic, subject: SUBJECT, proven });
  await page.goto("/");
}

for (const width of [390, 1280]) {
  test(`reviewed proof remains honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page);
    await seedReviewChain(page, false);
    const main = page.locator("main#main");
    await expect(main).toContainText("You improved on this topic", { timeout: 30_000 });
    await expect(main).toContainText("different reviewed question");
    await expect(main.getByRole("link", { name: "Start session", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/readiness");
    await expect(page.locator("section[aria-label='Marks recovered']")).toContainText("0 marks proven recovered", { timeout: 30_000 });
    await seedReviewChain(page, true);
    await page.goto("/readiness");
    await expect(page.locator("section[aria-label='Marks recovered']")).toContainText("3 marks proven recovered", { timeout: 30_000 });
  });
}

test("pilot export is opt-in and redacts answers/account identity", async ({ page }) => {
  await onboard(page);
  await page.goto("/settings");
  await page.getByText("Pilot evidence export", { exact: true }).click();
  const button = page.getByRole("button", { name: "Export pilot evidence", exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel("I agree to export my pilot evidence").check();
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^revise-pilot-[a-f0-9-]+\.json$/);
  const path = await file.path();
  const { readFile } = await import("node:fs/promises");
  const payload = JSON.parse(await readFile(path!, "utf8"));
  expect(payload.learners).toHaveLength(1);
  expect(payload.learners[0].consented).toBe(true);
  expect(payload.learners[0].attempts.every((a: { answers: object; feedback: string }) => Object.keys(a.answers).length === 0 && a.feedback === "")).toBe(true);
});
