import { expect, test, type Page } from "@playwright/test";

// A GCSE physics student (AQA) at 360px. GCSE physics used to be the WJEC
// A-level course; it now builds from the DfE GCSE subject content. The
// onboarding note, the lessons and the flashcards must all be GCSE.
const A_LEVEL_ONLY = /photoelectric|simple harmonic|gravitational potential(?! energy)|centripetal|Young modulus|internal resistance/i;

async function onboardAqaGcse(page: Page, subject: RegExp = /Physics/) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });

  const board = page.getByRole("button", { name: /AQA/i }).first();
  await expect(async () => {
    await board.click();
    await expect(board).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Continue$/i }).click();

  await page.getByRole("button", { name: /unverified preview/i }).first().click();
  // The GCSE row names the subjects that follow the GCSE content.
  await expect(page.getByText(/Except (Chemistry and Physics|Physics and Chemistry): their topics follow the DfE GCSE subject content/)).toBeVisible();
  await page.getByRole("group", { name: "GCSE unverified preview subjects" }).getByRole("button", { name: subject }).click();
  await page.getByRole("button", { name: /Continue/i }).click();
  const finalCta = page.getByRole("button", { name: /Start my quick check|Build my plan|Start revising|Finish/i });
  for (let step = 0; step < 4 && !(await finalCta.isVisible().catch(() => false)); step++) {
    await page.getByRole("button", { name: /^Continue$/i }).click();
  }
  await finalCta.click();
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

}

test("a GCSE physics student is taught GCSE physics, not A-level", async ({ page }) => {
  test.setTimeout(180_000);
  await onboardAqaGcse(page);

  // Lessons: the GCSE outline, under the DfE headings.
  await page.goto("/lesson?subject=aqa-gcse-physics");
  const main = page.locator("main#main");
  await expect(main).toContainText("Energy stores, transfers and power", { timeout: 30_000 });
  await expect(main).toContainText("Stopping distances and road safety");
  await expect(main).not.toContainText(A_LEVEL_ONLY);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);

  // Flashcards: GCSE key points only; no A-level card is offered.
  await page.goto("/review?subject=aqa-gcse-physics");
  const show = main.getByRole("button", { name: /Show answer/ }).first();
  await expect(show).toBeVisible({ timeout: 30_000 });
  for (let card = 0; card < 3; card++) {
    await expect(main).not.toContainText(A_LEVEL_ONLY);
    if (!(await show.isVisible().catch(() => false))) break;
    await show.click();
    await expect(main).not.toContainText(A_LEVEL_ONLY);
    await main.getByRole("button", { name: /^Good/ }).first().click();
    await expect(main.getByRole("button", { name: /^Good/ })).toHaveCount(0, { timeout: 15_000 });
  }
});

// A lost mark recorded before the GCSE outline existed sits on an A-level
// topic id the subject no longer has. Its question survived, retagged; the
// mistake is read on the GCSE topic it now tests, never shown as a raw id.
test("a mistake on a topic the GCSE course no longer has is read on its GCSE topic", async ({ page }) => {
  test.setTimeout(180_000);
  await onboardAqaGcse(page);
  await page.evaluate(async () => {
    type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const cards: Row[] = await new Promise((res) => { const r = db.transaction("cards").objectStore("cards").getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const userId = cards[0]!.userId as string;
    const questionId = "cnt:question:gcse-expansion-aqa-gcse-physics-acceleration-calculation";
    const at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const today = new Date().toLocaleDateString("en-CA");
    const tx = db.transaction(["attempts", "mistakes", "plannedSessions"], "readwrite");
    tx.objectStore("plannedSessions").put({
      id: "old-block", userId, date: today, startMinute: 23 * 60, minutes: 30, subjectId: "aqa-gcse-physics",
      topicId: "aqa-gcse-physics.kinematics-dynamics", activity: "practice", reason: "Weakest topic", status: "pending",
    });
    tx.objectStore("attempts").put({
      id: "old-att", userId, questionId, subjectId: "aqa-gcse-physics", topicIds: ["aqa-gcse-physics.kinematics-dynamics"], answers: {},
      marked: [{ partId: `${questionId}:0:aqa-gcse-physics.kinematics-dynamics.sp-01`, awarded: 0, max: 3, points: [] }],
      awarded: 0, max: 3, feedback: "", markedBy: "rubric", elapsedMs: 90_000, mode: "practice", createdAt: at,
    });
    tx.objectStore("mistakes").put({
      id: "old-m", userId, subjectId: "aqa-gcse-physics", topicId: "aqa-gcse-physics.kinematics-dynamics", questionId, attemptId: "old-att",
      marksLost: 3, description: "Divided the wrong way round", category: "method", resolved: false, createdAt: at,
    });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  const pendingOnOldTopic = () => page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("revise"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rows: Array<{ topicId?: string; status: string }> = await new Promise((res) => { const r = db.transaction("plannedSessions").objectStore("plannedSessions").getAll(); r.onsuccess = () => res(r.result); });
    db.close();
    return rows.filter((row) => row.status === "pending" && row.topicId === "aqa-gcse-physics.kinematics-dynamics").length;
  });
  await page.goto("/");
  const main = page.locator("main#main");
  await expect(main).toContainText(/Speed, velocity and acceleration/, { timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText("kinematics-dynamics");
  // The plan block on the old topic is rebuilt at boot, with nothing else changed,
  // and in the same visit Schedule says why without being asked.
  await expect.poll(pendingOnOldTopic, { timeout: 30_000 }).toBe(0);
  // At phone width Schedule sits in the bottom bar's Tools sheet.
  const scheduleLink = page.locator('a[href="/schedule"]:visible');
  if (!(await scheduleLink.count())) await page.locator("summary:visible", { hasText: "Tools" }).first().click();
  await scheduleLink.first().click();
  await expect(page.getByTestId("schedule-replan-summary")).toContainText("a subject's topic list changed", { timeout: 30_000 });
  await expect(page.locator('a[href*="kinematics-dynamics"]')).toHaveCount(0);
  await page.goto("/study");
  await expect(main).toContainText(/Speed, velocity and acceleration/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("kinematics-dynamics");
});

// GCSE chemistry builds from the DfE chemistry content too (pass 120).
const CHEM_A_LEVEL_ONLY = /\bKc\b|order of reaction|electrode potential|ionisation energ|d-orbital|ligand|oxidation state|NMR|Tollens|nucleophil/i;

test("a GCSE chemistry student is taught GCSE chemistry, not A-level", async ({ page }) => {
  test.setTimeout(180_000);
  await onboardAqaGcse(page, /Chemistry/);
  const main = page.locator("main#main");
  await page.goto("/lesson?subject=aqa-gcse-chemistry");
  await expect(main).toContainText("Atoms, isotopes and the model of the atom", { timeout: 30_000 });
  await expect(main).toContainText("Percentage yield and atom economy");
  await expect(main).not.toContainText(CHEM_A_LEVEL_ONLY);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
  await page.goto("/review?subject=aqa-gcse-chemistry");
  const show = main.getByRole("button", { name: /Show answer/ }).first();
  await expect(show).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText(CHEM_A_LEVEL_ONLY);
  await show.click();
  await expect(main).not.toContainText(CHEM_A_LEVEL_ONLY);
});
