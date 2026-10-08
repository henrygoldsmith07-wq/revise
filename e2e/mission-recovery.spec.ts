import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Seeds lost marks (and, for the proof journey, an earlier independent success) straight into
// IndexedDB with past dates, so the multi-day loop can be exercised in one run: lost marks →
// mission → mission session → closure → next action, and delayed proof once the delay has passed.

async function openToday(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") {
    await completeOnboarding(page, { examDate: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) });
  }
  await page.waitForTimeout(3000);
}

async function seed(page: Page, opts: { withEarlierSuccess: boolean }) {
  const info = await page.evaluate(async ({ withEarlierSuccess }) => {
    type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const name = (await indexedDB.databases()).map((d) => d.name!).find((n) => n === "revise")!;
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (store: string): Promise<Row[]> => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const cards = await all("cards");
    const subject = cards[0]!.subjectId as string;
    const userId = cards[0]!.userId as string;
    const questions = (await all("questions")).filter((q) => q.subjectId === subject && q.kind !== "mcq" && q.totalMarks >= 2);
    const byTopic = new Map<string, Row[]>();
    for (const q of questions) byTopic.set(q.topicIds[0], [...(byTopic.get(q.topicIds[0]) ?? []), q]);
    const [topic, pool] = [...byTopic].sort((a, b) => b[1].length - a[1].length)[0]!;
    const [q0, q1, q2] = pool;
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const attempt = (id: string, q: Row, awarded: number, at: string): Row => ({
      id, userId, questionId: q.id, subjectId: q.subjectId, topicIds: q.topicIds, answers: {}, marked: [{ partId: q.parts[0].id, awarded, max: q.totalMarks, points: [] }],
      awarded, max: q.totalMarks, feedback: "", markedBy: "rubric", elapsedMs: 90_000, mode: "practice", createdAt: at,
    });
    const tx = db.transaction(["attempts", "mistakes"], "readwrite");
    [q0!, q1!].forEach((q, i) => {
      const at = ago(12 - i);
      tx.objectStore("attempts").put(attempt(`seed-att-${i}`, q, 0, at));
      tx.objectStore("mistakes").put({
        id: `seed-m-${i}`, userId, subjectId: q.subjectId, topicId: topic, questionId: q.id, attemptId: `seed-att-${i}`, partId: q.parts[0].id,
        marksLost: q.totalMarks, description: "Converted units incorrectly", category: "arithmetic", workingErrorKind: "unit-error", resolved: false, createdAt: at,
      });
    });
    if (withEarlierSuccess) tx.objectStore("attempts").put(attempt("seed-success", q2!, q2!.totalMarks, ago(8)));
    await new Promise((r) => { tx.oncomplete = r; });
    return { lost: q0!.totalMarks + q1!.totalMarks };
  }, opts);
  await page.goto("/");
  await page.locator("main#main").waitFor();
  await page.waitForTimeout(3500);
  return info;
}

async function answerAll(page: Page, count: number, text = "I do not know") {
  for (let n = 0; n < count; n++) {
    await page.waitForTimeout(2500);
    const box = page.getByLabel(/your answer/i).first();
    if (await box.isVisible().catch(() => false)) await box.fill(text, { timeout: 5000 });
    const submit = page.getByRole("button", { name: /submit for marking/i }).first();
    await submit.scrollIntoViewIfNeeded({ timeout: 5000 });
    await submit.click({ timeout: 5000 });
    const next = page.getByRole("button", { name: /Next question|Finish session/ });
    await expect(next).toBeEnabled({ timeout: 40_000 });
    await next.scrollIntoViewIfNeeded();
    await next.click();
  }
}

test("lost marks become one mission that runs, closes honestly and leaves no stale resume point", async ({ page }) => {
  test.setTimeout(240_000);
  await openToday(page);
  const { lost } = await seed(page, { withEarlierSuccess: false });
  const main = page.locator("main#main");

  await expect(main).toContainText("Your highest-value session");
  await expect(main).toContainText(`Recover ${lost} marks`);
  const start = main.getByRole("link", { name: "Start session", exact: true });
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(start).toHaveAttribute("href", /\/practice\?mission=.*stage=repair/);
  await start.click();

  await expect(main).toContainText("Repair it");
  await expect(main).toContainText(/Back to Today/);
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await answerAll(page, 2);

  await expect(main).toContainText("Session complete", { timeout: 15_000 });
  for (const heading of ["What changed", "Still weak", "Evidence created", "What happens next"]) await expect(main).toContainText(heading);
  await expect(main).toContainText("no delayed proof yet");

  await page.goto("/");
  await expect(main).toContainText("Your highest-value session", { timeout: 20_000 });
  await expect(main).not.toContainText("Resume interrupted revision");
  await expect(main).toContainText(/Needs work|Improving/);
});

test("once the delay has passed the same mission offers a proof check, not new work", async ({ page }) => {
  test.setTimeout(240_000);
  await openToday(page);
  await seed(page, { withEarlierSuccess: true });
  const main = page.locator("main#main");

  await expect(main).toContainText("Prove it");
  await expect(main).toContainText("Awaiting proof");
  const start = main.getByRole("link", { name: "Start session", exact: true });
  await expect(start).toHaveAttribute("href", /stage=delayed-proof/);
  await start.click();

  await expect(main).toContainText("Delayed check");
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await page.waitForTimeout(2500);
  // The proof stage is unaided: no hint ladder is offered, so the answer counts as independent evidence.
  await expect(page.getByRole("button", { name: /reveal a small cue/i })).toHaveCount(0);
});

// Answers whatever question is on screen correctly, using the app's own bank: MCQ → the right option,
// otherwise each part gets its mark-scheme points (not the model answer, so it is not flagged as copied).
async function answerCorrectly(page: Page, count: number) {
  for (let n = 0; n < count; n++) {
    await page.waitForTimeout(2500);
    const plan = await page.evaluate(async () => {
      type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const name = (await indexedDB.databases()).map((d) => d.name!).find((x) => x === "revise")!;
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const qs: Row[] = await new Promise((res) => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => res(r.result as Row[]); });
      const text = document.querySelector("main#main")!.textContent ?? "";
      const q = qs.filter((x) => x.stem && text.includes(String(x.stem).slice(0, 60))).sort((a, b) => b.stem.length - a.stem.length)[0];
      if (!q) return null;
      return { kind: q.kind as string, option: q.kind === "mcq" ? (q.options[q.correctIndex] as string) : null, parts: (q.parts as Row[]).map((p) => (p.markScheme as string[]).join(". ")) };
    });
    expect(plan, "the question on screen should be in the bank").not.toBeNull();
    if (plan!.kind === "mcq") {
      await page.getByRole("radio", { name: new RegExp(plan!.option!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    } else {
      const boxes = page.getByLabel(/your answer/i);
      const count = await boxes.count();
      for (let i = 0; i < count; i++) await boxes.nth(i).fill(plan!.parts[i] ?? plan!.parts[0]!);
    }
    const submit = page.getByRole("button", { name: /submit for marking/i }).first();
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    const next = page.getByRole("button", { name: /Next question|Finish session/ });
    await expect(next).toBeEnabled({ timeout: 40_000 });
    await next.scrollIntoViewIfNeeded();
    await next.click();
  }
}

test("a delayed independent success on a different question proves the marks, and Today moves on", async ({ page }) => {
  test.setTimeout(280_000);
  await openToday(page);
  await seed(page, { withEarlierSuccess: true });
  const main = page.locator("main#main");

  await expect(main).toContainText("Prove it");
  await main.getByRole("link", { name: "Start session", exact: true }).click();
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await answerCorrectly(page, 2);
  await expect(main).toContainText("Session complete", { timeout: 15_000 });
  await expect(main).toContainText("delayed proof passed");

  await page.goto("/readiness");
  const panel = page.locator("section[aria-label='Marks recovered']");
  await expect(panel).toContainText(/proven recovered/i, { timeout: 20_000 });
  await expect(panel).not.toContainText(/0 proven recovered/);

  await page.goto("/");
  await expect(main).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(main).not.toContainText("Prove it");
});
