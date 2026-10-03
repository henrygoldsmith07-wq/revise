import { expect, type Page } from "@playwright/test";

/**
 * Answers whatever question is on screen, using the app's own bank to find it: correctly means the
 * mark-scheme points (not the model answer, so it is not flagged as copied); incorrectly means a
 * wrong option or a blank-knowledge answer. Submits and waits for marking to finish.
 */
// The marker caps answers that only recite the mark scheme, so a correct answer adds wording of its own.
const OWN_WORDS = " In my own explanation, students compare several observations carefully, relate every stage to the underlying science, and justify conclusions with the evidence gathered during a practical investigation.";

export async function answerOnScreen(page: Page, correct: boolean): Promise<void> {
  await page.waitForTimeout(2500);
  const plan = await page.evaluate(async () => {
    type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const name = (await indexedDB.databases()).map((d) => d.name!).find((x) => x === "revise")!;
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const qs: Row[] = await new Promise((res) => { const r = db.transaction("questions").objectStore("questions").getAll(); r.onsuccess = () => res(r.result as Row[]); });
    const text = document.querySelector("main#main")!.textContent ?? "";
    const q = qs.filter((x) => x.stem && text.includes(String(x.stem).slice(0, 60))).sort((a, b) => b.stem.length - a.stem.length)[0];
    if (!q) return null;
    const options = (q.options ?? []) as string[];
    return {
      kind: q.kind as string,
      option: q.kind === "mcq" ? (options[q.correctIndex] as string) : null,
      wrong: q.kind === "mcq" ? (options.find((_, i) => i !== q.correctIndex) as string) : null,
      parts: (q.parts as Row[]).map((p) => (p.markScheme as string[]).join(". ")),
    };
  });
  expect(plan, "the question on screen should be in the bank").not.toBeNull();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (plan!.kind === "mcq") {
    await page.getByRole("radio", { name: new RegExp(esc((correct ? plan!.option : plan!.wrong)!)) }).first().click();
  } else {
    const boxes = page.getByLabel(/your answer/i);
    const count = await boxes.count();
    for (let i = 0; i < count; i++) await boxes.nth(i).fill(correct ? `${plan!.parts[i] ?? plan!.parts[0]!}.${OWN_WORDS}` : "I do not know");
  }
  const submit = page.getByRole("button", { name: /submit for marking/i }).first();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
}

/** Answers a fixed question set and steps through it to the summary. */
export async function runQuestionSet(page: Page, count: number, correct: boolean): Promise<void> {
  for (let n = 0; n < count; n++) {
    await answerOnScreen(page, correct);
    const next = page.getByRole("button", { name: /Next question|Finish session/ });
    await expect(next).toBeEnabled({ timeout: 40_000 });
    await next.scrollIntoViewIfNeeded();
    await next.click();
  }
}

