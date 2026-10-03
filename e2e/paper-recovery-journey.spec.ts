import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { runQuestionSet } from "./journey-helpers";

// A persisted paper becomes lost marks, then one recovery mission: repair, an unaided answer on
// different questions, then (after the delay) a proof check. Marks are called recovered only at the end.
// Time is moved by back-dating stored attempts, exactly as a real week would age them.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function openDb(page: Page) {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).map((d) => d.name!).find((n) => n === "revise");
    return name ?? null;
  });
}

async function seedPaper(page: Page) {
  expect(await openDb(page)).toBe("revise");
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (store: string): Promise<Row[]> => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const cards = await all("cards");
    const subject = cards[0]!.subjectId as string;
    const userId = cards[0]!.userId as string;
    const questions = (await all("questions")).filter((q) => q.subjectId === subject && q.kind !== "mcq" && q.totalMarks >= 2);
    const byTopic = new Map<string, Row[]>();
    for (const q of questions) byTopic.set(q.topicIds[0], [...(byTopic.get(q.topicIds[0]) ?? []), q]);
    const [topic, pool] = [...byTopic].sort((a, b) => b[1].length - a[1].length)[0]!;
    const sat = pool.slice(0, 2);
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const paper = { id: "e2e-paper", userId, subjectId: subject, title: "E2E mock paper", totalMarks: sat.reduce((s, q) => s + q.totalMarks, 0), questionIds: sat.map((q) => q.id), status: "practised", createdAt: ago(12) };
    const tx = db.transaction(["papers", "attempts", "mistakes"], "readwrite");
    tx.objectStore("papers").put(paper);
    sat.forEach((q, i) => {
      const at = ago(12 - i * 0.01);
      const lost = true;
      tx.objectStore("attempts").put({
        id: `e2e-att-${i}`, userId, questionId: q.id, subjectId: q.subjectId, topicIds: q.topicIds, answers: {},
        marked: [{ partId: q.parts[0].id, awarded: lost ? 0 : q.totalMarks, max: q.totalMarks, points: [] }],
        awarded: lost ? 0 : q.totalMarks, max: q.totalMarks, feedback: "", markedBy: "rubric", elapsedMs: 120_000, mode: "paper",
        paperId: paper.id, paperRunId: "e2e-run", createdAt: at,
      });
      if (lost) {
        tx.objectStore("mistakes").put({
          id: `e2e-m-${i}`, userId, subjectId: q.subjectId, topicId: topic, questionId: q.id, attemptId: `e2e-att-${i}`, partId: q.parts[0].id,
          marksLost: q.totalMarks, description: "Converted units incorrectly", category: "arithmetic", workingErrorKind: "unit-error", resolved: false, createdAt: at,
        });
      }
    });
    await new Promise((r) => { tx.oncomplete = r; });
    return { lost: sat.reduce((s, q) => s + q.totalMarks, 0) };
  });
}

/** Moves every mission attempt back in time so the proof delay has genuinely passed. */
async function ageMissionAttempts(page: Page, days: number) {
  await page.evaluate(async (d) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rows: Row[] = await new Promise((res) => { const r = db.transaction("attempts").objectStore("attempts").getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const tx = db.transaction("attempts", "readwrite");
    for (const a of rows.filter((x) => x.mission)) tx.objectStore("attempts").put({ ...a, createdAt: new Date(Date.parse(a.createdAt) - d * 86_400_000).toISOString() });
    await new Promise((r) => { tx.oncomplete = r; });
  }, days);
}

test("paper → lost marks → mission → repair → unaided success → delayed proof → marks recovered", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page, { examDate: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10) });
  await page.waitForTimeout(3000);
  const { lost } = await seedPaper(page);
  const main = page.locator("main#main");

  // The paper result: what was lost, where, why, what to do next, and an honest state.
  await page.goto("/papers");
  await main.waitFor();
  const result = main.getByLabel("Paper result").first();
  await main.locator("summary", { hasText: "E2E mock paper" }).click();
  await expect(result).toContainText(`You lost ${lost}`, { timeout: 30_000 });
  await expect(result).toContainText("Lost in:");
  await expect(result).toContainText("Likely reason:");
  await expect(result).toContainText("Needs work");
  await expect(result).toContainText(`Recover ${lost} mark`);
  await expect(result).not.toContainText(/proven recovered|Proven/);
  const recover = result.getByRole("link", { name: /^Recover/ });
  await expect(recover).toHaveAttribute("href", /\/practice\?mission=.*stage=/);
  await recover.click();
  await expect(page).toHaveURL(/mission=/);
  const missionId = new URL(page.url()).searchParams.get("mission")!;

  // Repair, then Revise leads into the next step itself.
  await page.getByRole("button", { name: /Start mission step/ }).click();
  const count = async () => Number((await page.getByText(/Question 1 of (\d+)/).first().innerText()).match(/of (\d+)/)![1]);
  await runQuestionSet(page, await count(), true);
  await expect(main).toContainText("Session complete", { timeout: 30_000 });
  await expect(main).toContainText("no delayed proof yet");
  // Revise names the next best action itself rather than sending the student back to look for it.
  const next = main.getByRole("link", { name: /^Continue:/ });
  await expect(next).toBeVisible();
  await expect(next).toHaveAttribute("href", /^\//);

  // The unaided step on different questions: no hint ladder, so success counts as independent evidence.
  await page.goto(`/practice?mission=${encodeURIComponent(missionId)}&stage=apply`);
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await expect(page.getByRole("button", { name: /reveal a small cue/i })).toHaveCount(0);
  await runQuestionSet(page, await count(), true);
  await expect(main).toContainText("Session complete", { timeout: 30_000 });
  await expect(main).not.toContainText("delayed proof passed");

  // Two weeks later nothing has changed in the ledger, but the check is now due.
  await ageMissionAttempts(page, 8);
  await page.goto("/");
  await expect(main).toContainText(/Prove it/, { timeout: 40_000 });
  await expect(main).toContainText("Awaiting proof");
  await main.getByRole("link", { name: "Start session", exact: true }).click();
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await runQuestionSet(page, await count(), true);
  await expect(main).toContainText("delayed proof passed", { timeout: 30_000 });

  // Only now are the marks recovered, and the paper says so.
  await page.goto("/readiness");
  const panel = page.locator("section[aria-label='Marks recovered']");
  await expect(panel).toContainText(/proven recovered/i, { timeout: 30_000 });
  await expect(panel).not.toContainText(/\b0 marks proven recovered/);
  await page.goto("/papers");
  await main.locator("summary", { hasText: "E2E mock paper" }).click();
  await expect(main.getByLabel("Paper result").first()).toContainText(/Proven|Improving|Awaiting proof/, { timeout: 30_000 });
});
