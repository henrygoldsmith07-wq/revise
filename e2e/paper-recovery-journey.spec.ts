import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";
import { runQuestionSet } from "./journey-helpers";
import { putQuestions, readSubjectQuestions, trustIdsViaWorkflow } from "./review-fixture";

// A persisted paper becomes lost marks, then one recovery mission: repair, an unaided answer on
// different questions, then (after the delay) a spaced practice check. Time is moved by back-dating
// stored attempts, exactly as a real week would age them.
//
// HONEST STATE, NOT A PROOF JOURNEY (changed 2026-10-11): the lost marks come from mode "paper"
// attempts, and a WJEC paper-mode loss only counts towards proof through authenticPaperEvidence
// (learning-evidence.ts): a source:"past-paper" question with verified WJEC paper provenance AND a
// human-reviewed paper-marking attestation. This mock paper has neither, so its marks can never be
// proven recovered, however many reviewed questions follow. The journey used to expect "Awaiting
// proof" and a proof check, which the product could never deliver (a dead end). It now asserts that
// Revise says why, routes the student to practice with a spaced check, and never claims proof.
// Faking provenance or marking attestations would weaken a trust rule, so this spec does not.
//
// Proof (the unaided "apply" step and the delayed check) is only possible on teacher-reviewed WJEC
// flagship questions: on unreviewed content the apply stage honestly says "Nothing to run at this
// stage ... can be practised but not used as proof". So, like mission-recovery, the journey onboards
// WJEC Biology and gives one topic's written questions fixture approvals INSIDE THIS BROWSER PROFILE
// through the real review workflow (two named fixture reviewers -> audit log -> ledger -> trust
// predicate). Nothing is written to the repository's ledger and no trust rule is relaxed.

const PROOF_SUBJECT = "wjec-alevel-biology";

/** Fixture-review every written (non-MCQ, 2+ mark) question of the best-stocked topic; returns their ids. */
async function trustOneTopic(page: Page): Promise<string[]> {
  const questions = await readSubjectQuestions(page, PROOF_SUBJECT);
  const byTopic = new Map<string, string[]>();
  for (const q of questions) {
    if (q.kind === "mcq" || q.totalMarks < 2) continue;
    byTopic.set(q.topicIds[0]!, [...(byTopic.get(q.topicIds[0]!) ?? []), q.id]);
  }
  const [, ids] = [...byTopic].sort((a, b) => b[1].length - a[1].length)[0]!;
  expect(ids.length, "the paper journey needs sat, apply and delayed-proof questions in one topic").toBeGreaterThanOrEqual(4);
  const trusted = trustIdsViaWorkflow(questions, ids);
  expect(trusted.every((q) => q.verification === "verified")).toBe(true);
  await putQuestions(page, trusted);
  return ids;
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function openDb(page: Page) {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).map((d) => d.name!).find((n) => n === "revise");
    return name ?? null;
  });
}

async function seedPaper(page: Page, onlyIds: string[]) {
  expect(await openDb(page)).toBe("revise");
  return page.evaluate(async (onlyIds) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (store: string): Promise<Row[]> => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const cards = await all("cards");
    const userId = cards[0]!.userId as string;
    const allowed = new Set(onlyIds);
    const questions = (await all("questions")).filter((q) => allowed.has(q.id) && q.kind !== "mcq" && q.totalMarks >= 2);
    const byTopic = new Map<string, Row[]>();
    for (const q of questions) byTopic.set(q.topicIds[0], [...(byTopic.get(q.topicIds[0]) ?? []), q]);
    const [topic, pool] = [...byTopic].sort((a, b) => b[1].length - a[1].length)[0]!;
    const sat = pool.slice(0, 2);
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const paper = { id: "e2e-paper", userId, subjectId: sat[0]!.subjectId, title: "E2E mock paper", totalMarks: sat.reduce((s, q) => s + q.totalMarks, 0), questionIds: sat.map((q) => q.id), status: "practised", createdAt: ago(12) };
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
  }, onlyIds);
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

test("paper → lost marks → mission → repair → unaided practice → honest 'cannot be proven' → spaced practice check", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page, { examDate: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10), board: "WJEC", subjectNames: ["Biology"] });
  await page.waitForTimeout(3000);
  const { lost } = await seedPaper(page, await trustOneTopic(page));
  const main = page.locator("main#main");
  const paperReason = "official WJEC paper with teacher-reviewed marking";

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
  const next = main.getByRole("link", { name: /^Continue:/ });
  await expect(next).toBeVisible();
  await expect(next).toHaveAttribute("href", /^\//);

  // The unaided step on different questions still runs, honestly labelled as practice: the mission
  // says up front that these marks cannot be proven, and why.
  await page.goto(`/practice?mission=${encodeURIComponent(missionId)}&stage=apply`);
  await expect(page.getByRole("button", { name: /Start mission step/ })).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText("Nothing to run at this stage");
  await expect(main).toContainText("cannot be proven");
  await expect(main).toContainText(paperReason);
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await expect(page.getByRole("button", { name: /reveal a small cue/i })).toHaveCount(0);
  await runQuestionSet(page, await count(), true);
  await expect(main).toContainText("Session complete", { timeout: 30_000 });
  await expect(main).not.toContainText("delayed proof passed");

  // No proof step can ever be offered for these marks: asking for one explains why instead.
  await page.goto(`/practice?mission=${encodeURIComponent(missionId)}&stage=delayed-proof`);
  await expect(main).toContainText(paperReason, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Start mission step/ })).toHaveCount(0);

  // A week later the fix comes back as a spaced practice check, never as "Awaiting proof".
  await ageMissionAttempts(page, 8);
  await page.goto("/");
  const now = main.getByLabel("What to do now");
  await expect(now).toContainText(/Check it held/, { timeout: 40_000 });
  await expect(main).not.toContainText("Awaiting proof");
  await expect(main.getByRole("link", { name: "Start proof check", exact: true })).toHaveCount(0);
  await now.locator("summary", { hasText: "Why this?" }).click();
  await expect(now).toContainText(paperReason);
  await now.getByRole("link", { name: /Start/ }).first().click();
  await expect(page).toHaveURL(/mission=.*stage=practise/);
  await page.getByRole("button", { name: /Start mission step/ }).click();
  await runQuestionSet(page, await count(), true);
  await expect(main).toContainText("Session complete", { timeout: 30_000 });
  await expect(main).not.toContainText("delayed proof passed");

  // Nothing anywhere claims these marks are proven recovered.
  await page.goto("/readiness");
  // The ledger panel sits inside the collapsed "Detailed readiness and evidence" group.
  const panel = page.locator("section[aria-label='Marks recovered']");
  await expect(panel).toBeAttached({ timeout: 30_000 });
  await expect(panel).not.toContainText(/\b[1-9]\d*(\.\d)? marks? proven recovered/i);
  // The improvement story must not promise a check that can never come.
  await expect(main).not.toContainText("waiting for that check");
  await expect(main).toContainText(/recovered in practice, but cannot be proven/);
  await page.goto("/papers");
  await main.locator("summary", { hasText: "E2E mock paper" }).click();
  const after = main.getByLabel("Paper result").first();
  await expect(after).toContainText(/Improving/, { timeout: 30_000 });
  await expect(after).not.toContainText(/Proven|Awaiting proof/);
});
