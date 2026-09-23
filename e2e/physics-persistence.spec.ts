import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, serviceWorkerReady, todayOrOnboarding } from "./helpers";

const questionId = "cnt:question:physics-motion-graph-reversal-triangles";
type SavedAttempt = { id: string; questionId: string; subjectId: string; elapsedMs: number; answers: Record<string, string> };
async function savedAttempts(page: Page): Promise<SavedAttempt[]> {
  return page.evaluate(() => new Promise<SavedAttempt[]>((resolve, reject) => {
    const opening = indexedDB.open("revise");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction("attempts", "readonly").objectStore("attempts").getAll();
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

test("Physics answer evidence survives reload and an offline PWA load", async ({ page, context }) => {
  await page.route("**/api/ai", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "test: no AI provider" }),
  }));
  await page.goto("/");
  if (await todayOrOnboarding(page) === "onboarding") {
    await completeOnboarding(page, { board: "WJEC", subjectNames: ["Physics"], skipExamDates: true });
  }
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60000 });
  await page.goto("/practice?question=" + questionId);
  await expect(page.locator("main#main")).toContainText("shuttle");
  const response = "Acceleration = -1.5 m/s^2. It reverses at 4 s. The areas are +12 m and -3 m, so displacement is 9 m and distance is 15 m.";
  await page.getByLabel("Your answer").first().fill(response);
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect.poll(async () => (await savedAttempts(page)).filter(a => a.questionId === questionId).length).toBe(1);
  const recorded = (await savedAttempts(page)).find(a => a.questionId === questionId)!;
  expect(recorded.subjectId).toBe("wjec-alevel-physics");
  expect(Object.values(recorded.answers)).toContain(response);
  expect(recorded.elapsedMs).toBeGreaterThan(0);
  await serviceWorkerReady(page);
  // Warm the route under the installed worker before cutting the network.
  await page.reload();
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60000 });
  expect((await savedAttempts(page)).filter(a => a.questionId === questionId)).toEqual([recorded]);
});
