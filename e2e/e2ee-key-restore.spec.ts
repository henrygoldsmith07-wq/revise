import { webcrypto } from "node:crypto";
import { expect, test } from "@playwright/test";
import { completeOnboarding, todayOrOnboarding } from "./helpers";

// Restoring on a second device: the fingerprint is how a learner checks both
// devices hold the same key, so it must describe the key just pasted, not the
// one this device generated when encryption was switched on.
test("pasting a backed-up key asks before replacing this device's key, then shows the new key's fingerprint", async ({ page }) => {
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const jwk = JSON.stringify(await webcrypto.subtle.exportKey("jwk", key));
  const digest = await webcrypto.subtle.digest("SHA-256", await webcrypto.subtle.exportKey("raw", key));
  const expected = Buffer.from(digest).subarray(0, 8).toString("hex");

  await page.goto("/");
  if ((await todayOrOnboarding(page)) === "onboarding") await completeOnboarding(page);
  await page.goto("/settings");

  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Sync encryption" }) });
  await section.getByRole("button", { name: "Off" }).click();
  const fingerprint = section.getByText(/Key fingerprint: [0-9a-f]{16}/);
  await expect(fingerprint).toBeVisible();
  const generated = (await fingerprint.textContent())!.replace("Key fingerprint: ", "").trim();
  expect(generated).not.toBe(expected);

  await section.getByLabel("Paste a backed-up encryption key").fill(jwk);
  await section.getByRole("button", { name: "Use key" }).click();
  // A different key replaces this device's own, so it asks once, naming the key it replaces.
  await expect(section.getByRole("status")).toContainText(`This replaces this device's key (${generated})`);
  await expect(section.getByText(`Key fingerprint: ${generated}`)).toBeVisible();
  await section.getByRole("button", { name: "Replace key" }).click();
  await expect(section.getByRole("status")).toHaveText("Key installed. Pull your data to decrypt it here.");
  await expect(section.getByText(`Key fingerprint: ${expected}`)).toBeVisible();
});
