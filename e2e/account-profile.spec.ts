import { build } from "esbuild";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Exercise the actual AccountBoundary and IndexedDB profile/adoption code in a
// browser. Only Supabase transport and the study view are replaced: no remote
// credentials, generated approvals, or production test route are required.
let harness = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { AccountBoundary, useAccount } from "./src/state/account";
      function Controls() {
        const profile = useAccount();
        return <div><p data-testid="identity">{profile.userId}</p>
          <button onClick={() => window.changeAccount("11111111-1111-4111-8111-111111111111")}>Sign in A</button>
          <button onClick={() => window.changeAccount("22222222-2222-4222-8222-222222222222")}>Sign in B</button>
          <button onClick={() => window.changeAccount(null)}>Sign out</button>
        </div>;
      }
      createRoot(document.getElementById("root")).render(<AccountBoundary><Controls /></AccountBoundary>);
    `, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [{ name: "account-boundary-transport", setup(builder) {
      builder.onLoad({ filter: /src\/data\/supabase\.ts$/ }, () => ({ contents: `
        let notify;
        function session() {
          const id = localStorage.getItem("test.auth.account");
          return id ? { user: { id, email: id.startsWith("111") ? "a@example.com" : "b@example.com" } } : null;
        }
        window.changeAccount = (id) => {
          if (id) localStorage.setItem("test.auth.account", id); else localStorage.removeItem("test.auth.account");
          notify?.(id ? "SIGNED_IN" : "SIGNED_OUT", session());
        };
        export function getSupabase() { return { auth: {
          getSession: async () => ({ data: { session: session() }, error: null }),
          onAuthStateChange: (fn) => { notify = fn; return { data: { subscription: { unsubscribe() { notify = null; } } } }; },
        } }; }
      `, loader: "ts" }));
      builder.onLoad({ filter: /src\/state\/store\.tsx$/ }, () => ({ contents: `
        import React, { useEffect, useState } from "react";
        import { getDb } from "../data/db";
        export function StoreProvider({userId,children}) {
          const [state,setState] = useState(null);
          useEffect(() => { (async () => {
            const db = await getDb();
            if (userId === "local" && await db.count("cards") === 0) {
              const card = {id:"cnt:card:local-draft",userId,front:"Local draft"};
              await db.put("cards",card);
              await db.put("outbox",{id:"offline",ownerId:userId,entity:"cards",op:"upsert",payload:card,queuedAt:new Date().toISOString(),attempts:0});
              await db.put("meta",{key:"revise.interventionOutcomes.v1",value:[{id:"outcome",userId}]});
            }
            setState({cards:await db.getAll("cards"),queue:await db.getAll("outbox"),outcomes:(await db.get("meta","revise.interventionOutcomes.v1"))?.value ?? []});
          })(); }, [userId]);
          return state ? <div><pre data-testid="saved">{JSON.stringify(state)}</pre>{children}</div> : <p>Loading profile</p>;
        }
      `, loader: "tsx", resolveDir: path.resolve("src/state") }));
    } }],
  });
  harness = result.outputFiles[0].text;
});

async function openHarness(page: Page) {
  page.on("pageerror", (error) => console.error("Account harness:", error.message));
  await page.route("**/account-boundary-harness", (route) => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script src="/account-boundary-harness.js"></script>' }));
  await page.route("**/account-boundary-harness.js", (route) => route.fulfill({ contentType: "text/javascript", body: harness }));
  await page.goto("/account-boundary-harness");
  await expect(page.getByTestId("identity")).toBeVisible();
}

test("local adoption, refresh, sign-out and account switching preserve isolated profiles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openHarness(page);
  await expect(page.getByTestId("identity")).toHaveText("local");
  await expect(page.getByTestId("saved")).toContainText("Local draft");
  await page.getByRole("button", { name: "Sign in A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use your local revision?" })).toBeVisible();
  await expect(page.getByTestId("saved")).toHaveCount(0);
  await page.getByRole("button", { name: "Copy local revision" }).click();
  await expect(page.getByTestId("identity")).toHaveText("11111111-1111-4111-8111-111111111111");
  await expect(page.getByTestId("saved")).toContainText("Local draft");
  const adopted = await page.getByTestId("saved").textContent();
  expect(adopted).not.toContain('"userId":"local"');
  await page.reload();
  await expect(page.getByTestId("saved")).toHaveText(adopted!);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByTestId("identity")).toHaveText("local");
  await expect(page.getByTestId("saved")).toContainText('"userId":"local"');
  await page.getByRole("button", { name: "Sign in B", exact: true }).click();
  await expect(page.getByTestId("identity")).toHaveText("22222222-2222-4222-8222-222222222222");
  await expect(page.getByTestId("saved")).toHaveText('{"cards":[],"queue":[],"outcomes":[]}');
  await page.getByRole("button", { name: "Sign in A", exact: true }).click();
  await expect(page.getByTestId("saved")).toHaveText(adopted!);
  expect(errors).toEqual([]);
});

test("restores a magic-link-style cached account and supports declining adoption", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => localStorage.setItem("test.auth.account", "11111111-1111-4111-8111-111111111111"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Use your local revision?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep profiles separate" }).click();
  await expect(page.getByTestId("saved")).toHaveText('{"cards":[],"queue":[],"outcomes":[]}');
  await page.reload();
  await expect(page.getByTestId("identity")).toHaveText("11111111-1111-4111-8111-111111111111");
  await expect(page.getByRole("heading", { name: "Use your local revision?" })).toHaveCount(0);
});
