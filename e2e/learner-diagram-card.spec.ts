import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// A learner's own labelled diagram (image occlusion): photograph a figure,
// tap numbered points onto it, name them, and the card then works in
// "Label a diagram" like an authored one.

test("a learner builds a diagram card from their own image and labels it in Label a diagram", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Revision that knows what to do next").waitFor({ state: "visible", timeout: 60_000 });
  await completeOnboarding(page, { subjectNames: ["Biology"], skipExamDates: true });
  await expect(page.locator("main#main")).toBeVisible({ timeout: 60_000 });

  await page.goto("/library");
  const main = page.locator("main#main");
  await expect(main.getByText("Write a card")).toBeVisible({ timeout: 60_000 });
  await main.getByRole("radio", { name: "Diagram" }).or(main.getByRole("button", { name: "Diagram", exact: true })).first().click();

  // A topic with no authored diagram, so "Label a diagram" scoped to it shows only this card.
  const topicSelect = main.locator("section", { hasText: "Write a card" }).getByLabel("Topic");
  const topicId = await topicSelect.locator("option").last().getAttribute("value");
  expect(topicId).toBeTruthy();
  await topicSelect.selectOption(topicId!);

  await main.getByPlaceholder("Label the structure of the heart").fill("Label my sketch of the heart");
  // A real PNG, drawn in the page so the test needs no binary fixture.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fde68a";
    context.fillRect(0, 0, 400, 300);
    context.fillStyle = "#b91c1c";
    context.beginPath();
    context.arc(200, 150, 90, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  await main.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "heart.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });

  const image = main.getByRole("button", { name: /Diagram image/ });
  await expect(image).toBeVisible();
  // Measure only once the photo has decoded, or the box is the empty button.
  await expect.poll(() => image.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  const box = (await image.boundingBox())!;
  await image.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await image.click({ position: { x: box.width * 0.75, y: box.height * 0.7 } });
  await expect(main.getByRole("list", { name: "Diagram points" }).getByRole("listitem")).toHaveCount(2);
  await expect(main.getByText("Name point 1, or remove it.")).toBeVisible();
  await main.getByLabel("Label for point 1").fill("Left atrium");
  await main.getByLabel("Label for point 2").fill("Aorta");

  await main.getByRole("button", { name: "Add card" }).click();
  await expect(main.getByText("Saved — it is due in your next review.")).toBeVisible();

  await page.goto(`/study?topic=${encodeURIComponent(topicId!)}`);
  await expect(main).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /More ways to study/i }).click();
  await page.getByRole("button", { name: "Start label a diagram" }).click();
  await expect(main.getByRole("img", { name: "Unlabelled diagram for Label my sketch of the heart" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Unlabelled point" })).toHaveCount(2);

  // Place both labels on the points they were drawn at.
  await main.getByRole("button", { name: "Aorta", exact: true }).click();
  await main.getByRole("button", { name: "Unlabelled point" }).nth(1).click();
  await main.getByRole("button", { name: "Left atrium", exact: true }).click();
  await main.getByRole("button", { name: "Unlabelled point" }).first().click();
  await expect(main.getByText("All 2 labelled")).toBeVisible();
  await page.screenshot({ path: "test-results/learner-diagram-card.png", fullPage: true });
});
